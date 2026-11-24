import { supabase, json, admin, sameOrigin, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });
  try {
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    const db = supabase(env);
    if (!(await consumeRateLimit(env, db, 'admin-evaluations', ip, 60, 900))) {
      return json(429, { error: 'Muitas consultas administrativas. Aguarde e tente novamente.' });
    }
    const { data, error } = await db.from('m360_invitations')
      .select('id,company_name,contact_name,status,created_at,last_activity_at,completed_at,expires_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) return json(500, { error: 'Não foi possível carregar avaliações' });
    return json(200, { evaluations: data });
  } catch (error) { return json(500, { error: 'Falha interna ao carregar avaliações' }); }
}
