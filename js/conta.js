import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0?bundle';

const $ = (id) => document.getElementById(id);
const notice = $('accountNotice');
const forms = ['loginForm', 'signupForm', 'forgotForm', 'recoveryForm'];
let supabase = null;
let busy = false;\nlet invitationHandled = false;

function message(text, type = 'ok') {
  notice.textContent = text;
  notice.className = 'account-notice visible' + (type === 'error' ? ' error' : '');
}
function clearMessage() {
  notice.textContent = '';
  notice.className = 'account-notice';
}
function showForm(id) {
  forms.forEach((formId) => { $(formId).hidden = formId !== id; });
  $('accountForms').hidden = false;
  $('accountSignedIn').hidden = true;
  $('accountLoading').hidden = true;
  const signup = id === 'signupForm';
  $('tabLogin').classList.toggle('selected', id === 'loginForm' || id === 'forgotForm');
  $('tabSignup').classList.toggle('selected', signup);
  $('tabLogin').setAttribute('aria-selected', String(id === 'loginForm' || id === 'forgotForm'));
  $('tabSignup').setAttribute('aria-selected', String(signup));
}
function showSignedIn(user) {
  $('accountLoading').hidden = true;
  $('accountForms').hidden = true;
  $('accountSignedIn').hidden = false;
  $('signedInEmail').textContent = user.email || 'E-mail não disponível';
  $('companySetup').hidden = true;
  $('companyLinkedPanel').hidden = true;
  $('companyCreateName').value = user.user_metadata?.company_name || '';
}
async function loadCompanyState(session) {
  if (!session?.access_token) return;
  $('companySetup').hidden = true;
  $('companyLinkedPanel').hidden = true;
  try {
    const response = await fetch('/api/my-company', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a empresa.');
    if (result.linked && result.company) {
      $('signedInCompany').textContent = result.company.name;
      $('signedInRole').textContent = result.role === 'admin' ? 'Você é administrador desta empresa.' : 'Você faz parte desta empresa.';
      $('companyLinkedPanel').hidden = false;
    } else {
      $('companySetup').hidden = false;
    }
  } catch (error) {
    message(error.message || 'Não foi possível carregar os dados da empresa.', 'error');
  }
}
async function acceptPendingInvitation(session) {
  const token = new URLSearchParams(location.search).get('convite');
  if (!token || invitationHandled || !session?.access_token) return;
  invitationHandled = true;
  try {
    const response = await fetch('/api/accept-company-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ token })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível aceitar o convite.');
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete('convite');
    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    await loadCompanyState(session);
    message('Convite aceito! Sua conta agora está vinculada à empresa.');
  } catch (error) {
    invitationHandled = false;
    message(error.message || 'Não foi possível aceitar o convite.', 'error');
  }
}
function setBusy(form, value) {
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    if (value) button.dataset.originalText = button.textContent;
    button.disabled = value;
    button.textContent = value ? 'Aguarde…' : (button.dataset.originalText || button.textContent);
  }
}
function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function validPassword(value) { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
function friendlyError(error) {
  const text = String(error?.message || '');
  if (/invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(text)) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
  if (/user already registered/i.test(text)) return 'Não foi possível concluir o cadastro. Confira o e-mail informado ou tente entrar.';
  if (/password should be at least/i.test(text)) return 'A senha precisa ter pelo menos 12 caracteres.';
  if (/rate limit/i.test(text)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  return 'Não foi possível concluir a solicitação. Confira os dados e tente novamente.';
}
async function init() {
  try {
    const response = await fetch('/api/auth-config', { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.url || !config.publishableKey) {
      throw new Error(config.error || 'Configuração de autenticação indisponível.');
    }
    supabase = createClient(config.url, config.publishableKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        showForm('recoveryForm');
        message('Defina uma nova senha para concluir a recuperação.');
        return;
      }
      if (session?.user) {
        showSignedIn(session.user);
        void loadCompanyState(session);
        if (event === 'SIGNED_IN') message('Acesso realizado com sucesso.');
      } else if (!new URLSearchParams(location.search).has('mode') || location.search.includes('mode=recovery')) {
        showForm('loginForm');
      }
    });

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (session?.user) {
      showSignedIn(session.user);
      await loadCompanyState(session);
    } else if (new URLSearchParams(location.search).get('mode') === 'recovery') showForm('recoveryForm');
    else showForm('loginForm');
  } catch (error) {
    $('accountLoading').hidden = true;
    message(error.message || 'Não foi possível preparar o acesso.', 'error');
  }
}

$('tabLogin').addEventListener('click', () => { clearMessage(); showForm('loginForm'); });
$('tabSignup').addEventListener('click', () => { clearMessage(); showForm('signupForm'); });
$('showForgot').addEventListener('click', () => { clearMessage(); showForm('forgotForm'); });
$('backToLogin').addEventListener('click', () => { clearMessage(); showForm('loginForm'); });

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const email = cleanEmail($('loginEmail').value);
  const password = $('loginPassword').value;
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      showSignedIn(data.user);
      const { data: sessionData } = await supabase.auth.getSession();
      await loadCompanyState(sessionData.session);
    }
    message('Acesso realizado com sucesso.');
  } catch (error) { message(friendlyError(error), 'error'); }
  finally { busy = false; setBusy(form, false); }
});

$('signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const name = $('signupName').value.trim();
  const company = $('signupCompany').value.trim();
  const email = cleanEmail($('signupEmail').value);
  const password = $('signupPassword').value;
  const confirmation = $('signupPasswordConfirm').value;
  if (name.length < 2 || company.length < 2) return message('Informe seu nome e o nome da empresa.', 'error');
  if (!validPassword(password)) return message('A senha precisa ter entre 12 e 128 caracteres.', 'error');
  if (password !== confirmation) return message('As senhas não coincidem.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: location.origin + '/conta.html',
        data: { full_name: name, company_name: company }
      }
    });
    if (error) throw error;
    if (data.session?.user) {
      showSignedIn(data.session.user);
      await loadCompanyState(data.session);
      message('Conta criada e acesso realizado.');
    } else {
      showForm('loginForm');
      message('Cadastro recebido. Enviamos um link de confirmação para o e-mail informado. Confirme o endereço antes de entrar.');
    }
    form.reset();
  } catch (error) { message(friendlyError(error), 'error'); }
  finally { busy = false; setBusy(form, false); }
});

$('forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const email = cleanEmail($('forgotEmail').value);
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + '/conta.html?mode=recovery'
    });
    if (error) throw error;
    message('Se houver uma conta para esse e-mail, enviaremos as instruções de recuperação.');
  } catch (error) { message(friendlyError(error), 'error'); }
  finally { busy = false; setBusy(form, false); }
});

$('recoveryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const password = $('newPassword').value;
  const confirmation = $('newPasswordConfirm').value;
  if (!validPassword(password)) return message('A senha precisa ter entre 12 e 128 caracteres.', 'error');
  if (password !== confirmation) return message('As senhas não coincidem.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await supabase.auth.signOut();
    history.replaceState(null, '', '/conta.html');
    showForm('loginForm');
    message('Senha atualizada. Agora você já pode entrar com a nova senha.');
    form.reset();
  } catch (error) { message(friendlyError(error), 'error'); }
  finally { busy = false; setBusy(form, false); }
});


$('companyCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const name = $('companyCreateName').value.trim();
  if (name.length < 2 || name.length > 180) return message('Informe um nome de empresa entre 2 e 180 caracteres.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/create-company', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + sessionData.session.access_token
      },
      body: JSON.stringify({ name })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível cadastrar a empresa.');
    await loadCompanyState(sessionData.session);
    message('Empresa cadastrada. Sua conta agora é administradora da empresa.');
  } catch (error) {
    message(error.message || 'Não foi possível cadastrar a empresa.', 'error');
  } finally {
    busy = false; setBusy(form, false);
  }
});


$('companyInviteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const email = cleanEmail($('companyInviteEmail').value);
  busy = true; setBusy(form, true); clearMessage();
  $('companyInviteResult').hidden = true;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/invite-company-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + sessionData.session.access_token
      },
      body: JSON.stringify({ email })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível gerar o convite.');
    form.reset();
    $('companyInviteUrl').value = result.invite_url || '';
    $('companyInviteResult').hidden = !result.invite_url;
    message('Convite gerado para ' + email + '. Compartilhe o link; validade de 7 dias.');
  } catch (error) {
    message(error.message || 'Não foi possível gerar o convite.', 'error');
  } finally {
    busy = false; setBusy(form, false);
  }
});

$('copyCompanyInvite').addEventListener('click', async () => {
  const value = $('companyInviteUrl').value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    message('Link copiado. Agora você pode enviá-lo ao convidado.');
  } catch {
    $('companyInviteUrl').focus();
    $('companyInviteUrl').select();
    message('Selecione e copie o link exibido acima.');
  }
});

$('signOutButton').addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) message('Não foi possível encerrar a sessão. Tente novamente.', 'error');
  else { showForm('loginForm'); message('Você saiu da sua conta.'); }
});

init();
