import { supabase, json, parse, sameOrigin, sha, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (!['feature/1.2.0-contas-usuarios', 'v1'].includes(env.CF_PAGES_BRANCH)) return json(404, { error: 'Não encontrado.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });

  try {
    const db = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'member-password-reset-ip', ip, 12, 900))) {
      return json(429, { error: 'Muitas tentativas. Aguarde e tente novamente.' });
    }

    const body = await parse(request, 8192);
    const token = String(body.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(400, { error: 'Link inválido ou expirado. Solicite outro ao administrador.' });

    const password = String(body.password || '');
    if (password.length < 8 || password.length > 128) return json(400, { error: 'A senha deve ter entre 8 e 128 caracteres.' });

    const tokenHash = await sha(token);
    const { data: consumed, error: consumeError } = await db.rpc('consume_m360_member_password_reset', {
      p_token_hash: tokenHash
    });
    if (consumeError || !Array.isArray(consumed) || consumed.length !== 1 || !consumed[0]?.user_id) {
      return json(400, { error: 'Link inválido, expirado ou já utilizado. Solicite outro ao administrador.' });
    }

    const targetUserId = consumed[0].user_id;
    const { error: updateError } = await db.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) {
      // O token permanece consumido por segurança. O administrador poderá emitir outro link.
      return json(502, { error: 'Não foi possível atualizar a senha. Solicite um novo link ao administrador.' });
    }

    return json(200, { ok: true });
  } catch {
    return json(500, { error: 'Falha interna ao redefinir a senha.' });
  }
}
