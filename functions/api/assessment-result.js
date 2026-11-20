import { supabase, json, sha, validSessionToken } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Acesso ao resultado não autorizado' });

  try {
    const db = supabase(env);
    const tokenHash = await sha(token);
    const { data: invitation, error: invitationError } = await db
      .from('m360_invitations')
      .select('id,company_name,status,expires_at')
      .eq('token_hash', tokenHash)
      .single();

    if (invitationError || !invitation) return json(404, { error: 'Avaliação não encontrada para este acesso' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'O acesso a este resultado expirou' });
    if (invitation.status !== 'concluída') return json(409, { error: 'Esta avaliação ainda não foi concluída' });

    const { data: submission, error: submissionError } = await db
      .from('m360_submissions')
      .select('payload,submitted_at')
      .eq('invitation_id', invitation.id)
      .single();

    if (submissionError || !submission?.payload) return json(404, { error: 'Resultado ainda não disponível' });

    return json(200, {
      assessment: submission.payload,
      submitted_at: submission.submitted_at,
      company_name: invitation.company_name
    });
  } catch {
    return json(500, { error: 'Não foi possível carregar o resultado' });
  }
}
