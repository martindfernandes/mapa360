import { createClient } from '@supabase/supabase-js';

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Backend ainda não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Netlify Functions v2: respostas HTTP devem ser objetos Response.
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function parse(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export const sha = async (value) => Buffer.from(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
).toString('hex');

export function admin(request) {
  const authorization = request.headers.get('authorization') || '';
  return Boolean(process.env.ADMIN_API_TOKEN) &&
    authorization === `Bearer ${process.env.ADMIN_API_TOKEN}`;
}

export async function mail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Mapeamento 360 <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });
  if (!response.ok) throw new Error('Falha no serviço de e-mail');
  return response.json();
}
