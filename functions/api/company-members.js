import { supabase, json, sameOrigin } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
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
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) return json(401, { error: 'Sessão inválida.' });

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status,company:m360_companies(id,name)')
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) return json(500, { error: 'Não foi possível consultar sua empresa.' });
    if (!membership || membership.status !== 'active' || membership.role !== 'admin') {
      return json(403, { error: 'Somente administradores ativos podem consultar os participantes.' });
    }

    const { data: members, error: membersError } = await db
      .from('m360_company_members')
      .select('user_id,role,status,joined_at')
      .eq('company_id', membership.company_id)
      .order('joined_at', { ascending: true })
      .limit(500);
    if (membersError) return json(500, { error: 'Não foi possível carregar os participantes.' });

    const users = await Promise.all((members || []).map(async member => {
      const { data, error } = await db.auth.admin.getUserById(member.user_id);
      if (error || !data?.user) return { ...member, email: '', name: 'Usuário indisponível', banned: member.status === 'blocked' };
      const authUser = data.user;
      return {
        ...member,
        email: authUser.email || '',
        name: String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').slice(0, 120),
        banned: Boolean(authUser.banned_until && new Date(authUser.banned_until) > new Date())
      };
    }));

    return json(200, { ok: true, company: membership.company, members: users });
  } catch {
    return json(500, { error: 'Falha interna ao carregar participantes.' });
  }
}
