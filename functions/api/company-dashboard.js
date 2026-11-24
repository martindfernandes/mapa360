import { supabase, json, sameOrigin } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}
function countAnswered(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 0;
  return Object.values(answers).filter(answer => answer && typeof answer === 'object' &&
    ((answer.level !== '' && answer.level != null) || String(answer.evidence || '').trim())).length;
}
function safeName(user) {
  return String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Participante').slice(0, 120);
}

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado.' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });
  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor) return json(401, { error: 'Sua sessão expirou. Entre novamente.' });

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status,company:m360_companies(id,name,created_at)')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (membershipError) return json(500, { error: 'Não foi possível consultar o vínculo com a empresa.' });
    if (!membership || membership.status !== 'active' || !membership.company) {
      return json(403, { error: 'Sua conta ainda não possui vínculo ativo com uma empresa.' });
    }

    const { data: assessments, error: assessmentError } = await db
      .from('m360_assessments')
      .select('id,title,status,created_at,updated_at,completed_at,shared_payload')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (assessmentError) return json(500, { error: 'Não foi possível carregar as avaliações da empresa.' });

    const ids = (assessments || []).map(item => item.id);
    let modules = [];
    if (ids.length) {
      let query = db.from('m360_assessment_modules')
        .select('assessment_id,module_id,assigned_user_id,status,updated_at,completed_at,updated_by,answers')
        .eq('company_id', membership.company_id)
        .in('assessment_id', ids);
      if (membership.role !== 'admin') query = query.eq('assigned_user_id', actor.id);
      const result = await query;
      if (result.error) return json(500, { error: 'Não foi possível carregar as atividades da avaliação.' });
      modules = result.data || [];
    }

    let members = [];
    const names = { [actor.id]: safeName(actor) };
    if (membership.role === 'admin') {
      const { data: memberRows, error: membersError } = await db
        .from('m360_company_members')
        .select('user_id,role,status,joined_at')
        .eq('company_id', membership.company_id)
        .order('joined_at', { ascending: true })
        .limit(500);
      if (membersError) return json(500, { error: 'Não foi possível carregar os participantes da empresa.' });
      members = await Promise.all((memberRows || []).map(async member => {
        const { data, error } = await db.auth.admin.getUserById(member.user_id);
        const user = error ? null : data?.user;
        const name = safeName(user);
        names[member.user_id] = name;
        return { user_id: member.user_id, role: member.role, status: member.status, name };
      }));
    }

    const visibleAssessments = membership.role === 'admin'
      ? (assessments || [])
      : (assessments || []).filter(item => modules.some(module => module.assessment_id === item.id));

    const formatted = visibleAssessments.map(item => {
      const rows = modules.filter(module => module.assessment_id === item.id).map(module => ({
        module_id: module.module_id,
        assigned_user_id: module.assigned_user_id,
        assigned_name: module.assigned_user_id ? (names[module.assigned_user_id] || 'Participante') : 'Administrador',
        status: module.status,
        updated_at: module.updated_at,
        completed_at: module.completed_at,
        answered_count: countAnswered(module.answers),
        responded_by: module.updated_by ? (names[module.updated_by] || 'Participante') : ''
      }));
      const general = rows.find(module => module.module_id === 'geral');
      const completed = rows.filter(module => module.status === 'completed').length;
      return {
        id: item.id,
        title: item.title,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        completed_at: item.completed_at,
        triage_completed: Boolean(item.shared_payload?.triage_completed_at),
        triage_completed_at: item.shared_payload?.triage_completed_at || null,
        triage_answered_count: Math.min(18, general?.answered_count || 0),
        modules: rows,
        completed_modules: completed,
        total_modules: rows.length,
        progress_pct: rows.length ? Math.round(completed / rows.length * 100) : 0
      };
    });

    return json(200, {
      ok: true,
      role: membership.role,
      user: { id: actor.id, name: safeName(actor), email: actor.email || '' },
      company: membership.company,
      members: membership.role === 'admin' ? members : [],
      assessments: formatted
    });
  } catch {
    return json(500, { error: 'Falha interna ao preparar o painel da empresa.' });
  }
}
