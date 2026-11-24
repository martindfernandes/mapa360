import { supabase, json, parse, sameOrigin, consumeRateLimit } from './_shared.js';

const MODULES = new Set([
  'geral', 'segmento', 'contexto_industrial', 'ppcp',
  'automacao', 'dados_bi', 'administrativo', 'projetos'
]);

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export async function onRequest({ request, env }) {
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) return json(404, { error: 'Não encontrado.' });
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Método não permitido.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });

  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor) return json(401, { error: 'Sessão inválida.' });
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'company-assessments-user', actor.id, 90, 900)) ||
        !(await consumeRateLimit(env, db, 'company-assessments-ip', ip, 240, 900))) {
      return json(429, { error: 'Muitas operações de avaliação. Aguarde alguns instantes e tente novamente.' });
    }

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status')
      .eq('user_id', actor.id)
      .maybeSingle();

    if (membershipError) return json(500, { error: 'Não foi possível validar o vínculo com a empresa.' });
    if (!membership || membership.status !== 'active') return json(403, { error: 'Sua conta não possui vínculo ativo com uma empresa.' });

    if (request.method === 'GET') {
      const { data: assessments, error } = await db
        .from('m360_assessments')
        .select('id,title,status,schema_version,created_at,updated_at,completed_at,source_assessment_id,shared_payload')
        .eq('company_id', membership.company_id)
        .order('created_at', { ascending: false });
      if (error) return json(500, { error: 'Não foi possível carregar as avaliações.' });

      const ids = (assessments || []).map(item => item.id);
      let modules = [];
      if (ids.length) {
        let query = db.from('m360_assessment_modules')
          .select('assessment_id,module_id,assigned_user_id,status,updated_at,completed_at')
          .eq('company_id', membership.company_id)
          .in('assessment_id', ids);
        if (membership.role !== 'admin') query = query.eq('assigned_user_id', actor.id);
        const result = await query;
        if (result.error) return json(500, { error: 'Não foi possível carregar os módulos das avaliações.' });
        modules = result.data || [];
      }

      const visibleIds = new Set(modules.map(item => item.assessment_id));
      const assessmentTitles = new Map((assessments || []).map(item => [item.id, item.title]));
      const visibleAssessments = membership.role === 'admin'
        ? (assessments || [])
        : (assessments || []).filter(item => visibleIds.has(item.id));

      return json(200, {
        ok: true,
        role: membership.role,
        assessments: visibleAssessments.map(item => ({
          id: item.id,
          title: item.title,
          status: item.status,
          schema_version: item.schema_version,
          created_at: item.created_at,
          updated_at: item.updated_at,
          completed_at: item.completed_at,
          source_assessment_id: item.source_assessment_id || null,
          source_assessment_title: item.source_assessment_id ? (assessmentTitles.get(item.source_assessment_id) || 'Avaliação anterior') : null,
          stage: item.shared_payload?.stage || 'triagem',
          modules: modules.filter(module => module.assessment_id === item.id)
        }))
      });
    }

    if (membership.role !== 'admin') return json(403, { error: 'Somente administradores podem criar avaliações.' });

    const body = await parse(request, 128 * 1024);

    if (body.action === 'copy') {
      const sourceId = String(body.source_assessment_id || '');
      const copyTitle = String(body.title || '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)) {
        return json(400, { error: 'Avaliação de origem inválida.' });
      }
      if (copyTitle.length < 2 || copyTitle.length > 180) {
        return json(400, { error: 'Informe um título entre 2 e 180 caracteres.' });
      }
      const { data: newId, error: copyError } = await db.rpc('clone_m360_company_assessment', {
        p_source_assessment_id: sourceId,
        p_company_id: membership.company_id,
        p_actor_user_id: actor.id,
        p_title: copyTitle
      });
      if (copyError || !newId) {
        return json(400, { error: 'Não foi possível copiar a avaliação. Verifique se ela pertence à sua empresa.' });
      }
      return json(201, { ok: true, assessment: { id: newId, title: copyTitle, status: 'draft', source_assessment_id: sourceId } });
    }

    const title = String(body.title || '').trim();
    if (title.length < 2 || title.length > 180) return json(400, { error: 'Informe um título entre 2 e 180 caracteres.' });

    const shared = body.shared_payload === undefined ? {} : body.shared_payload;
    if (!validObject(shared) || Object.prototype.hasOwnProperty.call(shared, 'answers')) {
      return json(400, { error: 'Os dados compartilhados da avaliação são inválidos.' });
    }

    const requested = Array.isArray(body.modules) ? body.modules : ['geral'];
    const moduleIds = [...new Set(['geral', ...requested.map(value => String(value))])];
    if (moduleIds.length > MODULES.size || moduleIds.some(id => !MODULES.has(id))) {
      return json(400, { error: 'A lista de módulos contém opções inválidas.' });
    }

    const { data: assessment, error: createError } = await db
      .from('m360_assessments')
      .insert({
        company_id: membership.company_id,
        title,
        shared_payload: shared,
        created_by: actor.id,
        updated_by: actor.id
      })
      .select('id,title,status,schema_version,created_at,updated_at')
      .single();

    if (createError || !assessment) return json(500, { error: 'Não foi possível criar a avaliação.' });

    const requestedAssignments = validObject(body.assignments) ? body.assignments : {};
    const assignedIds = [...new Set(Object.values(requestedAssignments).filter(Boolean).map(String))];
    if (assignedIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      await db.from('m360_assessments').delete().eq('id', assessment.id).eq('company_id', membership.company_id);
      return json(400, { error: 'Há um responsável inválido na configuração.' });
    }
    if (assignedIds.length) {
      const { data: activeMembers, error: membersError } = await db.from('m360_company_members')
        .select('user_id').eq('company_id', membership.company_id).eq('status', 'active').in('user_id', assignedIds);
      if (membersError || (activeMembers || []).length !== assignedIds.length) {
        await db.from('m360_assessments').delete().eq('id', assessment.id).eq('company_id', membership.company_id);
        return json(400, { error: 'Um ou mais responsáveis não estão ativos nesta empresa.' });
      }
    }
    const rows = moduleIds.map(module_id => ({
      assessment_id: assessment.id,
      company_id: membership.company_id,
      module_id,
      assigned_user_id: assignedIds.includes(String(requestedAssignments[module_id] || '')) ? String(requestedAssignments[module_id]) : null
    }));
    const { data: createdModules, error: moduleError } = await db
      .from('m360_assessment_modules')
      .insert(rows)
      .select('assessment_id,module_id,assigned_user_id,status,updated_at');

    if (moduleError) {
      await db.from('m360_assessments').delete().eq('id', assessment.id).eq('company_id', membership.company_id);
      return json(500, { error: 'Não foi possível preparar os módulos. A avaliação não foi mantida.' });
    }

    return json(201, { ok: true, assessment: { ...assessment, modules: createdModules || [] } });
  } catch {
    return json(500, { error: 'Falha interna ao administrar avaliações.' });
  }
}
