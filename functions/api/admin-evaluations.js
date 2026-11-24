import { supabase, json, platformAdmin, sameOrigin, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  try {
    const client = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, client, 'platformAdmin-evaluations', ip, 60, 900))) {
      return json(429, { error: 'Muitas solicitações administrativas. Aguarde e tente novamente.' });
    }

    const platformAuth = await platformAdmin(request, env, { action: 'admin_evaluations_listed' });
    if (!platformAuth.ok) return json(platformAuth.status, { error: platformAuth.error, code: platformAuth.code });

    const evaluations = [];
    const pageSize = 1000;
    const maxRows = 10000;
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await client.from('m360_invitations')
        .select('id,company_name,contact_name,status,created_at,last_activity_at,completed_at,expires_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return json(500, { error: 'Não foi possível carregar avaliações' });
      const page = data || [];
      if (page.length) {
        const ids = page.map(item => item.id);
        const { data: submissions, error: submissionError } = await client.from('m360_submissions')
          .select('invitation_id,payload')
          .in('invitation_id', ids);
        if (submissionError) return json(500, { error: 'Não foi possível carregar a localização das avaliações' });
        const locations = new Map((submissions || []).map(item => {
          const context = item.payload?.context || {};
          return [item.invitation_id, {
            municipality: String(context.municipality || '').trim().slice(0, 120),
            state: String(context.state || '').trim().toUpperCase().slice(0, 2)
          }];
        }));
        evaluations.push(...page.map(item => ({ ...item, ...(locations.get(item.id) || { municipality: '', state: '' }) })));
      }
      if (!data || data.length < pageSize) {
        return json(200, { evaluations, truncated: false });
      }
    }
    return json(200, { evaluations, truncated: true });
  } catch (error) { return json(500, { error: 'Falha interna ao carregar avaliações' }); }
}
