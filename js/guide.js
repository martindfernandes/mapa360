(() => {
'use strict';
const params=new URLSearchParams(location.search);
const requestedRole=params.get('guia');
const requestedStep=Number(params.get('etapa'));
const normalizedPath=location.pathname.replace(/\/+$/,'')||'/' ;
const page=(normalizedPath==='/conta'||normalizedPath==='/conta.html')?'account':(normalizedPath==='/company-assessments'||normalizedPath==='/company-assessments.html')?'assessments':'home';
const adminSteps=[
{page:'home',title:'Bem-vindo ao Mapa 360',text:'Este é o ponto de partida. Aqui você encontra a apresentação do sistema e acessa as áreas de trabalho.',target:'#homeScreen',note:'Observe a página inicial. O guia vai apresentar as áreas antes de você começar a utilizá-las.'},
{page:'account',title:'Sua conta e sua empresa',text:'Nesta área ficam os dados da conta e o vínculo com a empresa. O primeiro usuário que cadastra a empresa passa a ser administrador.',target:'#companySetup',alternate:'#companyLinkedPanel',note:'Se a empresa ainda não estiver cadastrada, faça isso depois de concluir a apresentação. Se já estiver, confira o vínculo.'},
{page:'account',title:'Gestão de participantes',text:'Aqui o administrador acompanha quem tem acesso à empresa, os perfis e a situação de cada participante.',target:'#companyMembersPanel',note:'Você poderá editar participantes e administrar os acessos nesta área.'},
{page:'account',title:'Convites para a equipe',text:'Gere um convite para cada pessoa que participará da avaliação. O convidado cria a própria senha e aceita o vínculo com a empresa.',target:'#companyInvitePanel',note:'O convite pode ser enviado por e-mail ou WhatsApp. Você também pode convidar pessoas mais tarde.'},
{page:'assessments',title:'Área de avaliações',text:'Este é o espaço para criar, acompanhar e retomar as avaliações da empresa. A lista apresenta o andamento dos módulos.',target:'#assessmentCard',note:'Vamos conhecer a criação de uma avaliação, sem criar nada durante esta apresentação.'},
{page:'assessments',title:'Criar uma avaliação',text:'Use este botão para iniciar um novo diagnóstico. Você define o nome e seleciona os módulos que serão avaliados.',target:'#newAssessmentButton',note:'O formulário será mostrado apenas para você conhecer. Não vamos salvar uma avaliação agora.'},
{page:'assessments',title:'Acompanhar e distribuir módulos',text:'Depois de criada, a avaliação aparece nesta lista. O administrador pode atribuir cada módulo a um participante e acompanhar o progresso.',target:'#assessmentList',note:'A distribuição pode ser feita depois. O administrador também pode responder aos módulos sob sua responsabilidade.'},
{page:'home',title:'Apresentação concluída',text:'Você conheceu o caminho principal: conta e empresa, participantes, avaliações e distribuição. Agora pode voltar ao início e escolher por onde começar.',target:'#homeScreen',note:'A apresentação não executa cadastros nem altera respostas. As ações começam quando você escolher uma opção no aplicativo.'}
];
const memberSteps=[
{page:'assessments',title:'Bem-vindo à área de avaliações',text:'Aqui você encontra as avaliações da sua empresa e os módulos que o administrador atribuiu à sua conta.',target:'#participantHint',note:'Você só verá as atividades atribuídas a você.'},
{page:'assessments',title:'Suas atividades',text:'A lista mostra o andamento. Use Continuar avaliação para abrir uma atividade e responder às perguntas disponíveis.',target:'#assessmentList',note:'Se ainda não houver atividade, peça ao administrador para atribuir um módulo.'},
{page:'home',title:'Questionário e salvamento',text:'Ao abrir uma avaliação, use as etapas do questionário para navegar. Suas respostas são sincronizadas com o ambiente da empresa.',target:'#stepNav',note:'Preencha apenas os módulos atribuídos e salve seu trabalho durante o preenchimento.'},
{page:'assessments',title:'Pronto para começar',text:'A apresentação terminou. Volte à lista de avaliações e abra sua atividade quando estiver pronto.',target:'#assessmentList',note:'Você pode rever este guia quando quiser.'}
];
let role=requestedRole==='member'?'member':'admin';
let steps=role==='member'?memberSteps:adminSteps;
function visibleTarget(step){
const el=document.querySelector(step.target);
if(el&&!el.hidden&&getComputedStyle(el).display!=='none')return el;
if(step.alternate){const alt=document.querySelector(step.alternate);if(alt&&!alt.hidden&&getComputedStyle(alt).display!=='none')return alt;}
return null;
}
function route(step,index){
const path={home:'/',account:'/conta',assessments:'/company-assessments'}[step.page];
const url=new URL(path,location.origin);url.searchParams.set('guia',role);url.searchParams.set('etapa',String(index));
const id=params.get('company-assessment');if(id)url.searchParams.set('company-assessment',id);
return url.pathname+url.search;
}
function finish(){
document.getElementById('m360Guide')?.remove();
document.querySelectorAll('.m360-guide-focus').forEach(el=>el.classList.remove('m360-guide-focus'));
const url=new URL(location.href);url.searchParams.delete('guia');url.searchParams.delete('etapa');history.replaceState({},'',url.pathname+url.search+url.hash);
}
function show(index){
if(index<0||index>=steps.length){finish();return;}
const step=steps[index],target=visibleTarget(step);
document.getElementById('m360Guide')?.remove();
document.querySelectorAll('.m360-guide-focus').forEach(el=>el.classList.remove('m360-guide-focus'));
if(target){target.classList.add('m360-guide-focus');target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});}
const card=document.createElement('section');card.id='m360Guide';card.className='m360-guide-card';card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');card.setAttribute('aria-label','Apresentação guiada do Mapa 360');
const progress=Math.round((index+1)/steps.length*100);
card.innerHTML='<div class="m360-guide-head"><span>APRESENTAÇÃO · GUIA '+(role==='admin'?'DO ADMINISTRADOR':'DO PARTICIPANTE')+'</span><button type="button" data-close aria-label="Fechar apresentação">×</button></div><div class="m360-guide-progress"><i style="width:'+progress+'%"></i></div><small>VISÃO '+(index+1)+' DE '+steps.length+'</small><h2></h2><p></p><div class="m360-guide-note"></div><div class="m360-guide-actions"><button type="button" data-back>Voltar</button><button type="button" class="m360-guide-next" data-next>'+(index===steps.length-1?'Voltar ao início ✓':'Próxima tela →')+'</button></div><button type="button" class="m360-guide-skip" data-skip>Encerrar apresentação</button>';
card.querySelector('h2').textContent=step.title;card.querySelector('p').textContent=step.text;card.querySelector('.m360-guide-note').textContent=step.note;card.querySelector('[data-back]').disabled=index===0;document.body.append(card);

function go(next){
if(next<0)return;
if(next>=steps.length){finish();return;}
const dest=steps[next];
if(dest.page!==page){location.assign(route(dest,next));return;}
const url=new URL(location.href);url.searchParams.set('guia',role);url.searchParams.set('etapa',String(next));history.pushState({},'',url.pathname+url.search);show(next);
}
card.querySelector('[data-close]').addEventListener('click',finish);
card.querySelector('[data-skip]').addEventListener('click',finish);
card.querySelector('[data-back]').addEventListener('click',()=>go(index-1));
card.querySelector('[data-next]').addEventListener('click',()=>go(index+1));
}
async function detectRole(){
try{const session=await window.M360Auth?.getSession?.();if(!session?.access_token)return null;const res=await fetch('/api/my-company',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});const data=await res.json().catch(()=>({}));return data.linked&&data.role==='member'?'member':'admin';}catch{return null;}
}
async function start(nextRole,index=0){
role=nextRole;steps=role==='member'?memberSteps:adminSteps;
const n=Math.max(0,Math.min(steps.length-1,index)),step=steps[n];
if(step.page!==page){location.assign(route(step,n));return;}
for(let i=0;i<50&&!visibleTarget(step);i++)await new Promise(resolve=>setTimeout(resolve,150));
show(n);
}
async function init(){
window.addEventListener('m360:company-created',()=>{if(role==='admin')start('admin',2);});
const replay=document.getElementById('replayOnboarding');
if(replay)replay.addEventListener('click',async()=>start((await detectRole())||'admin',0));
if(requestedRole==='admin'||requestedRole==='member'){await start(requestedRole,Number.isFinite(requestedStep)?requestedStep:0);return;}
if(page!=='home'){
const host=document.querySelector('.top-actions')||document.querySelector('.account-back')?.parentElement;
if(host&&!host.querySelector('[data-guide-replay]')){
const a=document.createElement('a');a.href='#';a.dataset.guideReplay='1';a.className='m360-guide-replay';a.textContent='Rever apresentação';
a.addEventListener('click',async e=>{e.preventDefault();const r=await detectRole();if(r)start(r,0);});host.prepend(a);
}}
// O guia só inicia por solicitação explícita (?guia=...) ou pelo link 'Conhecer o Mapa 360'.
// Não iniciar automaticamente em paralelo ao redirecionamento da sessão autenticada.
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();