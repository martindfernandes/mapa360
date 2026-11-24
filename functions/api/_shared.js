import { createClient } from '@supabase/supabase-js';

// A branch de contas usa um banco isolado. Não há fallback para as credenciais
// principais: se as variáveis DEV estiverem ausentes, o Preview falha fechado.
function supabaseConfig(env) {
  const isAccountsDev = env.CF_PAGES_BRANCH === 'feature/1.2.0-contas-usuarios';
  if (isAccountsDev) {
    return {
      url: env.SUPABASE_DEV_URL,
      key: env.SUPABASE_DEV_SECRET_KEY
    };
  }
  return {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  };
}

export function supabase(env) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error('Backend ainda não configurado.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function parse(request, maxBytes = 1024 * 1024) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const error = new Error('A solicitação deve usar JSON.');
    error.status = 415;
    throw error;
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    const error = new Error('Solicitação muito grande.');
    error.status = 413;
    throw error;
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    const error = new Error('Solicitação muito grande.');
    error.status = 413;
    throw error;
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    const error = new Error('JSON inválido.');
    error.status = 400;
    throw error;
  }
}

export function requestError(error, fallback = 'Falha interna na solicitação.') {
  const status = Number(error?.status);
  if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
  return json(500, { error: fallback });
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  // Navegadores normalmente omitem Origin em GETs same-origin.
  // Nesses casos, aceitar somente quando Fetch Metadata confirma mesma origem.
  if (!origin) {
    return request.method === 'GET' && fetchSite === 'same-origin';
  }
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch { return false; }
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export function validSessionToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function sha(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function consumeRateLimit(env, db, scope, identity, limit, windowSeconds) {
  const { key: secret } = supabaseConfig(env);
  if (!secret) throw new Error('Chave do backend indisponível para proteção de frequência.');
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`m360-rate:${scope}:${identity}`));
  const bucketKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await db.rpc('consume_m360_rate_limit', {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error('Serviço de proteção contra excesso de requisições indisponível.');
  return data === true;
}

export function admin(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || '');
  const actual = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !actual || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return mismatch === 0;
}

export async function mail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Mapeamento 360 <onboarding@resend.dev>',
      to, subject, html
    })
  });
  if (!response.ok) throw new Error('Falha no serviço de e-mail');
  return response.json();
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
