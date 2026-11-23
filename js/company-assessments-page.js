(function(){
'use strict';
const MODULES=[['geral','Diagnóstico geral'],['segmento','Perguntas do segmento'],['contexto_industrial','Ramo e produtos'],['ppcp','PPCP'],['automacao','Automação de processos'],['dados_bi','Dados e BI'],['administrativo','Processos administrativos'],['projetos','Gestão de projetos']];
const $=id=>document.getElementById(id);
const state={role:'',members:[],assessments:[]};
function bootProgress(percent,label){const bar=$('areaBootBar'),value=$('areaBootPercent'),caption=$('areaBootLabel');if(bar)bar.style.width=percent+'%';if(value)value.textContent=percent+'%';if(caption)caption.textContent=label;}
function finishAreaBoot(){const loader=$('areaBootLoader');if(!loader)return;bootProgress(100,'Tudo pronto');loader.classList.add('is-hidden');window.setTimeout(()=>{loader.hidden=true;},220);}
function message(text,error=false){const el=$('pageMessage');el.textContent=text;el.classList.toggle('error',error);}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function moduleChoices(){$('moduleChoices').innerHTML=MODULES.map(([id,label])=>'<label><input type="checkbox" name="module" value="'+id+'" '+(id==='geral'?'checked disabled':'')+'><span>'+label+(id==='geral'?' · obrigatório':'')+'</span></label>').join('');renderCreateAssignments();}
function renderCreateAssignments(){
 const host=$('createAssignments');if(!host)return;
 const selected=[...document.querySelectorAll('input[name="module"]:checked')].map(x=>x.value);
 host.innerHTML=selected.map(id=>{const label=MODULES.find(x=>x[0]===id)?.[1]||id;return '<label class="create-assignee"><span>'+esc(label)+'</span><select name="assignee-'+id+'"><option value="">Definir depois</option>'+state.members.filter(u=>u.status==='active').map(u=>'<option value="'+esc(u.user_id)+'">'+esc(u.name)+' · '+esc(u.email)+'</option>').join('')+'</select></label>';}).join('');
}
function statusLabel(v){return({draft:'Ainda não iniciada',in_progress:'Em andamento',completed:'Concluída',archived:'Arquivada',pending:'Pendente'}[v]||v||'Em andamento');}
function statusClass(v){return v==='completed'?'completed':v==='draft'?'pending':'';}
function render(){
 const list=$('assessmentList');
 list.innerHTML=state.assessments.length?state.assessments.map(a=>{
  const mods=a.modules||[],done=mods.filter(m=>m.status==='completed').length,total=mods.length,pct=total?Math.round(done/total*100):0;
  const assignments=state.role==='admin' && a.status!=='completed' && a.status!=='archived' ? mods.map(m=>{
   const label=MODULES.find(x=>x[0]===m.module_id)?.[1]||m.module_id;
   const assigned=state.members.find(u=>u.user_id===m.assigned_user_id);
   const control=state.role==='admin'?'<select data-assessment="'+esc(a.id)+'" data-module="'+esc(m.module_id)+'" aria-label="Responsável por '+esc(label)+'"><option value="">Definir responsável…</option>'+state.members.filter(u=>u.status==='active').map(u=>'<option value="'+esc(u.user_id)+'" '+(m.assigned_user_id===u.user_id?'selected':'')+'>'+esc(u.name)+' · '+esc(u.email)+'</option>').join('')+'</select>':'<span class="muted">'+(assigned?'Responsável: '+esc(assigned.name):'Aguardando distribuição')+'</span>';
   return '<div class="module-assignment"><div><strong>'+esc(label)+'</strong><small>'+statusLabel(m.status)+'</small></div>'+control+'</div>';
  }).join('') : '';
  const href='/index.html?company-assessment='+encodeURIComponent(a.id);
  const configured = state.role==='admin' && a.status!=='completed' && a.status!=='archived' ? '<details class="assessment-settings"><summary>Editar avaliação e módulos</summary><form class="title-edit" data-edit-title data-assessment="'+esc(a.id)+'"><label>Nome da avaliação<input name="title" maxlength="180" minlength="2" required value="'+esc(a.title)+'"></label><button class="btn btn-light" type="submit">Salvar nome</button></form><div class="settings-modules"><strong>Módulos incluídos</strong>'+mods.map(m=>{const label=MODULES.find(x=>x[0]===m.module_id)?.[1]||m.module_id;const hasWork=m.status!=='pending';return '<div class="settings-module"><span>'+esc(label)+(hasWork?' · '+statusLabel(m.status):'')+'</span>'+(m.module_id!=='geral'&&!hasWork?'<button type="button" class="remove-module" data-remove-module data-assessment="'+esc(a.id)+'" data-module="'+esc(m.module_id)+'" data-version="'+esc(m.updated_at||'')+'">Remover</button>':(m.module_id==='geral'?'<small>Obrigatório</small>':''))+'</div>';}).join('')+'</div><form class="add-modules" data-add-modules data-assessment="'+esc(a.id)+'" data-version="'+esc(a.updated_at||'')+'"><strong>Adicionar módulos</strong><div class="module-selection-actions"><button type="button" class="btn btn-light" data-module-selection="all">Marcar todos</button><button type="button" class="btn btn-light" data-module-selection="none">Desmarcar todos</button></div><div class="add-module-choices">'+MODULES.filter(x=>!mods.some(m=>m.module_id===x[0])).map(([id,label])=>'<label><input type="checkbox" name="module" value="'+id+'"> '+esc(label)+'</label>').join('')+'</div><div class="add-modules-footer"><span>Marque os temas que deseja incluir.</span><button class="btn btn-primary" type="submit">Salvar módulos</button></div></form><p class="settings-note">Módulos com respostas ou atividade são preservados. Para mudar o responsável, use a lista de responsáveis acima.</p></details>' : '';
  return '<article class="assessment-item"><div class="assessment-head"><div><div class="assessment-title">'+esc(a.title)+'</div><div class="assessment-meta">Criada em '+(a.created_at?new Date(a.created_at).toLocaleDateString('pt-BR'):'—')+' · '+total+' módulo(s)</div></div><span class="status-pill '+statusClass(a.status)+'">'+statusLabel(a.status)+'</span></div><div class="progress-track" aria-label="'+pct+'% dos módulos concluídos"><i style="width:'+pct+'%"></i></div><div class="assessment-foot"><small>'+done+' de '+total+' módulos concluídos</small><div class="assessment-actions"><a class="open-assessment" href="'+href+'">'+(a.status==='completed'?'Consultar avaliação':'Continuar avaliação')+' →</a></div></div>'+(state.role==='admin'?assignments+configured:'')+'</article>';
 }).join(''):'<div class="empty">Ainda não há avaliações por aqui. '+(state.role==='admin'?'Quando criar a primeira, ela aparecerá nesta lista.':'Quando o administrador atribuir um módulo a você, a avaliação aparecerá aqui.')+'</div>';
}
async function request(path,options={}){const session=await window.M360Auth.getSession();if(!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente.');const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{}),Authorization:'Bearer '+session.access_token},cache:'no-store'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data;}
async function load(){const data=await request('/api/company-assessments');state.role=data.role;state.assessments=data.assessments||[];if(state.role==='admin'){const members=await request('/api/company-assessment-members');state.members=members.members||[];$('createArea').hidden=true;$('newAssessmentButton').hidden=false;renderCreateAssignments();message('Tudo certo. Escolha uma avaliação para continuar ou crie uma nova.');}else{$('createArea').hidden=true;$('newAssessmentButton').hidden=true;$('participantHint').hidden=false;message('Estas são as avaliações com módulos atribuídos à sua conta.');}$('assessmentCard').hidden=false;render();}
$('moduleChoices').addEventListener('change',renderCreateAssignments);
$('newAssessmentButton').addEventListener('click',()=>{$('nextStepCard').hidden=true;$('createArea').hidden=false;$('assessmentTitle').focus();$('createArea').scrollIntoView({behavior:'smooth',block:'start'});});
$('cancelCreate').addEventListener('click',()=>{$('createArea').hidden=true;});
$('createForm').addEventListener('submit',async event=>{event.preventDefault();const button=$('createButton');button.disabled=true;try{const modules=[...document.querySelectorAll('input[name="module"]:checked')].map(el=>el.value);const result=await request('/api/company-assessments',{method:'POST',body:JSON.stringify({title:$('assessmentTitle').value.trim(),modules,assignments:Object.fromEntries(modules.map(id=>[id,$('createAssignments').querySelector('[name="assignee-'+id+'"]')?.value||null])),shared_payload:{}})});const id=result.assessment?.id;if(!id)throw new Error('A avaliação foi criada, mas não recebemos o identificador para abri-la. Atualize a lista.');$('startCreatedAssessment').href='/index.html?company-assessment='+encodeURIComponent(id);$('createArea').hidden=true;$('nextStepCard').hidden=false;$('assessmentTitle').value='';await load();$('nextStepCard').hidden=false;$('nextStepCard').scrollIntoView({behavior:'smooth',block:'center'});message('Avaliação criada. O próximo passo é começar a responder ou distribuir os módulos.');}catch(error){message(error.message,true);}finally{button.disabled=false;}});
$('backToAssessments').addEventListener('click',()=>{$('nextStepCard').hidden=true;$('assessmentCard').scrollIntoView({behavior:'smooth',block:'start'});});
$('assessmentList').addEventListener('submit',async event=>{
 const titleForm=event.target.closest('form[data-edit-title]');
 const modulesForm=event.target.closest('form[data-add-modules]');
 if(!titleForm&&!modulesForm)return;
 event.preventDefault();
 const form=titleForm||modulesForm, assessmentId=form.dataset.assessment;
 const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{
  if(titleForm){
   await request('/api/company-assessment-module',{method:'POST',body:JSON.stringify({action:'update_title',assessment_id:assessmentId,title:form.elements.title.value,expected_updated_at:state.assessments.find(a=>a.id===assessmentId)?.updated_at})});
   message('Nome da avaliação atualizado.');
  }else{
   const modules=[...form.querySelectorAll('input[name="module"]:checked')].map(x=>x.value);
   if(!modules.length)throw new Error('Marque ao menos um módulo na lista.');
   await request('/api/company-assessment-module',{method:'POST',body:JSON.stringify({action:'add_modules',assessment_id:assessmentId,modules})});
   message('Módulos adicionados à avaliação.');
  }
  await load();
 }catch(error){message(error.message,true);await load();}
 finally{buttons.forEach(b=>b.disabled=false);}
});
$('assessmentList').addEventListener('click',async event=>{
 const selectionButton=event.target.closest('button[data-module-selection]');
 if(selectionButton){const form=selectionButton.closest('form[data-add-modules]');if(!form)return;const checked=selectionButton.dataset.moduleSelection==='all';form.querySelectorAll('input[name="module"]').forEach(input=>{input.checked=checked;});return;}
 const button=event.target.closest('button[data-remove-module]');if(!button)return;
 const label=MODULES.find(x=>x[0]===button.dataset.module)?.[1]||button.dataset.module;
 if(!window.confirm('Remover "'+label+'" desta avaliação? A remoção só é permitida quando ainda não há respostas nem atividade.'))return;
 button.disabled=true;
 try{
  await request('/api/company-assessment-module',{method:'POST',body:JSON.stringify({action:'remove_module',assessment_id:button.dataset.assessment,module_id:button.dataset.module,expected_updated_at:button.dataset.version})});
  message('Módulo removido.');await load();
 }catch(error){message(error.message,true);await load();}
});
$('assessmentList').addEventListener('change',async event=>{const select=event.target.closest('select[data-assessment][data-module]');if(!select)return;const a=state.assessments.find(x=>x.id===select.dataset.assessment);const m=a?.modules?.find(x=>x.module_id===select.dataset.module);if(m&&m.status!=='pending'&&!window.confirm('Este módulo já possui atividade. A troca preserva as respostas, mas o novo responsável poderá visualizar o histórico existente. Deseja continuar?')){select.value=m.assigned_user_id||'';return;}select.disabled=true;try{await request('/api/company-assessment-module',{method:'POST',body:JSON.stringify({action:'assign',assessment_id:select.dataset.assessment,module_id:select.dataset.module,assigned_user_id:select.value||null})});message('Responsável atualizado.');await load();}catch(error){message(error.message,true);await load();}finally{select.disabled=false;}});
async function start(){moduleChoices();try{bootProgress(20,'Verificando seu acesso…');const session=await window.M360Auth.getSession();if(!session?.user){message('Entre na sua conta para acessar as avaliações.',true);finishAreaBoot();return;}bootProgress(55,'Carregando suas avaliações…');await load();bootProgress(90,'Organizando os módulos e participantes…');}catch(error){message(error.message,true);}finally{finishAreaBoot();}}
window.addEventListener('load',start,{once:true});
})();