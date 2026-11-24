import { supabase, json, parse, sha, mail, sameOrigin, validSessionToken, requestError, consumeRateLimit, escapeHtml } from './_shared.js';

function normalizePublicAssessment(raw, submittedAt) {
  const assessment = JSON.parse(JSON.stringify(raw));
  const answerIdPattern = /^(?:q(?:[1-9]|1[0-8])|ppcp_(?:0[1-9]|1\d|20)|(?:auto|bi|adm|proj)_\d{2}|(?:ind|com|srv|con|agr|log|sau|out)_\d{2}|ctx_[a-z0-9_]{2,70}|prod_[a-z0-9_]{1,55})$/;
  const validLevels = new Set(['1','2','3','4','5','ns','na']);
  const validConfidence = new Set(['alta','media','baixa']);
  const answers = assessment.answers && typeof assessment.answers === 'object' && !Array.isArray(assessment.answers)
    ? assessment.answers : {};
  const safeAnswers = {};
  for (const [id, rawAnswer] of Object.entries(answers).slice(0, 500)) {
    if (!answerIdPattern.test(id) || !rawAnswer || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) continue;
    const rawLevel = String(rawAnswer.level ?? '');
    const level = validLevels.has(rawLevel) ? (/^[1-5]$/.test(rawLevel) ? Number(rawLevel) : rawLevel) : '';
    const evidence = typeof rawAnswer.evidence === 'string' ? rawAnswer.evidence.slice(0, 5000) : '';
    safeAnswers[id] = {
      level,
      evidence,
      // No fluxo público, a evidência é apenas indicada pelo respondente.
      // A validação consultiva só pode ser registrada em fluxo autenticado.
      evStatus: evidence.trim() ? 'indicada' : 'nenhuma',
      confidence: validConfidence.has(String(rawAnswer.confidence || '')) ? String(rawAnswer.confidence) : '',
      respondent: typeof rawAnswer.respondent === 'string' ? rawAnswer.respondent.slice(0, 100) : '',
      validatedLevel: '',
      validator: '',
      validatedAt: ''
    };
  }
  assessment.answers = safeAnswers;

  assessment.opportunities = (Array.isArray(assessment.opportunities) ? assessment.opportunities : [])
    .slice(0, 100)
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      ...item,
      status: 'Proposta',
      approvedPriority: '',
      approvedBy: '',
      approvedAt: ''
    }));

  if (!assessment.weights || typeof assessment.weights !== 'object' || Array.isArray(assessment.weights)) assessment.weights = {};
  assessment.weights.reviewedBy = '';
  assessment.weights.reviewedAt = '';
  assessment.stage = 'triagem';
  assessment.log = [];
  assessment.submission_meta = {
    channel: 'public_invitation',
    validation_status: 'not_consultatively_verified',
    submitted_at: submittedAt
  };
  return assessment;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env), hash = await sha(token);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'assessment-submit', hash, 5, 900)) ||
        !(await consumeRateLimit(env, db, 'assessment-submit-ip', ip, 30, 900))) {
      return json(429, { error: 'Muitas tentativas de envio. Aguarde alguns minutos e tente novamente.' });
    }
    const { data: invitation, error } = await db.from('m360_invitations').select('id,company_name,status,expires_at').eq('token_hash', hash).single();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    if (invitation.status === 'concluída') return json(409, { error: 'Esta avaliação já foi concluída' });
    const body = await parse(request, 1024 * 1024), rawAssessment = body.assessment;
    if (!rawAssessment || typeof rawAssessment !== 'object' || Array.isArray(rawAssessment)) return json(400, { error: 'Avaliação inválida' });
    const now = new Date().toISOString();
    const assessment = normalizePublicAssessment(rawAssessment, now);
    const companyName = String(assessment.context?.company || invitation.company_name || '').trim().slice(0, 180);
    const { data: completionStatus, error: completionError } = await db.rpc('complete_m360_assessment', {
      p_invitation_id: invitation.id,
      p_payload: assessment,
      p_company_name: companyName,
      p_submitted_at: now
    });
    if (completionError) return json(500, { error: 'Não foi possível registrar a avaliação. Tente novamente.' });
    if (completionStatus === 'not_found') return json(404, { error: 'Convite não encontrado' });
    if (completionStatus === 'expired') return json(410, { error: 'Este link expirou' });
    if (completionStatus === 'already_completed') return json(409, { error: 'Esta avaliação já foi concluída' });
    if (completionStatus !== 'completed') return json(400, { error: 'Dados da avaliação inválidos' });
    if (env.NOTIFICATION_EMAIL) {
      try {
        await mail(env, { to: env.NOTIFICATION_EMAIL, subject: 'Mapeamento 360 · Autoavaliação concluída', html: `<p>Uma autoavaliação foi concluída.</p><p><b>Empresa:</b> ${escapeHtml(companyName)}</p><p>Entre no painel administrativo para consultar o status e acessar o registro.</p>` });
      } catch (error) { /* A avaliação permanece registrada mesmo se a notificação falhar. */ }
    }
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: 'Falha interna ao registrar a avaliação' });
  }
}
