const $=id=>document.getElementById(id);
const dialog=$('onboardingDialog');
const steps=[
 {title:'Bem-vindo ao Mapa 360!',text:'Vamos acompanhar você nos primeiros passos. O Mapa 360 organiza um diagnóstico da empresa e ajuda a transformar respostas em oportunidades de evolução.',tip:'Você não precisa conhecer todas as funções agora. Vamos mostrar o caminho.'},
 {title:'Sua empresa em um só lugar',text:'No menu da sua conta você encontra os dados pessoais, a empresa vinculada, os participantes e as opções de segurança.',tip:'O administrador da empresa gerencia os participantes e distribui os módulos da avaliação.'},
 {title:'Comece por Minhas avaliações',text:'É aqui que você cria uma avaliação, escolhe os módulos e acompanha o andamento. Depois de criar, pode responder imediatamente ou distribuir os módulos para a equipe.',tip:'Você pode voltar à lista sempre que precisar continuar uma avaliação.'},
 {title:'Convide e acompanhe sua equipe',text:'Se quiser dividir o trabalho, convide os responsáveis e atribua os módulos. Cada participante verá somente aquilo que foi atribuído a ele.',tip:'O administrador continua podendo acompanhar e editar todos os módulos.'}
];
let current=0;
function render(){const s=steps[current];$('onboardingTitle').textContent=s.title;$('onboardingText').textContent=s.text;$('onboardingTip').textContent=s.tip;$('onboardingCounter').textContent='GUIA RÁPIDO · '+(current+1)+' DE '+steps.length;$('onboardingProgress').style.width=((current+1)/steps.length*100)+'%';$('onboardingNext').textContent=current===steps.length-1?'Ir para minhas avaliações':'Próximo';}
function close(done=true){if(dialog.open)dialog.close();if(done)try{localStorage.setItem('m360_onboarding_seen_v1','1')}catch{}}
async function init(){try{if(!window.M360Auth)return;const session=await window.M360Auth.getSession();if(!session?.user)return;const replay=$('replayOnboarding');replay?.addEventListener('click',()=>{current=0;render();dialog.showModal()});if(!localStorage.getItem('m360_onboarding_seen_v1')){current=0;render();dialog.showModal()}}catch{}}
$('onboardingNext').addEventListener('click',()=>{if(current<steps.length-1){current++;render();return}close();window.location.assign('/company-assessments.html')});
$('onboardingSkip').addEventListener('click',()=>close());$('onboardingClose').addEventListener('click',()=>close());
dialog.addEventListener('cancel',()=>close());init();
