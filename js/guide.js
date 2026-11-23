(() => {
'use strict';
const params=new URLSearchParams(location.search);
const requestedRole=params.get('guia');
const requestedStep=Number(params.get('etapa'));
const page=location.pathname.endsWith('/conta.html')?'account':location.pathname.endsWith('/company-assessments.html')?'assessments':'home';
const adminSteps=[
{page:'home',title:'Bem-vindo ao Mapa 360',text:'Este é seu ponto de partida. O Mapa 360 ajuda a organizar o diagnóstico, acompanhar a equipe e transformar respostas em melhorias.',target:'#homeScreen',next:'Vamos conhecer a gestão da empresa.'},
{page:'account',title:'Cadastre sua empresa',text:'No primeiro acesso, informe os dados da empresa. A primeira pessoa que faz esse cadastro passa a ser administradora e poderá gerenciar os acessos.',target:'#companySetup',next:'Depois de cadastrar, siga para convidar a equipe.'},
{page:'account',title:'Convide os participantes',text:'Informe o e-mail de cada pessoa e gere um link de convite. Envie o link por e-mail ou WhatsApp. A pessoa cria a própria senha e aceita o convite para entrar na empresa.',target:'#companyInvitePanel',next:'Agora veja como administrar os acessos.'},
{page:'account',title:'Gerencie sua equipe',text:'Aqui você acompanha os participantes, altera nomes e perfis, promove ou rebaixa administradores, bloqueia ou desbloqueia acessos, gera redefinição de senha e remove vínculos. Remover o vínculo não apaga a conta nem as avaliações.',target:'#companyMembersPanel',next:'Com a equipe pronta, vamos às avaliações.'},
{page:'assessments',title:'Crie uma avaliação',text:'Em Minhas avaliações, escolha Nova avaliação, dê um nome e selecione os temas. O Diagnóstico geral é obrigatório. Você pode começar respondendo ou organizar a equipe primeiro.',target:'#newAssessmentButton',next:'Depois de criar, distribua os módulos.'},
{page:'assessments',title:'Distribua os módulos por responsável',text:'Cada módulo pode ficar com um responsável diferente. Você também pode atribuir vários módulos à mesma pessoa. A lista mostra o andamento; quando o convite for aceito, o participante aparecerá para seleção. O administrador continua vendo e editando todos os módulos.',target:'#assessmentList',next:'Abra uma avaliação para conhecer o questionário.'},
{page:'home',title:'Conheça o questionário',text:'Dentro da avaliação, use as etapas para preencher o contexto, responder às perguntas e organizar objetivos, prioridades e oportunidades. As respostas são salvas no ambiente da empresa, não apenas neste navegador.',target:'#stepNav',next:'Por fim, veja como concluir e consultar o relatório.'},
{page:'home',title:'Referências e benchmarks',text:'Na área Referências e benchmarks você consulta a base de referências disponível no aplicativo. Use esses dados como apoio e confira sempre a origem e o contexto antes de comparar empresas.',target:'#tab-benchmarks',next:'Por fim, veja como concluir e consultar o relatório.'},
{page:'home',title:'Conclusão e relatório',text:'Quando todos os módulos estiverem concluídos, o administrador pode finalizar a avaliação. O sistema consolida as respostas e libera o relatório para consulta e impressão. Se algum módulo atribuído estiver pendente, ele será indicado antes da conclusão.',target:'#btnSubmit',next:'Você pode rever este guia quando quiser.'}
];
const memberSteps=[
{page:'home',title:'Bem-vindo ao Mapa 360',text:'Seu acesso é voltado às atividades que o administrador da empresa atribuiu a você. Vamos mostrar onde encontrá-las.',target:'#homeScreen',next:'Veja suas avaliações.'},
{page:'assessments',title:'Suas avaliações',text:'Aqui aparecem as avaliações vinculadas à sua empresa. Você verá somente os módulos que foram atribuídos à sua conta.',target:'#participantHint',next:'Abra uma avaliação para começar.'},
{page:'assessments',title:'Abra sua atividade',text:'A lista mostra o andamento da avaliação. Use Continuar avaliação para abrir o questionário e responder às atividades disponíveis para você.',target:'#assessmentList',next:'Agora conheça as etapas do questionário.'},
{page:'home',title:'Responda seus módulos',text:'Use a navegação por etapas para localizar as perguntas do módulo atribuído. O contexto geral é compartilhado e aparece apenas para consulta. Responda com informações reais e evidências quando disponíveis.',target:'#stepNav',next:'Lembre-se de salvar suas respostas.'},
{page:'home',title:'Salve seu trabalho',text:'Use Salvar rascunho durante o preenchimento. O administrador acompanha o andamento e, quando todos os módulos estiverem concluídos, realiza a conclusão geral e consulta o relatório.',target:'[data-action="save-assessment"]',next:'Pronto! Você já conhece seu espaço de trabalho.'}
];
function routeFor(step,role,extra=''){const path={home:'/index.html',account:'/conta.html',assessments:'/company-assessments.html'}[step.page];return path+'?guia='+role+'&etapa='+step.index+(extra?'&'+extra:'');}
function finish(){try{localStorage.setItem('m360_guide_v2_seen','1')}catch{}document.getElementById('m360Guide')?.remove();document.querySelectorAll('.m360-guide-focus').forEach(el=>el.classList.remove('m360-guide-focus'));const clean=new URL(location.href);clean.searchParams.delete('guia');clean.searchParams.delete('etapa');history.replaceState({},'',clean);}
function showGuide(role,index,steps){
const step=steps[index];if(!step)return;
document.getElementById('m360Guide')?.remove();document.querySelectorAll('.m360-guide-focus').forEach(el=>el.classList.remove('m360-guide-focus'));
const target=document.querySelector(step.target);if(target&&!target.hidden){target.classList.add('m360-guide-focus');target.scrollIntoView({behavior:'smooth',block:'center'});}
const card=document.createElement('section');card.id='m360Guide';card.className='m360-guide-card';card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');card.setAttribute('aria-label','Guia de uso do Mapa 360');
const progress=Math.round((index+1)/steps.length*100);
card.innerHTML='<div class="m360-guide-head"><span>GUIA '+(role==='admin'?'DO ADMINISTRADOR':'DO PARTICIPANTE')+'</span><button type="button" data-guide-close aria-label="Fechar guia">×</button></div><div class="m360-guide-progress"><i style="width:'+progress+'%"></i></div><small>ETAPA '+(index+1)+' DE '+steps.length+'</small><h2></h2><p></p><div class="m360-guide-note"></div><div class="m360-guide-actions"><button type="button" data-guide-back>Voltar</button><button type="button" class="m360-guide-next" data-guide-next>Próximo →</button></div><button type="button" class="m360-guide-skip" data-guide-skip>Encerrar guia</button>';
card.querySelector('h2').textContent=step.title;card.querySelector('p').textContent=step.text;card.querySelector('.m360-guide-note').textContent=step.next;card.querySelector('[data-guide-back]').disabled=index===0;card.querySelector('[data-guide-next]').textContent=index===steps.length-1?'Concluir guia ✓':'Próximo →';document.body.append(card);
function go(n,extra=''){if(n<0||n>=steps.length){finish();return;}location.assign(routeFor({...steps[n],index:n},role,extra));}
card.querySelector('[data-guide-close]').addEventListener('click',finish);card.querySelector('[data-guide-skip]').addEventListener('click',finish);card.querySelector('[data-guide-back]').addEventListener('click',()=>go(index-1));
card.querySelector('[data-guide-next]').addEventListener('click',()=>{
if(role==='admin'&&index===5){const link=document.querySelector('.assessment-item .open-assessment');if(!link){card.querySelector('.m360-guide-note').textContent='Crie uma avaliação primeiro. Quando ela aparecer na lista, avance novamente para abrir o questionário.';return;}const url=new URL(link.href,location.origin);url.searchParams.set('guia','admin');url.searchParams.set('etapa','6');location.assign(url.pathname+url.search);return;}
if(role==='member'&&index===2){const link=document.querySelector('.assessment-item .open-assessment');if(!link){card.querySelector('.m360-guide-note').textContent='Quando o administrador atribuir um módulo, a avaliação aparecerá aqui. Volte a este guia depois.';return;}const url=new URL(link.href,location.origin);url.searchParams.set('guia','member');url.searchParams.set('etapa','3');location.assign(url.pathname+url.search);return;}
go(index+1);
});
}
async function detectRole(){try{const session=await window.M360Auth?.getSession?.();if(!session?.access_token)return'admin';const response=await fetch('/api/my-company',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});const data=await response.json().catch(()=>({}));return data.linked&&data.role==='member'?'member':'admin';}catch{return'admin';}}
async function waitForTarget(selector){
  for(let attempt=0;attempt<40;attempt++){
    const el=document.querySelector(selector);
    if(el&&!el.hidden&&getComputedStyle(el).display!=='none')return el;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  return document.querySelector(selector);
}
async function init(){
const replay=document.getElementById('replayOnboarding');if(replay)replay.addEventListener('click',async()=>{const role=await detectRole();const steps=role==='member'?memberSteps:adminSteps;steps.forEach((s,i)=>s.index=i);location.assign(routeFor({...steps[0],index:0},role));});
if(requestedRole==='admin'||requestedRole==='member'){const steps=requestedRole==='member'?memberSteps:adminSteps;steps.forEach((s,i)=>s.index=i);const n=Number.isFinite(requestedStep)?Math.max(0,Math.min(steps.length-1,requestedStep)):0;if(steps[n].page===page){
  if(requestedRole==='admin'&&n===1){
    const setup=await waitForTarget('#companySetup');
    if(setup?.hidden){const url=new URL(location.href);url.searchParams.set('etapa','2');location.replace(url);return;}
  }
  await waitForTarget(steps[n].target);
  showGuide(requestedRole,n,steps);
}return;}
if(page!=='home'){
  const host=document.querySelector('.top-actions')||document.querySelector('.account-back')?.parentElement;
  if(host&&!host.querySelector('[data-guide-replay]')){
    const link=document.createElement('a');link.href='#';link.dataset.guideReplay='1';link.className='m360-guide-replay';link.textContent='Rever guia';
    link.addEventListener('click',async event=>{event.preventDefault();const role=await detectRole();const steps=role==='member'?memberSteps:adminSteps;steps.forEach((s,i)=>s.index=i);location.assign(routeFor({...steps[0],index:0},role));});
    host.prepend(link);
  }
}
if(page!=='home')return;try{if(localStorage.getItem('m360_guide_v2_seen'))return;}catch{}
const role=await detectRole();const steps=role==='member'?memberSteps:adminSteps;steps.forEach((s,i)=>s.index=i);await waitForTarget(steps[0].target);showGuide(role,0,steps);

}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();