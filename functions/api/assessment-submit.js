import { supabase, json, parse, sha, mail, sameOrigin, validSessionToken, consumeRateLimit, escapeHtml } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env);
    const hash = await sha(token);
    if (!(await consumeRateLimit(env, db, 'assessment-submit', hash, 5, 900))) return json(429, { error: 'Muitas tentativas de envio. Aguarde alguns minutos e tente novamente.' });
    const { data: invitation, error } = await db.from('m360_invitations').select('id,company_name,status,expires_at').eq('token_hash', hash).maybeSingle();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    const body = await parse(request, 1024 * 1024);
    const assessment = body.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return json(400, { error: 'Avaliação inválida' });
    const now = new Date().toISOString();
    const companyName = String(assessment.context?.company || invitation.company_name || '').trim().slice(0, 180);
    const { data: completionStatus, error: completionError } = await db.rpc('complete_m360_assessment', {
      p_invitation_id: invitation.id, p_payload: assessment, p_company_name: companyName, p_submitted_at: now
    });
    if (completionError) return json(500, { error: 'Não foi possível registrar a avaliação. Tente novamente.' });
    if (completionStatus === 'not_found') return json(404, { error: 'Convite não encontrado' });
    if (completionStatus === 'expired') return json(410, { error: 'Este link expirou' });
    if (completionStatus === 'already_completed') return json(409, { error: 'Esta avaliação já foi concluída' });
    if (completionStatus !== 'completed') return json(400, { error: 'Dados da avaliação inválidos' });
    if (env.NOTIFICATION_EMAIL) {
      try {
        await mail(env, { to: env.NOTIFICATION_EMAIL, subject: 'Mapeamento 360 · Autoavaliação concluída', html: '<p>Uma autoavaliação foi concluída.</p><p><b>Empresa:</b> ' + escapeHtml(companyName) + '</p><p>Entre no painel administrativo para consultar o status e acessar o registro.</p>' });
      } catch (error) { /* A avaliação permanece registrada mesmo se a notificação falhar. */ }
    }
    return json(200, { ok: true });
  } catch (error) {
    const status = Number(error?.status);
    if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
    return json(500, { error: 'Falha interna ao registrar a avaliação' });
  }
}
