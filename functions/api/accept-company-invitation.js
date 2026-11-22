import { supabase, json, parse, sameOrigin, sha } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });

  const accessToken = bearer(request);
  if (!accessToken) return json(401, { error: 'Entre na conta convidada para aceitar o convite.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) return json(401, { error: 'Confirme o e-mail e entre na conta convidada antes de aceitar.' });

    const body = await parse(request, 4096);
    const token = String(body.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(400, { error: 'Link de convite inválido.' });

    const { data, error } = await db.rpc('accept_m360_company_invitation', {
      p_token_hash: await sha(token),
      p_user_id: user.id,
      p_email: user.email
    });

    if (error) {
      const detail = error.message || '';
      if (/email_not_verified|invitation_email_mismatch/i.test(detail)) return json(403, { error: 'Este convite foi enviado para outro endereço de e-mail. Entre com a conta correspondente.' });
      if (/user_already_has_company/i.test(detail) || error.code === '23505') return json(409, { error: 'Esta conta já está vinculada a uma empresa.' });
      if (/invitation_invalid_or_expired/i.test(detail)) return json(410, { error: 'Este convite expirou ou já foi utilizado. Solicite um novo convite ao administrador.' });
      return json(400, { error: 'Não foi possível aceitar o convite. Solicite um novo link ao administrador.' });
    }

    return json(200, { ok: true, company_id: data?.company_id });
  } catch {
    return json(500, { error: 'Falha interna ao aceitar o convite.' });
  }
}
