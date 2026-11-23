(function(){
'use strict';
const MODULES=[
 ['geral','Diagnóstico geral'],['segmento','Perguntas do segmento'],['contexto_industrial','Ramo e produtos'],['ppcp','PPCP'],['automacao','Automação de processos'],['dados_bi','Dados e BI'],['administrativo','Processos administrativos'],['projetos','Gestão de projetos']
];
const $=id=>document.getElementById(id);
const state={role:'',members:[],assessments:[]};
function message(text,error=false){const el=$('pageMessage');el.textContent=text;el.classList.toggle('error',error);}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function moduleChoices(){
 $('moduleChoices').innerHTML=MODULES.map(([id,label])=>'<label><input type="checkbox" name="module" value="'+id+'" '+(id==='geral'?'checked disabled':'')+'><span>'+label+(id==='geral'?' (obrigatório)':'')+'</span></label>').join('');
}
function statusLabel(value){return ({draft:'Rascunho',in_progress:'Em andamento',completed:'Concluída',archived:'Arquivada',pending:'Pendente'}[value]||value||'—');}
function render(){
 $('assessmentList').innerHTML=state.assessments.length?state.assessments.map(a=>{
  const modules=(a.modules||[]).map(m=>{
   const label=MODULES.find(x=>x[0]===m.module_id)?.[1]||m.module_id;
   const assigned=state.members.find(u=>u.user_id===m.assigned_user_id);
   const control=state.role==='admin'
    ? '<select data-assessment="'+escapeHtml(a.id)+'" data-module="'+escapeHtml(m.module_id)+'" aria-label="Responsável pelo módulo '+escapeHtml(label)+'"><option value="">Não atribuído</option>'+state.members.filter(u=>u.status==='active').map(u=>'<option value="'+escapeHtml(u.user_id)+'" '+(m.assigned_user_id===u.user_id?'selected':'')+'>'+escapeHtml(u.name)+' · '+escapeHtml(u.email)+'</option>').join('')+'</select>'
    : '<span class="muted">'+(assigned?'Responsável: '+escapeHtml(assigned.name):m.assigned_user_id?'Responsável definido':'Aguardando distribuição')+'</span>';
   return '<div class="module-row"><div><strong>'+escapeHtml(label)+'</strong><small>'+statusLabel(m.status)+'</small></div>'+control+'</div>';
  }).join('');
  return '<article class="assessment"><div class="assessment-head"><div><h3>'+escapeHtml(a.title)+'</h3><div class="status">'+statusLabel(a.status)+' · Criada em '+new Date(a.created_at).toLocaleDateString('pt-BR')+'</div></div></div>'+modules+'</article>';
 }).join(''):'<div class="empty">Nenhuma avaliação criada ainda.</div>';
}
async function request(path,options={}){
 const session=await window.M360Auth.getSession();
 if(!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente.');
 const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{}),Authorization:'Bearer '+session.access_token},cache:'no-store'});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error||'Não foi possível concluir a operação.');
 return data;
}
async function load(){
 const data=await request('/api/company-assessments');
 state.role=data.role;state.assessments=data.assessments||[];
 if(state.role!=='admin'){message('Você pode acessar avaliações com módulos atribuídos à sua conta. A distribuição é gerenciada pelo administrador.');$('createCard').hidden=true;}
 else{
  const members=await request('/api/company-assessment-members');
  state.members=members.members||[];
  $('createCard').hidden=false;
  message('Conta autenticada como administrador. Você pode criar avaliações e distribuir os módulos.');
 }
 $('assessmentCard').hidden=false;render();
}
$('createForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('createButton');button.disabled=true;
 try{
  const modules=[...document.querySelectorAll('input[name="module"]:checked')].map(el=>el.value);
  await request('/api/company-assessments',{method:'POST',body:JSON.stringify({title:$('assessmentTitle').value.trim(),modules,shared_payload:{}})});
  $('assessmentTitle').value='';await load();message('Avaliação criada. Agora distribua os módulos aos participantes.');
 }catch(error){message(error.message,true);}finally{button.disabled=false;}
});
$('assessmentList').addEventListener('change',async event=>{
 const select=event.target.closest('select[data-assessment][data-module]');if(!select)return;
 select.disabled=true;
 try{
  await request('/api/company-assessment-module',{method:'POST',body:JSON.stringify({action:'assign',assessment_id:select.dataset.assessment,module_id:select.dataset.module,assigned_user_id:select.value||null})});
  message('Responsável do módulo atualizado.');
 }catch(error){message(error.message,true);await load();}finally{select.disabled=false;}
});
async function start(){
 moduleChoices();
 try{
  const session=await window.M360Auth.getSession();
  if(!session?.user){message('Entre na sua conta para administrar as avaliações.',true);return;}
  await load();
 }catch(error){message(error.message,true);}
}
start();
})();