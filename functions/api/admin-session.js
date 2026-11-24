import { json, platformAdmin, sameOrigin } from './_shared.js';

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const auth = await platformAdmin(request, env, { requireMfa: false, action: null });
  if (!auth.ok) return json(auth.status, { error: auth.error, code: auth.code });

  return json(200, {
    ok: true,
    email: auth.user.email || null,
    assurance: auth.assurance,
    mfaRequired: auth.assurance !== 'aal2'
  });
}
