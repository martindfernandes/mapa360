import { supabase, json, admin } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return json(400, { error: 'Identificador de avaliação inválido' });
  }

  try {
    const db = supabase(env);
    const { data: invitation, error: invitationError } = await db
      .from('m360_invitations')
      .select('id,company_name,status')
      .eq('id', id)
      .single();

    if (invitationError || !invitation) return json(404, { error: 'Avaliação não encontrada' });
    if (invitation.status !== 'concluída') return json(409, { error: 'O resultado só está disponível após a conclusão' });

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
