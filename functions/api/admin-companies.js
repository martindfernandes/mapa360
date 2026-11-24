import { supabase, json, platformAdmin, sameOrigin, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
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

    const [{ data: companies, error: companyError }, { data: members, error: memberError }] = await Promise.all([
      db.from('m360_companies').select('id,name,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('m360_company_members').select('company_id,user_id,role,status,joined_at').order('joined_at', { ascending: true }).limit(2000)
    ]);
    if (companyError || memberError) return json(500, { error: 'Não foi possível carregar empresas e usuários' });

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
    const result = (companies || []).map(company => ({
      ...company,
      members: (members || []).filter(member => member.company_id === company.id).map(member => ({
        ...member,
        ...(usersById.get(member.user_id) || { email: '', created_at: null, last_sign_in_at: null, banned_until: null })
      }))
    }));
    return json(200, { companies: result });
  } catch {
    return json(500, { error: 'Falha interna ao consultar empresas' });
  }
}
