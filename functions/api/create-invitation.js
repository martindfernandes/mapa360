import { supabase, json, parse, admin, sha, mail, randomToken } from './_shared.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });
  try {
    const body = await parse(request);
    if (!String(body.company || '').trim()) return json(400, { error: 'Informe a empresa' });
    const token = randomToken();
    const days = Math.min(90, Math.max(1, Number(body.expiresInDays) || 30));
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    const db = supabase(env);
    const { data, error } = await db.from('m360_invitations').insert({
      company_name: String(body.company).slice(0, 180), contact_name: String(body.contact || '').slice(0, 120),
      contact_email: String(body.email || '').slice(0, 254), token_hash: await sha(token), status: 'convite criado', expires_at: expires
    }).select('id').single();
    if (error) return json(500, { error: 'Não foi possível criar o convite' });
    const siteUrl = env.PUBLIC_SITE_URL || new URL(request.url).origin;
    const url = `${siteUrl.replace(/\/$/, '')}/?token=${token}`;
    if (body.email) {
      try {
        await mail(env, { to: body.email, subject: 'Convite para Autoavaliação Mapeamento 360', html: `<p>Olá ${String(body.contact || '').replace(/[<>]/g, '')},</p><p>Você foi convidado(a) a preencher a autoavaliação da empresa ${String(body.company).replace(/[<>]/g, '')}.</p><p><a href="${url}">Acessar avaliação</a></p><p>Este link é individual e expira em ${new Date(expires).toLocaleDateString('pt-BR')}.</p>` });
      } catch (error) {
        return json(502, { error: 'Convite criado, mas o e-mail não foi enviado. Copie o link e verifique a configuração de e-mail.', url });
      }
    }
    return json(200, { id: data.id, url, expires_at: expires });
  } catch (error) { return json(500, { error: 'Falha interna ao criar o convite' }); }
}
