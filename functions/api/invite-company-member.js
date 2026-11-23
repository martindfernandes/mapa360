import { supabase, json, parse, sameOrigin, consumeRateLimit, randomToken, sha } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(400, { error: 'Informe um endereço de e-mail válido.' });
    }
    if (email === String(user.email || '').toLowerCase()) return json(400, { error: 'Você já faz parte desta empresa.' });

    // Remove convites expirados para permitir novo envio ao mesmo endereço.
    await db.from('m360_company_invitations')
      .delete()
      .eq('company_id', membership.company_id)
      .eq('email', email)
      .is('accepted_at', null)
      .lte('expires_at', new Date().toISOString());

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
    // Gera um link de convite sem enviar e-mail: o SMTP padrão do Supabase
    // pode restringir destinatários. O administrador compartilha o link com segurança.
    const { data: inviteData, error: inviteError } = await db.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: redirectTo.toString(),
        data: { invited_company: membership.company?.name || '' }
      }
    });

    if (inviteError || !inviteData?.properties?.action_link) {
      await db.from('m360_company_invitations').delete().eq('token_hash', tokenHash);
      if (/already|registered|exists/i.test(inviteError?.message || '')) {
        return json(409, { error: 'Este e-mail já possui uma conta. O vínculo de contas existentes será habilitado em uma etapa própria.' });
      }
      return json(502, { error: 'Não foi possível gerar o convite. Verifique a configuração do Supabase Auth e tente novamente.' });
    }

    // Usa o token_hash retornado pelo Supabase diretamente no fluxo verifyOtp.
    // Isso permite manter PKCE no restante do aplicativo sem depender de um
    // code_verifier que não existe no navegador quando o administrador gera o convite.
    const authToken = inviteData?.properties?.hashed_token;
    if (!authToken || !inviteData?.user?.email) {
      await db.from('m360_company_invitations').delete().eq('token_hash', tokenHash);
      return json(502, { error: 'O Supabase não retornou os dados necessários para concluir o convite. Tente novamente.' });
    }

    const inviteUrl = new URL('/conta.html', request.url);
    inviteUrl.searchParams.set('convite', token);
    inviteUrl.searchParams.set('auth_token', authToken);
    inviteUrl.searchParams.set('invite_email', String(inviteData.user.email).toLowerCase());

    return json(201, {
      ok: true,
      email,
      expires_at: expiresAt,
      invite_url: inviteUrl.toString(),
      message: 'Link de convite gerado. Compartilhe com o convidado; validade de 7 dias.'
    });
  } catch {
    return json(500, { error: 'Falha interna ao preparar o convite.' });
  }
}
