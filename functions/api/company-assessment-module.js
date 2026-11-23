import { supabase, json, parse, sameOrigin } from './_shared.js';

const MODULES = new Set([
  'geral', 'segmento', 'contexto_industrial', 'ppcp',
  'automacao', 'dados_bi', 'administrativo', 'projetos'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}
function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado.' });
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Método não permitido.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });

  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor) return json(401, { error: 'Sessão inválida.' });

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (membershipError) return json(500, { error: 'Não foi possível validar suas permissões.' });
    if (!membership || membership.status !== 'active') return json(403, { error: 'Sua conta não possui vínculo ativo com uma empresa.' });

    if (request.method === 'GET') {
      const assessmentId = new URL(request.url).searchParams.get('assessment_id') || '';
      if (!UUID.test(assessmentId)) return json(400, { error: 'Avaliação inválida.' });

      const { data: assessment, error: assessmentError } = await db
        .from('m360_assessments')
        .select('id,title,status,shared_payload,final_payload,schema_version,updated_at,completed_at')
        .eq('id', assessmentId)
        .eq('company_id', membership.company_id)
        .maybeSingle();
      if (assessmentError) return json(500, { error: 'Não foi possível consultar a avaliação.' });
      if (!assessment) return json(404, { error: 'Avaliação não encontrada nesta empresa.' });

      let query = db.from('m360_assessment_modules')
        .select('assessment_id,company_id,module_id,assigned_user_id,status,answers,updated_by,assigned_at,updated_at,completed_at')
        .eq('assessment_id', assessmentId)
        .eq('company_id', membership.company_id)
        .order('module_id');
      if (membership.role !== 'admin') query = query.eq('assigned_user_id', actor.id);
      const { data: modules, error: modulesError } = await query;
      if (modulesError) return json(500, { error: 'Não foi possível carregar os módulos.' });
      if (membership.role !== 'admin' && !modules?.length) return json(403, { error: 'Você não possui módulos atribuídos nesta avaliação.' });

      const safeAssessment = { ...assessment };
      if (membership.role !== 'admin' && safeAssessment.shared_payload && typeof safeAssessment.shared_payload === 'object') {
        safeAssessment.shared_payload = { ...safeAssessment.shared_payload };
        delete safeAssessment.shared_payload.legacy_unmapped_answers;
      }
      return json(200, { ok: true, role: membership.role, assessment: safeAssessment, modules: modules || [] });
    }

    const body = await parse(request, 600 * 1024);
    const action = String(body.action || '');
    const assessmentId = String(body.assessment_id || '');
    const moduleId = String(body.module_id || '');
    if (!UUID.test(assessmentId)) return json(400, { error: 'Avaliação inválida.' });

    if (action === 'complete') {
      if (membership.role !== 'admin') return json(403, { error: 'Somente o administrador pode concluir a avaliação da empresa.' });
      const { data: completed, error: completionError } = await db.rpc('complete_m360_company_assessment', {
        p_assessment_id: assessmentId,
        p_company_id: membership.company_id,
        p_user_id: actor.id
      });
      if (completionError) {
        const message = String(completionError.message || '');
        const safe = /módulos não concluídos|duplicados|não possui módulos|inconsistentes|arquivada|não foi encontrada/i.test(message)
          ? message : 'Não foi possível concluir a avaliação. Verifique os módulos e tente novamente.';
        return json(409, { error: safe });
      }
      return json(200, { ok: true, result: completed });
    }

    if (!MODULES.has(moduleId)) return json(400, { error: 'Módulo inválido.' });

    const { data: assessment, error: assessmentError } = await db
      .from('m360_assessments')
      .select('id,status,updated_at')
      .eq('id', assessmentId)
      .eq('company_id', membership.company_id)
      .maybeSingle();
    if (assessmentError) return json(500, { error: 'Não foi possível validar a avaliação.' });
    if (!assessment) return json(404, { error: 'Avaliação não encontrada nesta empresa.' });
    if (assessment.status === 'completed' || assessment.status === 'archived') {
      return json(409, { error: 'Esta avaliação não está aberta para alterações.' });
    }

    if (action === 'update_shared') {
      if (membership.role !== 'admin') return json(403, { error: 'Somente administradores podem alterar os dados gerais da avaliação.' });
      const shared = body.shared_payload;
      if (!validObject(shared) || Object.prototype.hasOwnProperty.call(shared, 'answers')) {
        return json(400, { error: 'Os dados compartilhados são inválidos.' });
      }
      const expected = String(body.expected_updated_at || '');
      if (!expected || expected !== assessment.updated_at) {
        return json(409, { error: 'Os dados gerais foram atualizados em outra sessão. Recarregue antes de salvar.' });
      }
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await db.from('m360_assessments')
        .update({ shared_payload: shared, updated_by: actor.id, updated_at: now })
        .eq('id', assessmentId)
        .eq('company_id', membership.company_id)
        .eq('updated_at', expected)
        .select('id,title,status,shared_payload,schema_version,updated_at')
        .maybeSingle();
      if (updateError) return json(500, { error: 'Não foi possível salvar os dados gerais da avaliação.' });
      if (!updated) return json(409, { error: 'Os dados gerais mudaram durante o salvamento. Recarregue e tente novamente.' });
      return json(200, { ok: true, assessment: updated });
    }

    if (action === 'assign') {
      if (membership.role !== 'admin') return json(403, { error: 'Somente administradores podem distribuir módulos.' });
      const assignedUserId = body.assigned_user_id == null || body.assigned_user_id === ''
        ? null : String(body.assigned_user_id);
      if (assignedUserId && !UUID.test(assignedUserId)) return json(400, { error: 'Participante inválido.' });

      if (assignedUserId) {
        const { data: target, error: targetError } = await db.from('m360_company_members')
          .select('user_id,status')
          .eq('company_id', membership.company_id)
          .eq('user_id', assignedUserId)
          .maybeSingle();
        if (targetError) return json(500, { error: 'Não foi possível validar o participante.' });
        if (!target || target.status !== 'active') return json(400, { error: 'O participante não está ativo nesta empresa.' });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await db.from('m360_assessment_modules')
        .update({
          assigned_user_id: assignedUserId,
          assigned_at: assignedUserId ? now : null,
          updated_at: now,
          updated_by: actor.id
        })
        .eq('assessment_id', assessmentId)
        .eq('company_id', membership.company_id)
        .eq('module_id', moduleId)
        .select('assessment_id,module_id,assigned_user_id,status,updated_at')
        .maybeSingle();
      if (updateError) return json(500, { error: 'Não foi possível distribuir o módulo.' });
      if (!updated) return json(404, { error: 'Módulo não encontrado nesta avaliação.' });
      return json(200, { ok: true, module: updated });
    }

    if (action === 'save') {
      const { data: current, error: currentError } = await db.from('m360_assessment_modules')
        .select('assigned_user_id,status,updated_at')
        .eq('assessment_id', assessmentId)
        .eq('company_id', membership.company_id)
        .eq('module_id', moduleId)
        .maybeSingle();
      if (currentError) return json(500, { error: 'Não foi possível consultar o módulo.' });
      if (!current) return json(404, { error: 'Módulo não encontrado nesta avaliação.' });
      if (membership.role !== 'admin' && current.assigned_user_id !== actor.id) {
        return json(403, { error: 'Você só pode responder aos módulos atribuídos à sua conta.' });
      }

      const answers = body.answers;
      if (!validObject(answers)) return json(400, { error: 'As respostas do módulo são inválidas.' });
      const status = body.status === undefined ? current.status : String(body.status);
      if (!['pending', 'in_progress', 'completed'].includes(status)) return json(400, { error: 'Status do módulo inválido.' });
      const expected = String(body.expected_updated_at || '');
      if (!expected || expected !== current.updated_at) {
        return json(409, { error: 'Este módulo foi atualizado em outra sessão. Recarregue os dados antes de salvar.' });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await db.from('m360_assessment_modules')
        .update({
          answers,
          status,
          updated_by: actor.id,
          updated_at: now,
          completed_at: status === 'completed' ? now : null
        })
        .eq('assessment_id', assessmentId)
        .eq('company_id', membership.company_id)
        .eq('module_id', moduleId)
        .eq('updated_at', expected)
        .select('assessment_id,module_id,assigned_user_id,status,answers,updated_at,completed_at')
        .maybeSingle();

      if (updateError) return json(500, { error: 'Não foi possível salvar as respostas do módulo.' });
      if (!updated) return json(409, { error: 'O módulo mudou durante o salvamento. Recarregue os dados e tente novamente.' });

      await db.from('m360_assessments').update({
        status: 'in_progress'
      }).eq('id', assessmentId).eq('company_id', membership.company_id).eq('status', 'draft');

      return json(200, { ok: true, module: updated });
    }

    return json(400, { error: 'Operação inválida.' });
  } catch {
    return json(500, { error: 'Falha interna ao acessar o módulo.' });
  }
}
