import { supabase, json, sameOrigin, sha } from './_shared.js';

function page(token) {
  return new Response(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Confirmar e-mail · Mapa 360</title>
<style>
body{font-family:Arial,sans-serif;background:#f3f6f8;color:#172b3a;margin:0;padding:32px 16px}
main{max-width:480px;margin:8vh auto;background:#fff;padding:32px;border-radius:14px;box-shadow:0 8px 30px #102a4320}
h1{font-size:24px;margin-top:0}p{line-height:1.55;color:#52616b}
button{border:0;border-radius:8px;background:#087c72;color:#fff;padding:13px 20px;font-size:16px;font-weight:600;cursor:pointer}
</style>
</head>
<body><main><h1>Confirmar seu e-mail</h1>
<p>Para concluir a confirmação do seu endereço no Mapa 360, clique no botão abaixo.</p>
<form method="post" action="/api/confirm-email">
<input type="hidden" name="token" value="${token}">
<button type="submit">Confirmar meu e-mail</button>
</form></main></body></html>`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

function redirect(request, result) {
  return Response.redirect(new URL('/conta.html?' + result, request.url), 303);
}

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') {
    return json(404, { error: 'Não encontrado.' });
  }

  if (request.method === 'GET') {
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return redirect(request, 'email-confirmation=invalid');
    return page(token);
  }

  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });

  try {
    const form = await request.formData();
    const token = String(form.get('token') || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return redirect(request, 'email-confirmation=invalid');

    const db = supabase(env);
    const { error } = await db.rpc('consume_m360_email_verification', {
      p_token_hash: await sha(token)
    });

    return redirect(request, error ? 'email-confirmation=invalid' : 'email-confirmed=1');
  } catch {
    return redirect(request, 'email-confirmation=error');
  }
}
