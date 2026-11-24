import { supabase, json, parse, sameOrigin, consumeRateLimit } from './_shared.js';

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (!['GET', 'PATCH'].includes(request.method)) return json(405, { error: 'Método não permitido' });
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'my-company-ip', ip, 180, 900))) {
      return json(429, { error: 'Muitas consultas à empresa. Aguarde e tente novamente.' });
    }
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) {
      return json(401, { error: 'Sessão inválida ou e-mail ainda não confirmado.' });
    }

    const { data, error } = await db
      .from('m360_company_members')
      .select('company_id,role,status,company:m360_companies(id,name,created_at)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return json(500, { error: 'Não foi possível consultar a empresa vinculada à conta.' });
    if (!data?.company || data.status !== 'active') return json(200, { ok: true, linked: false, user: { id: user.id, email: user.email } });

    if (request.method === 'PATCH') {
      if (data.role !== 'admin') return json(403, { error: 'Somente o administrador pode alterar o nome da empresa.' });
      if (!(await consumeRateLimit(env, db, 'company-rename', user.id, 5, 3600))) {
        return json(429, { error: 'Muitas alterações. Aguarde e tente novamente.' });
      }
      const body = await parse(request, 4096);
      const name = String(body.name || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 180) return json(400, { error: 'Informe um nome entre 2 e 180 caracteres.' });
      const { data: updated, error: updateError } = await db.from('m360_companies')
        .update({ name }).eq('id', data.company_id).select('id,name,created_at').maybeSingle();
      if (updateError) {
        if (updateError.code === '23505') return json(409, { error: 'Já existe uma empresa cadastrada com esse nome.' });
        return json(500, { error: 'Não foi possível atualizar o nome da empresa.' });
      }
      if (!updated) return json(404, { error: 'Empresa não encontrada.' });
      return json(200, { ok: true, linked: true, role: data.role, company: updated, user: { id: user.id, email: user.email } });
    }

    return json(200, {
      ok: true,
      linked: true,
      role: data.role,
      company: data.company,
      user: { id: user.id, email: user.email }
    });
  } catch {
    return json(500, { error: 'Falha interna ao consultar a empresa.' });
  }
}
