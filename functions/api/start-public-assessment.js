import { supabase, json, parse, sha, randomToken, sameOrigin, requestError } from './_shared.js';

const MAX_COMPANY_LENGTH = 180;
const SESSION_DAYS = 90;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });

  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  try {
    const body = await parse(request, 4096);
    const company = String(body.company || '').trim().replace(/\s+/g, ' ');
    if (company.length < 2 || company.length > MAX_COMPANY_LENGTH) {
      return json(400, { error: 'Informe o nome da empresa (de 2 a 180 caracteres).' });
    }

    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
    const db = supabase(env);
    const { data, error } = await db.from('m360_invitations').insert({
      company_name: company,
      contact_name: '',
      contact_email: '',
      token_hash: await sha(token),
      status: 'em andamento',
      expires_at: expires,
      last_activity_at: new Date().toISOString()
    }).select('id').single();

    if (error || !data) {
      return json(500, { error: 'Não foi possível iniciar a avaliação. Tente novamente.' });
    }

    return json(201, { ok: true, token, expires_at: expires });
  } catch (error) {
    return requestError(error, 'Falha interna ao iniciar a avaliação.');
  }
}
