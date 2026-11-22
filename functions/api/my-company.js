import { supabase, json, sameOrigin } from './_shared.js';

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) {
      return json(401, { error: 'Sessão inválida ou e-mail ainda não confirmado.' });
    }

    const { data, error } = await db
      .from('m360_company_members')
      .select('role, company:m360_companies(id,name,created_at)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return json(500, { error: 'Não foi possível consultar a empresa vinculada à conta.' });
    if (!data?.company) return json(200, { ok: true, linked: false, user: { id: user.id, email: user.email } });

    return json(200, {
      ok: true,
      linked: true,
      role: data.role,
      company: data.company,
      user: { id: user.id, email: user.email }
    });
  } catch {
    return json(500, { error: 'Falha interna ao consultar a empresa.' });
  }
}
