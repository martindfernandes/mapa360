import { supabase, json, parse, sha, mail, sameOrigin, validSessionToken, requestError, consumeRateLimit, escapeHtml } from './_shared.js';

const PUBLIC_MODULES = new Set([
  'geral', 'segmento', 'contexto_industrial', 'ppcp',
  'automacao', 'dados_bi', 'administrativo', 'projetos'
]);
const PUBLIC_SECTORS = {
  'Indústria': ['ind_01','ind_02','ind_03','ind_04','ind_05'],
  'Comércio / Distribuição': ['com_01','com_02','com_03','com_04','com_05','com_06','com_07','com_08'],
  'Serviços': ['srv_01','srv_02','srv_03','srv_04','srv_05','srv_06','srv_07','srv_08'],
  'Construção': ['con_01','con_02','con_03','con_04','con_05','con_06','con_07','con_08'],
  'Agronegócio': ['agr_01','agr_02','agr_03','agr_04','agr_05','agr_06','agr_07','agr_08'],
  'Logística': ['log_01','log_02','log_03','log_04','log_05','log_06'],
  'Saúde': ['sau_01','sau_02','sau_03','sau_04','sau_05','sau_06'],
  'Outro': ['out_01','out_02','out_03','out_04','out_05','out_06']
};
const PUBLIC_BRANCH_QUESTIONS = {
  'Sucroenergético': ['ctx_sucro_ciclo','ctx_sucro_criticidade','ctx_sucro_campo'],
  'Sucroalcooleiro': ['ctx_sucroalco_ciclo','ctx_sucroalco_rastreio'],
  'Metalmecânico': ['ctx_metal_cap','ctx_metal_desenho','ctx_metal_custo'],
  'Mineração': ['ctx_mina_ambiente','ctx_mina_dispon'],
  'Papel e celulose': ['ctx_papel_parada']
};
const PUBLIC_MODULE_QUESTIONS = {
  ppcp: Array.from({length:20},(_,i)=>'ppcp_'+String(i+1).padStart(2,'0')),
  automacao: Array.from({length:10},(_,i)=>'auto_'+String(i+1).padStart(2,'0')),
  dados_bi: Array.from({length:10},(_,i)=>'bi_'+String(i+1).padStart(2,'0')),
  administrativo: Array.from({length:10},(_,i)=>'adm_'+String(i+1).padStart(2,'0')),
  projetos: Array.from({length:10},(_,i)=>'proj_'+String(i+1).padStart(2,'0'))
};
const PUBLIC_GENERAL_QUESTIONS = Array.from({length:18},(_,i)=>'q'+(i+1));

function publicSlugKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,55);
}

function activePublicQuestionIds(context) {
  const selected = new Set(context.selectedModules);
  const ids = [...PUBLIC_GENERAL_QUESTIONS];

  if (selected.has('segmento')) ids.push(...PUBLIC_SECTORS[context.sector]);
  if (selected.has('contexto_industrial')) {
    for (const branch of context.branches) {
      const bank = PUBLIC_BRANCH_QUESTIONS[branch];
      const branchIds = bank || ['ctx_branch_' + publicSlugKey(branch)];
      ids.push(...branchIds);
    }
    for (const product of context.products) {
      const key = publicSlugKey(product);
      if (key) ids.push('prod_' + key);
    }
  }
  for (const moduleId of ['ppcp','automacao','dados_bi','administrativo','projetos']) {
    if (selected.has(moduleId)) ids.push(...PUBLIC_MODULE_QUESTIONS[moduleId]);
  }
  return [...new Set(ids)];
}

function normalizePublicAssessment(raw, submittedAt) {
  const assessment = JSON.parse(JSON.stringify(raw));
  if (!assessment.context || typeof assessment.context !== 'object' || Array.isArray(assessment.context)) {
    throw new Error('Informe o contexto da avaliação.');
  }

  const context = assessment.context;
  const selectedInput = context.selectedModules == null ? ['geral'] : context.selectedModules;
  if (!Array.isArray(selectedInput) || selectedInput.length > PUBLIC_MODULES.size) {
    throw new Error('A seleção de módulos da avaliação é inválida.');
  }
  const selectedModules = [...new Set(selectedInput)];
  if (selectedModules.some(id => typeof id !== 'string' || !PUBLIC_MODULES.has(id))) {
    throw new Error('A avaliação contém um módulo desconhecido.');
  }
  if (!selectedModules.includes('geral')) selectedModules.unshift('geral');

  const sector = typeof context.sector === 'string' ? context.sector.trim() : '';
  if (sector && !Object.prototype.hasOwnProperty.call(PUBLIC_SECTORS, sector)) {
    throw new Error('O segmento informado não é válido.');
  }
  if (selectedModules.includes('segmento') && !sector) {
    throw new Error('Informe o segmento da empresa para concluir as perguntas específicas.');
  }

  const normalizeContextList = (value, label, maxItems) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > maxItems ||
        value.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 120)) {
      throw new Error('A lista de ' + label + ' está inválida.');
    }
    const normalized = [...new Set(value.map(item => item.trim()))];
    if (normalized.some(item => !publicSlugKey(item))) {
      throw new Error('Existe um item inválido na lista de ' + label + '.');
    }
    return normalized;
  };
  const branches = normalizeContextList(context.branches, 'ramos', 20);
  const products = normalizeContextList(context.products, 'produtos', 50);
  const branchSlugs = branches.map(publicSlugKey);
  const productSlugs = products.map(publicSlugKey);
  if (new Set(branchSlugs).size !== branchSlugs.length || new Set(productSlugs).size !== productSlugs.length) {
    throw new Error('Existem ramos ou produtos que geram identificadores repetidos. Revise os itens cadastrados.');
  }
  if (selectedModules.includes('contexto_industrial') && !branches.length && !products.length) {
    throw new Error('Informe ao menos um ramo ou produto para concluir o módulo de contexto.');
  }

  context.selectedModules = selectedModules;
  context.sector = sector;
  context.branches = branches;
  context.products = products;

  const activeIds = activePublicQuestionIds(context);
  if (activeIds.length > 250) throw new Error('A avaliação excede o limite de perguntas permitido.');

  const validLevels = new Set(['1','2','3','4','5','ns','na']);
  const validConfidence = new Set(['alta','media','baixa']);
  const answers = assessment.answers && typeof assessment.answers === 'object' && !Array.isArray(assessment.answers)
    ? assessment.answers : {};
  const safeAnswers = {};
  for (const id of activeIds) {
    const rawAnswer = answers[id];
    if (!rawAnswer || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) continue;
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

  const missing = activeIds.filter(id => !safeAnswers[id] || !validLevels.has(String(safeAnswers[id].level)));
  if (missing.length) {
    const error = new Error('Ainda existem ' + missing.length + ' pergunta(s) obrigatória(s) sem resposta. Responda com uma nota de 1 a 5, “Não sei informar” ou “Não se aplica”.');
    error.code = 'INCOMPLETE_ASSESSMENT';
    error.missingCount = missing.length;
    error.missingIds = missing.slice(0, 20);
    throw error;
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
    instrument_version: '3.2.0',
    active_question_count: activeIds.length,
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
    let assessment;
    try {
      assessment = normalizePublicAssessment(rawAssessment, now);
    } catch (validationError) {
      if (validationError?.code === 'INCOMPLETE_ASSESSMENT') {
        return json(400, {
          error: validationError.message,
          missing_count: validationError.missingCount,
          missing_ids: validationError.missingIds
        });
      }
      return json(400, { error: validationError?.message || 'Dados da avaliação inválidos.' });
    }
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
