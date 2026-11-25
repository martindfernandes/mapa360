import { supabase, json, platformAdmin, sameOrigin, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) return json(404, { error: 'Não encontrado' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  try {
    const db = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'platformAdmin-companies', ip, 30, 900))) {
      return json(429, { error: 'Muitas solicitações administrativas. Aguarde e tente novamente.' });
    }

    const platformAuth = await platformAdmin(request, env, { action: 'admin_companies_listed' });
    if (!platformAuth.ok) return json(platformAuth.status, { error: platformAuth.error, code: platformAuth.code });

    const [{ data: companies, error: companyError }, { data: members, error: memberError }, { data: assessments, error: assessmentError }] = await Promise.all([
      db.from('m360_companies').select('id,name,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('m360_company_members').select('company_id,user_id,role,status,joined_at,is_master_admin').order('joined_at', { ascending: true }).limit(2000),
      db.from('m360_assessments').select('id,company_id,title,status,created_at,updated_at,completed_at').order('updated_at', { ascending: false }).limit(5000)
    ]);
    if (companyError || memberError || assessmentError) return json(500, { error: 'Não foi possível carregar empresas, usuários e avaliações' });

    const usersById = new Map();
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json(500, { error: 'Não foi possível carregar os dados de acesso dos usuários' });
      for (const user of data?.users || []) {
        usersById.set(user.id, {
          email: user.email || '',
          created_at: user.created_at || null,
          last_sign_in_at: user.last_sign_in_at || null,
          banned_until: user.banned_until || null
        });
      }
      if (!data?.users || data.users.length < 1000) break;
    }
    const result = (companies || []).map(company => {
      const companyAssessments = (assessments || []).filter(item => item.company_id === company.id);
      const counts = {
        total: companyAssessments.length,
        draft: companyAssessments.filter(item => item.status === 'draft').length,
        in_progress: companyAssessments.filter(item => item.status === 'in_progress').length,
        completed: companyAssessments.filter(item => item.status === 'completed').length
      };
      return {
        ...company,
        assessment_counts: counts,
        assessments: companyAssessments.slice(0, 20),
        last_assessment_activity: companyAssessments[0]?.updated_at || null,
        members: (members || []).filter(member => member.company_id === company.id).map(member => ({
          ...member,
          ...(usersById.get(member.user_id) || { email: '', created_at: null, last_sign_in_at: null, banned_until: null })
        }))
      };
    });
    return json(200, {
      companies: result,
      totals: {
        companies: (companies || []).length,
        members: (members || []).length,
        assessments: (assessments || []).length,
        draft: (assessments || []).filter(item => item.status === 'draft').length,
        in_progress: (assessments || []).filter(item => item.status === 'in_progress').length,
        completed: (assessments || []).filter(item => item.status === 'completed').length
      },
      truncated: { companies: (companies || []).length === 500, members: (members || []).length === 2000, assessments: (assessments || []).length === 5000 }
    });
  } catch {
    return json(500, { error: 'Falha interna ao consultar empresas' });
  }
}
