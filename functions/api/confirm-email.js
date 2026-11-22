import { supabase, json, sha } from './_shared.js';
export async function onRequest({request,env}) {
  if(request.method!=='GET') return json(405,{error:'Método não permitido.'});
  if(env.CF_PAGES_BRANCH!=='feature/1.2.0-contas-usuarios') return json(404,{error:'Não encontrado.'});
  const token=new URL(request.url).searchParams.get('token')||'';
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return Response.redirect(new URL('/conta.html?email-confirmation=invalid',request.url),303);
  try {
    const db=supabase(env); const {error}=await db.rpc('consume_m360_email_verification',{p_token_hash:await sha(token)});
    return Response.redirect(new URL(error?'/conta.html?email-confirmation=invalid':'/conta.html?email-confirmed=1',request.url),303);
  } catch { return Response.redirect(new URL('/conta.html?email-confirmation=error',request.url),303); }
}
