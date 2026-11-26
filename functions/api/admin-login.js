import { json, parse, sameOrigin, supabase, consumeRateLimit } from './_shared.js';

const OWNER_USER_ID = 'ee65991c-7758-4485-b3a4-05c93ed5c862';
const ADMIN_USERNAME = 'admin_mapa360';

export async function onRequest({ request, env }) {
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) {
    return json(404, { error: 'Não encontrado' });
  }
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });

  try {
    const db = supabase(env);
    if (!(await consumeRateLimit(env, db, 'platform-admin-login', ip, 8, 900))) {
      return json(429, { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
    }

    const body = await parse(request, 2048);
    const username = String(body.username || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (username !== ADMIN_USERNAME || password.length < 8 || password.length > 128) {
      return json(401, { error: 'Usuário ou senha incorretos.' });
    }

    // O apelido aponta exclusivamente para o ID da conta proprietária já existente.
    // A senha nunca é consultada nem armazenada no banco; o Supabase Auth a valida.
    const { data: ownerData, error: ownerError } = await db.auth.admin.getUserById(OWNER_USER_ID);
    if (ownerError || !ownerData?.user?.email) {
      return json(503, { error: 'Conta proprietária indisponível. Acesso bloqueado por segurança.' });
    }
    const { data: activeAdmin, error: roleError } = await db.rpc('is_m360_platform_admin', {
      p_user_id: OWNER_USER_ID
    });
    if (roleError || activeAdmin !== true) {
      return json(403, { error: 'A conta vinculada ao usuário administrativo não está autorizada.' });
    }

    const authUrl = String(env.SUPABASE_DEV_URL || '').replace(/\/$/, '');
    const publishableKey = env.SUPABASE_DEV_PUBLISHABLE_KEY;
    if (!authUrl || !publishableKey) {
      return json(503, { error: 'Autenticação DEV não configurada.' });
    }

    const authResponse = await fetch(authUrl + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey
      },
      body: JSON.stringify({ email: ownerData.user.email, password })
    });
    const authResult = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !authResult.access_token || !authResult.refresh_token) {
      return json(401, { error: 'Usuário ou senha incorretos.' });
    }

    return json(200, {
      session: {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        token_type: authResult.token_type,
        expires_in: authResult.expires_in,
        expires_at: authResult.expires_at,
        user: authResult.user
      }
    });
  } catch (error) {
    const status = Number(error?.status);
    if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
    return json(503, { error: 'Não foi possível validar o acesso administrativo. Tente novamente.' });
  }
}
