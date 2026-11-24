import { supabase, json, sameOrigin, consumeRateLimit } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) return json(404, { error: 'Não encontrado.' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido.' });
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
    if (!(await consumeRateLimit(env, db, 'company-assessment-members-user', actor.id, 60, 900)) ||
        !(await consumeRateLimit(env, db, 'company-assessment-members-ip', ip, 240, 900))) {
      return json(429, { error: 'Muitas operações. Aguarde alguns instantes e tente novamente.' });
    }

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (membershipError) return json(500, { error: 'Não foi possível validar suas permissões.' });
    if (!membership || membership.status !== 'active' || membership.role !== 'admin') {
      return json(403, { error: 'Somente administradores ativos podem consultar os participantes.' });
    }

    const { data: members, error: membersError } = await db
      .from('m360_company_members')
      .select('user_id,role,status')
      .eq('company_id', membership.company_id);
    if (membersError) return json(500, { error: 'Não foi possível carregar os participantes.' });

    const result = await Promise.all((members || []).map(async member => {
      const { data } = await db.auth.admin.getUserById(member.user_id);
      const user = data?.user;
      const metadata = user?.user_metadata || {};
      return {
        user_id: member.user_id,
        role: member.role,
        status: member.status,
        name: metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'Participante',
        email: user?.email || ''
      };
    }));

    return json(200, { ok: true, members: result });
  } catch {
    return json(500, { error: 'Falha interna ao consultar participantes.' });
  }
}
