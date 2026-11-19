import { createClient } from '@supabase/supabase-js';
export const supabase=()=>{const u=process.env.SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw new Error('Backend ainda não configurado.');return createClient(u,k,{auth:{persistSession:false}})};
export const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':process.env.URL||'*'},body:JSON.stringify(body)});
export const parse=e=>{try{return JSON.parse(e.body||'{}')}catch{return {}}};
export const sha=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
export const admin=e=>{const h=e.headers?.authorization||e.headers?.Authorization||'';return !!process.env.ADMIN_API_TOKEN&&h===`Bearer ${process.env.ADMIN_API_TOKEN}`};
export const mail=async({to,subject,html})=>{if(!process.env.RESEND_API_KEY)throw new Error('RESEND_API_KEY não configurada');const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM||'Mapeamento 360 <onboarding@resend.dev>',to,subject,html})});if(!r.ok)throw new Error('Falha no serviço de e-mail');return r.json()};
