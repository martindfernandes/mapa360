'use strict';
let token='';
const $=id=>document.getElementById(id);
const api=async(path,body,query='')=>{
  const r=await fetch('/api/'+path+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'Falha na solicitação');
  return d;
};
function msg(id,t){$(id).textContent=t}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmtDate(value){if(!value)return '—';const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}
async function refresh(){
  const d=await api('admin-evaluations');
  $('rows').innerHTML=(d.evaluations||[]).map(x=>`<tr><td>${esc(x.company_name)}</td><td>${esc(x.contact_name)}</td><td>${esc(x.status)}</td><td>${esc(fmtDate(x.created_at))}</td><td>${esc(fmtDate(x.last_activity_at))}</td><td>${x.status==='concluída'?'<button type="button" data-open-result="'+esc(x.id)+'">Abrir resultado</button>':'—'}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum convite cadastrado.</td></tr>';
}
$('enter').onclick=async()=>{token=$('adminToken').value;try{await refresh();$('login').classList.add('hidden');$('dashboard').classList.remove('hidden')}catch(e){msg('loginMsg',e.message)}};
$('create').onclick=async()=>{try{const d=await api('create-invitation',{company:$('company').value,contact:$('contact').value,email:$('email').value,expiresInDays:Number($('days').value)});$('created').innerHTML=`<p><b>Link criado:</b></p><input readonly value="${esc(d.url)}" id="newUrl"><button id="copy">Copiar link</button><p class="muted">O link é individual e expira conforme a validade escolhida.</p>`;$('copy').onclick=()=>navigator.clipboard.writeText(d.url);await refresh()}catch(e){msg('created',e.message)}};
$('refresh').onclick=()=>refresh().catch(e=>msg('rows',e.message));
$('rows').addEventListener('click',async e=>{
  const button=e.target.closest('[data-open-result]');
  if(!button)return;
  const id=button.dataset.openResult;
  const reportWindow=window.open('about:blank','_blank');
  if(!reportWindow){msg('rows','O navegador bloqueou a nova aba. Permita pop-ups para abrir o relatório.');return;}
  button.disabled=true;button.textContent='Carregando…';
  try{
    const data=await api('admin-result',null,'?id='+encodeURIComponent(id));
    reportWindow.sessionStorage.setItem('m360.admin.report',JSON.stringify({assessment:data.assessment,company_name:data.company_name,submitted_at:data.submitted_at}));
    reportWindow.location.replace('./index.html?admin-report=1');
  }catch(error){reportWindow.close();msg('rows',error.message)}
  finally{button.disabled=false;button.textContent='Abrir resultado'}
});
