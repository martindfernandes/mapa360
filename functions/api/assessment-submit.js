import { supabase, json, parse, sha, mail } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token.length < 30) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env), hash = await sha(token);
    const { data: invitation, error } = await db.from('m360_invitations').select('id,company_name,status,expires_at').eq('token_hash', hash).single();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    const body = await parse(request), assessment = body.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return json(400, { error: 'Avaliação inválida' });
    const now = new Date().toISOString();
    const { error: saveError } = await db.from('m360_submissions').upsert({ invitation_id: invitation.id, payload: assessment, submitted_at: now }, { onConflict: 'invitation_id' });
    if (saveError) return json(500, { error: 'Não foi possível registrar a avaliação' });
    await db.from('m360_invitations').update({ status: 'concluída', completed_at: now, last_activity_at: now }).eq('id', invitation.id);
    if (env.NOTIFICATION_EMAIL) {
      try {
        await mail(env, { to: env.NOTIFICATION_EMAIL, subject: 'Mapeamento 360 · Autoavaliação concluída', html: `<p>Uma autoavaliação foi concluída.</p><p><b>Empresa:</b> ${String(invitation.company_name).replace(/[<>]/g, '')}</p><p>Entre no painel administrativo para consultar o status e acessar o registro.</p>` });
      } catch (error) { /* A avaliação permanece registrada mesmo se a notificação falhar. */ }
    }
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: 'Falha interna ao registrar a avaliação' });
  }
}
