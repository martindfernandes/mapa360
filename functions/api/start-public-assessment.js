import { supabase, json, parse, sha, randomToken, sameOrigin, requestError } from './_shared.js';

const MAX_COMPANY_LENGTH = 180;
const SESSION_DAYS = 90;
const TURNSTILE_HOSTNAME = 'feature-1-1-2-acesso-publico.mapa360.pages.dev';
const TURNSTILE_ACTION = 'public_assessment_start';

async function verifyTurnstile(token, secret) {
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  form.set('idempotency_key', crypto.randomUUID());

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true
    && result.hostname === TURNSTILE_HOSTNAME
    && result.action === TURNSTILE_ACTION;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });

  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  try {
    const body = await parse(request, 4096);
    const company = String(body.company || '').trim().replace(/\s+/g, ' ');
    if (company.length < 2 || company.length > MAX_COMPANY_LENGTH) {
      return json(400, { error: 'Informe o nome da empresa (de 2 a 180 caracteres).' });
    }

    const challengeToken = body.turnstileToken;
    if (typeof challengeToken !== 'string' || challengeToken.length < 1 || challengeToken.length > 2048) {
      return json(400, { error: 'Conclua a verificação de segurança e tente novamente.' });
    }
    if (!env.TURNSTILE_SECRET) {
      return json(503, { error: 'A verificação de segurança está temporariamente indisponível.' });
    }
    const challengeValid = await verifyTurnstile(challengeToken, env.TURNSTILE_SECRET);
    if (!challengeValid) {
      return json(403, { error: 'A verificação de segurança falhou. Atualize o desafio e tente novamente.' });
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
