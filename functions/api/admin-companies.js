import { supabase, json, admin } from './_shared.js';

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });

  try {
    const db = supabase(env);
    const [{ data: companies, error: companyError }, { data: members, error: memberError }] = await Promise.all([
      db.from('m360_companies').select('id,name,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('m360_company_members').select('company_id,user_id,role,status,joined_at').order('joined_at', { ascending: true }).limit(2000)
    ]);
    if (companyError || memberError) return json(500, { error: 'Não foi possível carregar empresas e usuários' });

    const usersById = new Map();
    for (const member of members || []) {
      if (usersById.has(member.user_id)) continue;
      const { data, error } = await db.auth.admin.getUserById(member.user_id);
      if (!error && data?.user) usersById.set(member.user_id, {
        email: data.user.email || '',
        created_at: data.user.created_at || null,
        last_sign_in_at: data.user.last_sign_in_at || null,
        banned_until: data.user.banned_until || null
      });
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
