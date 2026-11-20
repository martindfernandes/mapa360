import { supabase, json, admin } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });
  try {
    const { data, error } = await supabase(env).from('m360_invitations')
      .select('id,company_name,contact_name,status,created_at,last_activity_at,completed_at,expires_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) return json(500, { error: 'Não foi possível carregar avaliações' });
    return json(200, { evaluations: data });
  } catch (error) { return json(500, { error: 'Falha interna ao carregar avaliações' }); }
}
