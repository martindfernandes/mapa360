import { supabase, json, parse, sha } from './_shared.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token.length < 30) return json(401, { error: 'Link inválido' });

  const db = supabase();
  const hash = await sha(token);
  const { data: invitation, error } = await db
    .from('m360_invitations')
    .select('id,status,expires_at')
    .eq('token_hash', hash)
    .single();

  if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
  if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
  if (invitation.status === 'concluída') return json(409, { error: 'Esta avaliação já foi concluída' });

  const body = await parse(request);
  const assessment = body.assessment;
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) {
    return json(400, { error: 'Rascunho inválido' });
  }

  const now = new Date().toISOString();
  const { error: saveError } = await db.from('m360_drafts').upsert(
    { invitation_id: invitation.id, payload: assessment, updated_at: now },
    { onConflict: 'invitation_id' }
  );
  if (saveError) return json(500, { error: 'Não foi possível salvar o rascunho' });

  await db.from('m360_invitations')
    .update({ status: 'em andamento', last_activity_at: now })
    .eq('id', invitation.id);
  return json(200, { ok: true });
}
