import { supabase, json, admin, parse, sameOrigin, consumeRateLimit } from './_shared.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['promote', 'demote', 'transfer', 'remove', 'block', 'unblock']);

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado' });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });

  try {
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    const db = supabase(env);
    if (!(await consumeRateLimit(env, db, 'admin-member', ip, 10, 900))) {
      return json(429, { error: 'Muitas operações administrativas. Aguarde e tente novamente.' });
    }
    if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });
    const body = await parse(request, 4096);
    const companyId = String(body.company_id || '');
    const userId = String(body.user_id || '');
    const action = String(body.action || '');
    if (!UUID.test(companyId) || !UUID.test(userId) || !ACTIONS.has(action)) {
      return json(400, { error: 'Dados da operação inválidos' });
    }

    // O bloqueio/desbloqueio também atua no Supabase Auth, não apenas no vínculo empresarial.
    if (action === 'block' || action === 'unblock') {
      const ban_duration = action === 'block' ? '876000h' : 'none';
      const { error: authError } = await db.auth.admin.updateUserById(userId, { ban_duration });
      if (authError) return json(400, { error: 'Não foi possível alterar o acesso da conta. Nenhuma alteração no vínculo foi aplicada.' });
      const { error: rpcError } = await db.rpc('manage_m360_company_member', {
        p_company_id: companyId, p_user_id: userId, p_action: action
      });
      if (rpcError) {
        await db.auth.admin.updateUserById(userId, { ban_duration: action === 'block' ? 'none' : '876000h' });
        const message = rpcError.message || '';
        if (message.includes('last_active_admin')) return json(409, { error: 'A empresa precisa manter pelo menos um administrador ativo.' });
        return json(400, { error: 'Não foi possível concluir a alteração. O acesso foi restaurado ao estado anterior.' });
      }
    } else {
      const { error } = await db.rpc('manage_m360_company_member', {
        p_company_id: companyId, p_user_id: userId, p_action: action
      });
      if (error) {
        const message = error.message || '';
        if (message.includes('last_active_admin')) return json(409, { error: 'A empresa precisa manter pelo menos um administrador ativo.' });
        if (message.includes('member_blocked')) return json(409, { error: 'Desbloqueie o usuário antes de promovê-lo ou transferir a administração.' });
        if (message.includes('member_not_found')) return json(404, { error: 'Usuário não encontrado nesta empresa.' });
        return json(400, { error: 'Não foi possível concluir a operação.' });
      }
    }
    return json(200, { ok: true, action });
  } catch (error) {
    return json(Number(error?.status) || 500, { error: error?.message || 'Falha interna ao administrar usuário' });
  }
}
