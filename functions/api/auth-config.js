import { json } from './_shared.js';

// Public configuration for Supabase Auth. Only the publishable key is exposed.
// The development branch never falls back to production credentials.
export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) {
    return json(404, { error: 'Não encontrado' });
  }

  const url = env.SUPABASE_DEV_URL;
  const publishableKey = env.SUPABASE_DEV_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return json(503, { error: 'A autenticação ainda não foi configurada neste ambiente.' });
  }

  return json(200, { url, publishableKey });
}
