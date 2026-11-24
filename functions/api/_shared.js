import { createClient } from '@supabase/supabase-js';

export function supabase(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
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
    const error = new Error('A solicitação deve usar JSON.'); error.status = 415; throw error;
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    const error = new Error('Solicitação muito grande.'); error.status = 413; throw error;
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    const error = new Error('Solicitação muito grande.'); error.status = 413; throw error;
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    const error = new Error('JSON inválido.'); error.status = 400; throw error;
  }
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin) return request.method === 'GET' && fetchSite === 'same-origin';
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch { return false; }
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export function validSessionToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function consumeRateLimit(env, db, scope, identity, limit, windowSeconds) {
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Chave do backend indisponível para proteção de frequência.');
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`m360-rate:${scope}:${identity}`));
  const bucketKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await db.rpc('consume_m360_rate_limit', {
    p_bucket_key: bucketKey, p_limit: limit, p_window_seconds: windowSeconds
  });
  if (error) throw new Error('Serviço de proteção contra excesso de requisições indisponível.');
  return data === true;
}



export async function sha(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function admin(request, env) {
  const authorization = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_API_TOKEN) && authorization === `Bearer ${env.ADMIN_API_TOKEN}`;
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
  return String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
}
