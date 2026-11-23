import { supabase, json, parse, sameOrigin } from './_shared.js';

function bearer(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i);
  return match ? match[1] : '';
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['promote', 'demote', 'remove', 'block', 'unblock']);

export async function onRequest({ request, env }) {
  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') return json(404, { error: 'Não encontrado.' });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada.' });
  const token = bearer(request);
  if (!token) return json(401, { error: 'Entre na sua conta para continuar.' });

  try {
    const db = supabase(env);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor || !actor.email_confirmed_at) return json(401, { error: 'Sessão inválida.' });

    const { data: membership, error: membershipError } = await db
      .from('m360_company_members')
      .select('company_id,role,status')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (membershipError) return json(500, { error: 'Não foi possível validar suas permissões.' });
    if (!membership || membership.status !== 'active' || membership.role !== 'admin') {
      return json(403, { error: 'Somente administradores ativos podem gerenciar participantes.' });
    }

    const body = await parse(request, 4096);
    const userId = String(body.user_id || '');
    const action = String(body.action || '');
    if (!UUID.test(userId) || !ACTIONS.has(action)) return json(400, { error: 'Operação inválida.' });

    const { data: target, error: targetError } = await db
      .from('m360_company_members')
      .select('user_id,role,status')
      .eq('company_id', membership.company_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (targetError) return json(500, { error: 'Não foi possível localizar o participante.' });
    if (!target) return json(404, { error: 'Participante não encontrado nesta empresa.' });

    if (action === 'block' || action === 'unblock') {
      const previousBan = action === 'block' ? 'none' : '876000h';
      const nextBan = action === 'block' ? '876000h' : 'none';
      const { error: authUpdateError } = await db.auth.admin.updateUserById(userId, { ban_duration: nextBan });
      if (authUpdateError) return json(400, { error: 'Não foi possível alterar o acesso à conta.' });
      const { error: rpcError } = await db.rpc('manage_m360_company_member', {
        p_company_id: membership.company_id, p_user_id: userId, p_action: action
      });
      if (rpcError) {
        await db.auth.admin.updateUserById(userId, { ban_duration: previousBan });
        if ((rpcError.message || '').includes('last_active_admin')) return json(409, { error: 'A empresa precisa manter pelo menos um administrador ativo.' });
        return json(400, { error: 'Não foi possível concluir a operação. O acesso anterior foi restaurado.' });
      }
    } else {
      const { error: rpcError } = await db.rpc('manage_m360_company_member', {
        p_company_id: membership.company_id, p_user_id: userId, p_action: action
      });
      if (rpcError) {
        const detail = rpcError.message || '';
        if (detail.includes('last_active_admin')) return json(409, { error: 'A empresa precisa manter pelo menos um administrador ativo.' });
        if (detail.includes('member_blocked')) return json(409, { error: 'Desbloqueie o participante antes de alterar seu perfil.' });
        if (detail.includes('member_not_found')) return json(404, { error: 'Participante não encontrado nesta empresa.' });
        return json(400, { error: 'Não foi possível concluir a operação.' });
      }
    }

    return json(200, { ok: true, action });
  } catch (error) {
    return json(Number(error?.status) || 500, { error: error?.message || 'Falha interna ao gerenciar participante.' });
  }
}
