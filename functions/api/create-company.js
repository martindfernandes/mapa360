import { supabase, json, parse, sameOrigin, consumeRateLimit } from './_shared.js';

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para cadastrar uma empresa.' });

  try {
    const db = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, db, 'company-create-ip', ip, 20, 900))) {
      return json(429, { error: 'Muitas tentativas de criação de empresa. Aguarde e tente novamente.' });
    }
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at) {
      return json(401, { error: 'Sessão inválida ou e-mail ainda não confirmado.' });
    }

    if (!(await consumeRateLimit(env, db, 'company-create', user.id, 5, 3600))) {
      return json(429, { error: 'Muitas tentativas. Aguarde e tente novamente.' });
    }

    const body = await parse(request, 4096);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 180) {
      return json(400, { error: 'Informe o nome da empresa (de 2 a 180 caracteres).' });
    }

    const { data, error } = await db.rpc('create_m360_company', {
      p_name: name,
      p_user_id: user.id
    });

    if (error) {
      if (error.code === '23505' && /m360_company_members_user_unique/.test(error.details || error.message || '')) {
        return json(409, { error: 'Sua conta já está vinculada a uma empresa.' });
      }
      if (error.code === '23505') {
        return json(409, { error: 'Já existe uma empresa cadastrada com esse nome. Se você faz parte dela, solicite um convite ao administrador.' });
      }
      if (error.code === 'P0001' && /user_already_has_company/.test(error.message || '')) {
        return json(409, { error: 'Sua conta já está vinculada a uma empresa.' });
      }
      if (error.code === '22023') return json(400, { error: 'Nome da empresa ou usuário inválido.' });
      return json(500, { error: 'Não foi possível cadastrar a empresa. Tente novamente.' });
    }

    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.company_id) return json(500, { error: 'Não foi possível confirmar o cadastro da empresa.' });

    return json(201, {
      ok: true,
      linked: true,
      role: 'admin',
      company: { id: created.company_id, name: created.company_name }
    });
  } catch {
    return json(500, { error: 'Falha interna ao cadastrar a empresa.' });
  }
}
