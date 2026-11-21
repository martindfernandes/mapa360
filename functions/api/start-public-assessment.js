import { supabase, json, parse, sha, randomToken, sameOrigin, requestError, consumeRateLimit } from './_shared.js';

const MAX_COMPANY_LENGTH = 180;
const SESSION_DAYS = 90;
const TURNSTILE_HOSTNAMES = new Set([
  'mapa360.pages.dev',
  'feature-1-1-2-acesso-publico.mapa360.pages.dev',
  'localhost',
  '127.0.0.1'
]);
const TURNSTILE_ACTION = 'public_assessment_start';

async function verifyTurnstile(token, secret, expectedHostname) {
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
    && result.hostname === expectedHostname
    && result.action === TURNSTILE_ACTION;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });

  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!TURNSTILE_HOSTNAMES.has(hostname)) return json(403, { error: 'Domínio não autorizado' });

  let phase = 'validacao';
  try {
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível. Tente novamente.' });
    const db = supabase(env);
    if (!(await consumeRateLimit(db, 'public-start', ip, 5, 900))) {
      return json(429, { error: 'Muitas tentativas de início. Aguarde alguns minutos e tente novamente.' });
    }

    const body = await parse(request, 4096);
    const company = String(body.company || '').trim().replace(/\\s+/g, ' ');
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
    phase = 'turnstile';
    const challengeValid = await verifyTurnstile(challengeToken, env.TURNSTILE_SECRET, hostname);
    if (!challengeValid) {
      console.warn('Verificação Turnstile recusada.');
      return json(403, { error: 'A verificação de segurança falhou. Atualize o desafio e tente novamente.' });
    }

    phase = 'geracao_token';
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();

    phase = 'supabase_gravacao';
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
      console.error('Falha ao iniciar avaliação no banco:', {
        code: error?.code || 'sem_codigo',
        status: error?.status || null
      });
      return json(500, { error: 'Não foi possível iniciar a avaliação. Tente novamente.' });
    }

    return json(201, { ok: true, token, expires_at: expires });
  } catch (error) {
    console.error('Falha interna ao iniciar avaliação:', {
      phase,
      name: error?.name || 'Erro'
    });
    return requestError(error, 'Falha interna ao iniciar a avaliação.');
  }
}
