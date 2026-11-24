import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0?bundle';
const $ = id => document.getElementById(id);
const STAGE_NAMES = {triagem:'Triagem inicial',diagnostico:'Diagnóstico consultivo',plano:'Plano de melhoria',acompanhamento:'Acompanhamento'};
const MODULE_NAMES = { geral:'Diagnóstico geral', segmento:'Perguntas do segmento', contexto_industrial:'Ramo e produtos', ppcp:'PPCP', automacao:'Automação de processos', dados_bi:'Dados e BI', administrativo:'Processos administrativos', projetos:'Gestão de projetos' };
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateLabel(value){if(!value)return 'Ainda não atualizado';const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'}).format(date);}
function statusLabel(value){return ({completed:'Concluída',in_progress:'Em andamento',pending:'Pendente',draft:'Não iniciada',archived:'Arquivada'}[value]||'Em andamento');}
function setMessage(text){$('dashboardMessage').textContent=text||'';}
function finish(){const loader=$('dashboardLoader');loader.classList.add('is-hidden');window.setTimeout(()=>loader.hidden=true,220);}
function metric(label,value,detail){return '<article class="metric-card"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';}
function moduleCard(module,assessmentId,role){
 const name=MODULE_NAMES[module.module_id]||module.module_id;
 const assigned=role==='admin'?(module.assigned_name||'Administrador'):'Você';
 const responder=module.answered_count>0?(module.responded_by||assigned):'Ainda não respondido';
 const status=module.status||'pending';
 return '<article class="module-row"><div class="module-row-top"><strong>'+esc(name)+'</strong><span class="module-status '+(status==='completed'?'completed':'')+'">'+esc(statusLabel(status))+'</span></div><small>Responsável: '+esc(assigned)+'</small><small>Respostas registradas: '+Number(module.answered_count||0)+'</small><small>Última resposta: '+esc(responder)+'</small><small>Atualizado: '+esc(dateLabel(module.updated_at))+'</small><a href="/index.html?company-assessment='+encodeURIComponent(assessmentId)+'">'+(status==='completed'?'Abrir avaliação':'Continuar atividade →')+'</a></article>';
}
function assessmentCard(a,role){
 const mods=a.modules||[],pct=Number(a.progress_pct||0);
 const status=a.status||'in_progress';
 const stage=STAGE_NAMES[a.stage]||STAGE_NAMES.triagem;
 const triage='<div class="triage-strip"><span><strong>Fase atual</strong> · '+esc(stage)+'</span>'+(role==='admin'?'<span>Triagem: '+(a.triage_completed?'Concluída':'Em andamento')+' · '+Number(a.triage_answered_count||0)+' / 18 respostas</span>':'')+'</div>';
 const moduleRows=mods.map(m=>moduleCard(m,a.id,role)).join('');
 return '<article class="assessment-card"><div class="assessment-card-head"><div><h3>'+esc(a.title)+'</h3><div class="assessment-meta">Criada em '+esc(dateLabel(a.created_at))+' · Atualizada em '+esc(dateLabel(a.updated_at))+'</div></div><span class="status-pill '+(status==='completed'?'completed':'')+'">'+esc(statusLabel(status))+'</span></div><div class="progress-label"><span>Módulos concluídos</span><strong>'+Number(a.completed_modules||0)+' / '+Number(a.total_modules||0)+' · '+pct+'%</strong></div><div class="progress-track" role="progressbar" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pct+'%"></i></div>'+triage+'<div class="module-list">'+moduleRows+'</div></article>';
}
function render(data){
 const admin=data.role==='admin',name=(data.user?.name||'').split(' ')[0]||'';
 $('welcomeTitle').textContent=(new Date().getHours()<12?'Bom dia':new Date().getHours()<18?'Boa tarde':'Boa noite')+(name?', '+name:'')+'!';
 $('welcomeSubtitle').textContent=admin?'Aqui está o panorama das avaliações e da participação da sua equipe.':'Aqui estão suas atividades, com o que já foi concluído e o que ainda precisa da sua atenção.';
 $('roleChip').textContent=admin?'Administrador':'Participante';
 $('companyName').textContent=data.company?.name||'Minha empresa';
 $('companyRole').textContent=admin?'Você administra este espaço empresarial.':'Você participa das avaliações desta empresa.';
 const assessments=data.assessments||[];
 const allModules=assessments.flatMap(a=>a.modules||[]);
 const done=allModules.filter(m=>m.status==='completed').length;
 const pending=allModules.filter(m=>m.status!=='completed').length;
 if(admin){
  const activeAssessments=assessments.filter(a=>!['completed','archived'].includes(a.status)).length;
  const members=(data.members||[]).filter(m=>m.status==='active'&&m.role!=='admin').length;
  $('metricGrid').innerHTML=metric('Avaliações em andamento',activeAssessments,'De '+assessments.length+' avaliação(ões)')+metric('Módulos concluídos',done, 'De '+allModules.length+' módulo(s) selecionado(s)')+metric('Participantes ativos',members,'Além da conta administradora')+metric('Módulos pendentes',pending,'Atividades ainda não concluídas');
  $('listTitle').textContent='Visão das avaliações';
  $('listDescription').textContent='Acompanhe o progresso, a triagem e quem está respondendo cada módulo.';
  $('assessmentsLink').textContent='Gerenciar avaliações →';
  $('teamSection').hidden=false;
  const team=(data.members||[]).filter(m=>m.status==='active'&&m.role!=='admin');
  $('teamSummary').innerHTML=team.length?team.map(m=>'<article class="team-person"><strong>'+esc(m.name)+'</strong><small>Participante · Acesso ativo</small></article>').join(''):'<div class="empty-state">Você ainda não adicionou participantes. Pode conduzir toda a avaliação sozinho ou convidar pessoas quando desejar.</div>';
 }else{
  $('metricGrid').innerHTML=metric('Minhas atividades',allModules.length,'Módulos atribuídos a você')+metric('Pendentes',pending,'Atividades que precisam de atenção')+metric('Concluídas',done,'Atividades finalizadas')+metric('Meu avanço',allModules.length?Math.round(done/allModules.length*100)+'%':'0%','Progresso dos módulos atribuídos');
  $('listTitle').textContent='Minhas pendências';
  $('listDescription').textContent='Abra uma atividade para continuar de onde parou.';
  $('assessmentsLink').textContent='Ver avaliações →';
  $('teamSection').hidden=true;
 }
 $('dashboardAssessments').innerHTML=assessments.length?assessments.map(a=>assessmentCard(a,data.role)).join(''):'<div class="empty-state">'+(admin?'Ainda não há avaliações criadas. Comece criando a primeira avaliação da empresa.':'Ainda não há módulos atribuídos à sua conta. Quando o administrador distribuir uma atividade, ela aparecerá aqui.')+'</div>';
 if(admin&&assessments.length===0)setMessage('Sua empresa já está pronta para começar. Crie a primeira avaliação quando desejar.');
}
async function start(){
 try{
  const configResponse=await fetch('/api/auth-config',{cache:'no-store'});const config=await configResponse.json();
  if(!configResponse.ok||!config.url||!config.publishableKey)throw new Error('Não foi possível iniciar a autenticação.');
  const client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const {data:sessionData,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
  const session=sessionData.session;if(!session?.access_token){location.replace('/conta.html');return;}
  const response=await fetch('/api/company-dashboard',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401||response.status===403){location.replace('/conta.html');return;}throw new Error(result.error||'Não foi possível carregar seu painel.');}
  render(result);
 }catch(error){setMessage(error.message||'Não foi possível carregar o painel.');$('dashboardAssessments').innerHTML='<div class="empty-state">Não foi possível carregar os dados agora. Atualize a página para tentar novamente.</div>';}
 finally{finish();}
}
start();
