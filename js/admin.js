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
function companyKey(value){return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR')}
function renderOverview(all){
  const completed=all.filter(isCompleted);
  const companies=new Map();
  completed.forEach(item=>{
    const name=String(item.company_name||'').trim()||'Empresa não informada';
    const key=companyKey(name)||'__sem_nome__';
    if(!companies.has(key))companies.set(key,{name,count:0,last:null,locations:new Set()});
    const entry=companies.get(key);entry.count++;
    if(item.municipality&&item.state)entry.locations.add(item.municipality+' / '+item.state);
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
  $('companyRows').innerHTML=companyList.map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+esc([...item.locations].sort().join(', ')||'—')+'</td><td>'+item.count+'</td><td>'+Math.max(0,item.count-1)+'</td><td>'+esc(fmtDate(item.last))+'</td></tr>').join('')||'<tr><td colspan="5">Nenhuma empresa com avaliação concluída.</td></tr>';
  const byLocation=new Map();
  completed.forEach(item=>{ const municipality=String(item.municipality||'').trim(); const state=String(item.state||'').trim().toUpperCase(); if(!municipality||!/^[A-Z]{2}$/.test(state))return; const key=municipality.toLocaleLowerCase('pt-BR')+'|'+state; if(!byLocation.has(key))byLocation.set(key,{municipality,state,count:0}); byLocation.get(key).count++; });
  const locations=[...byLocation.values()].sort((a,b)=>b.count-a.count||a.municipality.localeCompare(b.municipality,'pt-BR'));
  const locationRows=$('locationRows'); if(locationRows)locationRows.innerHTML=locations.map(item=>'<tr><td>'+esc(item.municipality)+'</td><td>'+esc(item.state)+'</td><td>'+item.count+'</td></tr>').join('')||'<tr><td colspan="3">Ainda não há localização informada em avaliações concluídas.</td></tr>';
  const locationTotal=locations.reduce((sum,item)=>sum+item.count,0); const locationNotice=$('locationNotice'); if(locationNotice)locationNotice.textContent=locationTotal+' avaliação(ões) com município e UF identificados · '+locations.length+' município(s).';
  $('metricsNotice').textContent='Reavaliação = cada avaliação concluída após a primeira, agrupada pelo nome da empresa (sem diferenciar maiúsculas/minúsculas e espaços extras).';
}
async function refresh(){
  const d=await api('admin-evaluations');
  const evaluations=d.evaluations||[];
  renderOverview(evaluations);
  $('rows').innerHTML=evaluations.map(x=>'<tr><td>'+esc(x.company_name)+'</td><td>'+esc(x.contact_name)+'</td><td>'+esc(x.status)+'</td><td>'+esc(fmtDate(x.created_at))+'</td><td>'+esc(fmtDate(x.last_activity_at))+'</td><td>'+(isCompleted(x)?'<button type="button" data-open-result="'+esc(x.id)+'">Abrir resultado</button>':'—')+' <button type="button" class="danger" data-delete-evaluation="'+esc(x.id)+'" data-company="'+esc(x.company_name||'Empresa não informada')+'">Excluir</button></td></tr>').join('')||'<tr><td colspan="6">Nenhum convite cadastrado.</td></tr>';
  if(d.truncated)$('metricsNotice').textContent+=' Atenção: a consulta atingiu o limite de segurança de 10.000 registros; os indicadores podem estar incompletos.';
}
$('enter').onclick=async()=>{token=$('adminToken').value;try{await refresh();await refreshCompanies();$('login').classList.add('hidden');$('dashboard').classList.remove('hidden')}catch(e){msg('loginMsg',e.message)}};
$('create').onclick=async()=>{try{const d=await api('create-invitation',{company:$('company').value,contact:$('contact').value,email:$('email').value,expiresInDays:Number($('days').value)});$('created').innerHTML='<p><b>Link criado:</b></p><input readonly value="'+esc(d.url)+'" id="newUrl"><button id="copy">Copiar link</button><p class="muted">O link é individual e expira conforme a validade escolhida.</p>';$('copy').onclick=()=>navigator.clipboard.writeText(d.url);await refresh()}catch(e){msg('created',e.message)}};
$('refresh').onclick=()=>refresh().catch(e=>msg('rows',e.message));
$('rows').addEventListener('click',async e=>{
  const deleteButton=e.target.closest('[data-delete-evaluation]');
  if(deleteButton){
    const id=deleteButton.dataset.deleteEvaluation;
    const company=deleteButton.dataset.company||'Empresa não informada';
    if(!window.confirm('ATENÇÃO: excluir definitivamente a avaliação de "'+company+'"?\\n\\nAs respostas e os rascunhos vinculados também serão apagados. Esta ação não pode ser desfeita.'))return;
    const confirmation=window.prompt('Para confirmar a exclusão, digite exatamente o nome da empresa:\\n\\n'+company);
    if(confirmation===null)return;
    if(confirmation!==company){msg('rows','O nome digitado não corresponde exatamente. Nenhum dado foi excluído.');return;}
    deleteButton.disabled=true;deleteButton.textContent='Excluindo…';
    try{
      await api('delete-evaluation',{id,confirmation});
      msg('rows','Avaliação de "'+company+'" excluída. Indicadores e listas foram atualizados.');
      await refresh();
    }catch(error){
      msg('rows',error.message);
      deleteButton.disabled=false;deleteButton.textContent='Excluir';
    }
    return;
  }
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

async function refreshCompanies(){
  const notice=$('companyAdminNotice'), target=$('companyAdminRows');
  notice.textContent='Carregando empresas e usuários…';
  const data=await api('admin-companies');
  const companies=data.companies||[];
  if(!companies.length){target.innerHTML='<p class="muted">Nenhuma empresa cadastrada.</p>';notice.textContent='Consulta concluída.';return;}
  target.innerHTML=companies.map(company=>{
    const members=company.members||[];
    const rows=members.map(member=>{
      const blocked=member.status==='blocked'||!!(member.banned_until&&new Date(member.banned_until)>new Date());
      const role=member.role==='admin'?'Administrador':'Membro';
      const state=blocked?'Bloqueado':'Ativo';
      const actions=[];
      if(member.role!=='admin'&&!blocked) actions.push('<button data-member-action="promote">Tornar administrador</button>');
      if(member.role==='admin') actions.push('<button data-member-action="transfer">Transferir administração</button>');
      if(member.role==='admin') actions.push('<button data-member-action="demote">Tornar membro</button>');
      actions.push(blocked?'<button data-member-action="unblock">Desbloquear</button>':'<button class="danger" data-member-action="block">Bloquear</button>');
      actions.push('<button class="danger" data-member-action="remove">Remover da empresa</button>');
      return '<tr><td>'+esc(member.email||'E-mail indisponível')+'</td><td>'+role+'</td><td>'+state+'</td><td>'+esc(fmtDate(member.joined_at))+'</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">'+actions.map((button,index)=>button.replace('<button','<button data-company-id="'+esc(company.id)+'" data-user-id="'+esc(member.user_id)+'"')).join('')+'</div></td></tr>';
    }).join('');
    return '<article style="padding:16px 0;border-bottom:1px solid #e5edf5"><h3 style="margin:0 0 10px">'+esc(company.name)+'</h3><p class="muted">'+members.length+' usuário(s) vinculado(s) · Criada em '+esc(fmtDate(company.created_at))+'</p><div class="company-table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Acesso</th><th>Vinculado em</th><th>Ações</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>';
  }).join('');
  notice.textContent=companies.length+' empresa(s) carregada(s).';
}
$('refreshCompanies').onclick=()=>refreshCompanies().catch(e=>msg('companyAdminNotice',e.message));
$('companyAdminRows').addEventListener('click',async event=>{
  const button=event.target.closest('[data-member-action]');
  if(!button)return;
  const action=button.dataset.memberAction, companyId=button.dataset.companyId, userId=button.dataset.userId;
  const labels={promote:'tornar este usuário administrador',demote:'rebaixar este administrador para membro',transfer:'transferir a administração para este usuário (os demais administradores virarão membros)',remove:'remover este usuário da empresa (a conta e as avaliações serão preservadas)',block:'bloquear esta conta em toda a plataforma',unblock:'desbloquear esta conta'};
  if(!window.confirm('Confirma '+labels[action]+'?'))return;
  button.disabled=true;
  try{
    await api('admin-manage-member',{company_id:companyId,user_id:userId,action});
    msg('companyAdminNotice','Operação concluída.');
    await refreshCompanies();
  }catch(error){
    msg('companyAdminNotice',error.message);
    button.disabled=false;
  }
});
