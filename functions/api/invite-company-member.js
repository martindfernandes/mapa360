import { supabase, json, parse, sameOrigin, consumeRateLimit, randomToken, sha } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });

  const accessToken = bearer(request);
  if (!accessToken) return json(401, { error: 'Entre na sua conta para enviar convites.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) return json(401, { error: 'Sua sessão expirou ou o e-mail ainda não foi confirmado.' });

    const { data: membership, error: memberError } = await db
      .from('m360_company_members')
      .select('company_id, role, status, company:m360_companies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) return json(403, { error: 'Sua conta não está vinculada a uma empresa.' });
    if (membership.status !== 'active' || membership.role !== 'admin') return json(403, { error: 'Somente administradores ativos podem convidar usuários.' });

    if (!(await consumeRateLimit(env, db, 'company-member-invite', user.id, 10, 3600))) {
      return json(429, { error: 'Você atingiu o limite de convites. Aguarde e tente novamente.' });
    }

    const body = await parse(request, 4096);
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254) {
      return json(400, { error: 'Informe um endereço de e-mail válido.' });
    }
    if (email === String(user.email || '').toLowerCase()) return json(400, { error: 'Você já faz parte desta empresa.' });

    const token = randomToken();
    const tokenHash = await sha(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await db.from('m360_company_invitations').insert({
      company_id: membership.company_id,
      email,
      role: 'member',
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt
    });
    if (insertError) {
      if (insertError.code === '23505') return json(409, { error: 'Já existe um convite pendente para este e-mail nesta empresa.' });
      return json(500, { error: 'Não foi possível preparar o convite. Tente novamente.' });
    }

    const redirectTo = new URL('/conta.html', request.url);
    redirectTo.searchParams.set('convite', token);
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo.toString(),
      data: { invited_company: membership.company?.name || '' }
    });

    if (inviteError) {
      await db.from('m360_company_invitations').delete().eq('token_hash', tokenHash);
      if (/already|registered|exists/i.test(inviteError.message || '')) {
        return json(409, { error: 'Este e-mail já possui uma conta. Entre em contato para definirmos o fluxo de vínculo dessa conta existente.' });
      }
      return json(502, { error: 'Não foi possível enviar o e-mail de convite. Verifique a configuração de e-mail do ambiente e tente novamente.' });
    }

    return json(201, {
      ok: true,
      email,
      expires_at: expiresAt,
      message: 'Convite enviado. O link é válido por 7 dias.'
    });
  } catch {
    return json(500, { error: 'Falha interna ao preparar o convite.' });
  }
}
