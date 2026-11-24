import { json, platformAdmin, sameOrigin, supabase, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const db = supabase(env);
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
  if (!(await consumeRateLimit(env, db, 'platform-admin-session', ip, 20, 900))) {
    return json(429, { error: 'Muitas tentativas de acesso administrativo. Aguarde e tente novamente.' });
  }

  const auth = await platformAdmin(request, env, { requireMfa: false, action: null });
  if (!auth.ok) return json(auth.status, { error: auth.error, code: auth.code });

  return json(200, {
    ok: true,
    email: auth.user.email || null,
    assurance: auth.assurance,
    mfaRequired: auth.assurance !== 'aal2'
  });
}
