import { supabase, json, sameOrigin } from './_shared.js';
function bearer(request) { const match=(request.headers.get('authorization')||'').match(/^Bearer\\s+([A-Za-z0-9._-]+)$/i); return match?match[1]:''; }
export async function onRequest({request,env}) {
  if(request.method!=='GET') return json(405,{error:'Método não permitido.'});
  if(env.CF_PAGES_BRANCH!=='feature/1.2.0-contas-usuarios') return json(404,{error:'Não encontrado.'});
  if(!sameOrigin(request)) return json(403,{error:'Origem não autorizada.'});
  const token=bearer(request); if(!token) return json(401,{error:'Entre na sua conta.'});
  try {
    const db=supabase(env); const {data:authData,error:authError}=await db.auth.getUser(token); const user=authData?.user;
    if(authError||!user?.email) return json(401,{error:'Sessão inválida.'});
    const {data,error}=await db.from('m360_email_status').select('email,verified_at').eq('user_id',user.id).maybeSingle();
    if(error) return json(500,{error:'Não foi possível consultar a confirmação do e-mail.'});
    const verified=!!data?.verified_at&&String(data.email).toLowerCase()===user.email.toLowerCase();
    return json(200,{ok:true,verified,email:user.email});
  } catch { return json(500,{error:'Falha interna ao consultar a confirmação.'}); }
}
