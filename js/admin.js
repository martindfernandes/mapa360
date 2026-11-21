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
function completedAt(x){return x.completed_at||x.last_activity_at||x.created_at}
function isCompleted(x){return x.status==='concluída'||x.status==='concluida'||!!x.completed_at}
function companyKey(value){return String(value||'').trim().replace(/\\s+/g,' ').toLocaleLowerCase('pt-BR')}
function renderOverview(all){
  const completed=all.filter(isCompleted);
  const companies=new Map();
  completed.forEach(item=>{
    const name=String(item.company_name||'').trim()||'Empresa não informada';
    const key=companyKey(name)||'__sem_nome__';
    if(!companies.has(key))companies.set(key,{name,count:0,last:null});
    const entry=companies.get(key);entry.count++;
    const date=completedAt(item);
    if(date&&(!entry.last||new Date(date)>new Date(entry.last)))entry.last=date;
  });
  const reassessments=[...companies.values()].reduce((sum,item)=>sum+Math.max(0,item.count-1),0);
  $('metricTotal').textContent=completed.length.toLocaleString('pt-BR');
  $('metricReassessments').textContent=reassessments.toLocaleString('pt-BR');
  $('metricCompanies').textContent=companies.size.toLocaleString('pt-BR');
  const monthly=new Map();
  completed.forEach(item=>{
    const date=completedAt(item);if(!date)return;
    const parsed=new Date(date);if(Number.isNaN(parsed.getTime()))return;
    const key=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(parsed);
    monthly.set(key,(monthly.get(key)||0)+1);
  });
  const months=[...monthly.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const chart=$('monthlyChart');
  if(!months.length)chart.innerHTML='<p class="muted">Ainda não há avaliações concluídas.</p>';
  else{
    const max=Math.max(...months.map(x=>x[1]),1);
    chart.innerHTML=months.map(([key,value])=>{
      const [year,month]=key.split('-');
      const label=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(Number(year),Number(month)-1,1))).replace('.','');
      const height=Math.max(4,Math.round(value/max*130));
      return '<div class="month-column" title="'+esc(label+'/'+year+': '+value+' avaliação(ões)' )+'"><strong>'+value+'</strong><div class="month-bar" style="height:'+height+'px"></div><small>'+esc(label)+'/'+year.slice(2)+'</small></div>';
    }).join('');
  }
  const companyList=[...companies.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
  $('companyRows').innerHTML=companyList.map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+item.count+'</td><td>'+Math.max(0,item.count-1)+'</td><td>'+esc(fmtDate(item.last))+'</td></tr>').join('')||'<tr><td colspan="4">Nenhuma empresa com avaliação concluída.</td></tr>';
  $('metricsNotice').textContent='Reavaliação = cada avaliação concluída após a primeira, agrupada pelo nome da empresa (sem diferenciar maiúsculas/minúsculas e espaços extras).'+(companyList.length?'':'');
}
async function refresh(){
  const d=await api('admin-evaluations');
  const evaluations=d.evaluations||[];
  renderOverview(evaluations);
  $('rows').innerHTML=evaluations.map(x=>'<tr><td>'+esc(x.company_name)+'</td><td>'+esc(x.contact_name)+'</td><td>'+esc(x.status)+'</td><td>'+esc(fmtDate(x.created_at))+'</td><td>'+esc(fmtDate(x.last_activity_at))+'</td><td>'+(isCompleted(x)?'<button type="button" data-open-result="'+esc(x.id)+'">Abrir resultado</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="6">Nenhum convite cadastrado.</td></tr>';
  if(d.truncated)$('metricsNotice').textContent+=' Atenção: a consulta atingiu o limite de segurança de 10.000 registros; os indicadores podem estar incompletos.';
}
$('enter').onclick=async()=>{token=$('adminToken').value;try{await refresh();$('login').classList.add('hidden');$('dashboard').classList.remove('hidden')}catch(e){msg('loginMsg',e.message)}};
$('create').onclick=async()=>{try{const d=await api('create-invitation',{company:$('company').value,contact:$('contact').value,email:$('email').value,expiresInDays:Number($('days').value)});$('created').innerHTML='<p><b>Link criado:</b></p><input readonly value="'+esc(d.url)+'" id="newUrl"><button id="copy">Copiar link</button><p class="muted">O link é individual e expira conforme a validade escolhida.</p>';$('copy').onclick=()=>navigator.clipboard.writeText(d.url);await refresh()}catch(e){msg('created',e.message)}};
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
