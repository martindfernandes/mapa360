import { supabase, json, admin } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });
  try {
    const client = supabase(env);
    const evaluations = [];
    const pageSize = 1000;
    const maxRows = 10000;
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await client.from('m360_invitations')
        .select('id,company_name,contact_name,status,created_at,last_activity_at,completed_at,expires_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return json(500, { error: 'Não foi possível carregar avaliações' });
      evaluations.push(...(data || []));
      if (!data || data.length < pageSize) {
        return json(200, { evaluations, truncated: false });
      }
    }
    return json(200, { evaluations, truncated: true });
  } catch (error) { return json(500, { error: 'Falha interna ao carregar avaliações' }); }
}
