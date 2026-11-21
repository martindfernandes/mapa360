import { supabase, json, parse, sha, sameOrigin, validSessionToken, requestError, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env);
    const hash = await sha(token);
    if (!(await consumeRateLimit(env, db, 'assessment-progress', hash, 180, 300))) {
      return json(429, { error: 'Muitos salvamentos em pouco tempo. Aguarde alguns instantes.' });
    }
    const { data: invitation, error } = await db.from('m360_invitations').select('id,status,expires_at').eq('token_hash', hash).single();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    if (invitation.status === 'concluída') return json(409, { error: 'Esta avaliação já foi concluída' });
    const body = await parse(request, 1024 * 1024), assessment = body.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return json(400, { error: 'Rascunho inválido' });
    const now = new Date().toISOString();
    const { error: saveError } = await db.from('m360_drafts').upsert({ invitation_id: invitation.id, payload: assessment, updated_at: now }, { onConflict: 'invitation_id' });
    if (saveError) return json(500, { error: 'Não foi possível salvar o rascunho' });
    const company = String(assessment.context?.company || '').trim().slice(0, 180);
    await db.from('m360_invitations').update({ status: 'em andamento', last_activity_at: now, ...(company ? { company_name: company } : {}) }).eq('id', invitation.id);
    return json(200, { ok: true });
  } catch (error) {
    return requestError(error, 'Falha interna ao salvar o rascunho');
  }
}
