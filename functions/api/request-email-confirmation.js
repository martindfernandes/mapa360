import { supabase, json, sameOrigin, consumeRateLimit, randomToken, sha, mail } from './_shared.js';
function bearer(request) { const match=(request.headers.get('authorization')||'').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i); return match?match[1]:''; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
export async function onRequest({request,env}) {
  if(request.method!=='POST') return json(405,{error:'Método não permitido.'});
  if(env.CF_PAGES_BRANCH!=='feature/1.2.0-contas-usuarios') return json(404,{error:'Não encontrado.'});
  if(!sameOrigin(request)) return json(403,{error:'Origem não autorizada.'});
  const accessToken=bearer(request); if(!accessToken) return json(401,{error:'Entre na sua conta para confirmar o e-mail.'});
  try {
    const db=supabase(env); const {data:authData,error:authError}=await db.auth.getUser(accessToken); const user=authData?.user;
    if(authError||!user?.email) return json(401,{error:'Sessão inválida. Entre novamente.'});
    if(!(await consumeRateLimit(env,db,'email-confirmation-request',user.id,3,3600))) return json(429,{error:'Você já solicitou confirmações recentemente. Aguarde um pouco.'});
    const {data:status}=await db.from('m360_email_status').select('verified_at,email').eq('user_id',user.id).maybeSingle();
    if(status?.verified_at&&String(status.email).toLowerCase()===user.email.toLowerCase()) return json(200,{ok:true,verified:true,message:'Este e-mail já está confirmado.'});
    const token=randomToken(), tokenHash=await sha(token), now=new Date();
    const {error:saveError}=await db.from('m360_email_verifications').upsert({user_id:user.id,email:user.email.toLowerCase(),token_hash:tokenHash,expires_at:new Date(now.getTime()+86400000).toISOString(),created_at:now.toISOString(),consumed_at:null},{onConflict:'user_id'});
    if(saveError) return json(500,{error:'Não foi possível preparar a confirmação. Tente novamente.'});
    const link=new URL('/api/confirm-email',request.url); link.searchParams.set('token',token);
    const name=escapeHtml(user.user_metadata?.full_name||'Olá');
    try {
      await mail(env,{to:user.email,subject:'Confirme seu e-mail · Mapa 360',html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172b3a"><h2>Confirme seu e-mail</h2><p>'+name+', clique no botão abaixo para confirmar o endereço utilizado no Mapa 360.</p><p><a href="'+escapeHtml(link.toString())+'" style="display:inline-block;padding:12px 18px;background:#087c72;color:#fff;text-decoration:none;border-radius:8px">Confirmar e-mail</a></p><p>Este link expira em 24 horas e só pode ser usado uma vez. Se você não solicitou, ignore esta mensagem.</p></div>'});
    } catch {
      await db.from('m360_email_verifications').delete().eq('user_id',user.id).eq('token_hash',tokenHash);
      return json(502,{error:'Não foi possível enviar o e-mail. A configuração de envio precisa ser verificada.'});
    }
    return json(200,{ok:true,verified:false,message:'Enviamos um link de confirmação para '+user.email+'. Verifique também a caixa de spam.'});
  } catch { return json(500,{error:'Falha interna ao solicitar a confirmação.'}); }
}
