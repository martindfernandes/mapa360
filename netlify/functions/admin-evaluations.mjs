import { supabase, json, admin } from './_shared.mjs';

export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!admin(request)) return json(401, { error: 'Acesso não autorizado' });

  const { data, error } = await supabase()
    .from('m360_invitations')
    .select('id,company_name,contact_name,status,created_at,last_activity_at,completed_at,expires_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return json(500, { error: 'Não foi possível carregar avaliações' });
  return json(200, { evaluations: data });
}
