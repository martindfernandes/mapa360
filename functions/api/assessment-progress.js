import { supabase, json, parse, sha, sameOrigin, validSessionToken, consumeRateLimit } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env);
    const hash = await sha(token);
    if (!(await consumeRateLimit(env, db, 'assessment-progress', hash, 120, 900))) {
      return json(429, { error: 'Muitas atualizações. Aguarde alguns instantes e tente novamente.' });
    }
    const { data: invitation, error } = await db.from('m360_invitations')
      .select('id,status,expires_at').eq('token_hash', hash).maybeSingle();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    if (invitation.status === 'concluída') return json(409, { error: 'Esta avaliação já foi concluída' });
    const body = await parse(request, 600 * 1024);
    const assessment = body.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return json(400, { error: 'Rascunho inválido' });
    const now = new Date().toISOString();
    const { error: saveError } = await db.from('m360_drafts').upsert({
      invitation_id: invitation.id, payload: assessment, updated_at: now
    }, { onConflict: 'invitation_id' });
    if (saveError) return json(500, { error: 'Não foi possível salvar o rascunho' });
    await db.from('m360_invitations').update({ status: 'em andamento', last_activity_at: now }).eq('id', invitation.id);
    return json(200, { ok: true });
  } catch (error) {
    const status = Number(error?.status);
    if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
    return json(500, { error: 'Falha interna ao salvar o rascunho' });
  }
}
