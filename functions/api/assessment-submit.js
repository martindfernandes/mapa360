import { supabase, json, parse, sha, mail, sameOrigin, validSessionToken, requestError } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validSessionToken(token)) return json(401, { error: 'Link inválido' });
  try {
    const db = supabase(env), hash = await sha(token);
    const { data: invitation, error } = await db.from('m360_invitations').select('id,company_name,status,expires_at').eq('token_hash', hash).single();
    if (error || !invitation) return json(404, { error: 'Convite não encontrado' });
    if (new Date(invitation.expires_at) < new Date()) return json(410, { error: 'Este link expirou' });
    if (invitation.status === 'concluída') return json(409, { error: 'Esta avaliação já foi concluída' });
    const body = await parse(request, 1024 * 1024), assessment = body.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return json(400, { error: 'Avaliação inválida' });
    const now = new Date().toISOString();
    const { error: saveError } = await db.from('m360_submissions').upsert({ invitation_id: invitation.id, payload: assessment, submitted_at: now }, { onConflict: 'invitation_id' });
    if (saveError) return json(500, { error: 'Não foi possível registrar a avaliação' });
    const companyName = String(assessment.context?.company || invitation.company_name || '').trim().slice(0, 180);
    await db.from('m360_invitations').update({ company_name: companyName, status: 'concluída', completed_at: now, last_activity_at: now }).eq('id', invitation.id);
    if (env.NOTIFICATION_EMAIL) {
      try {
        await mail(env, { to: env.NOTIFICATION_EMAIL, subject: 'Mapeamento 360 · Autoavaliação concluída', html: `<p>Uma autoavaliação foi concluída.</p><p><b>Empresa:</b> ${String(companyName).replace(/[<>]/g, '')}</p><p>Entre no painel administrativo para consultar o status e acessar o registro.</p>` });
      } catch (error) { /* A avaliação permanece registrada mesmo se a notificação falhar. */ }
    }
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: 'Falha interna ao registrar a avaliação' });
  }
}
