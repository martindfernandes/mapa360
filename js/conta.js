import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0?bundle';

const $ = (id) => document.getElementById(id);
const notice = $('accountNotice');
const forms = ['loginForm', 'signupForm', 'invitePasswordForm', 'forgotForm', 'recoveryForm'];
let invitationPasswordCompleted = false;
let supabase = null;
let busy = false;
let invitationHandled = false;
let currentCompanyRole = '';
let currentCompanyId = '';
let companyStateInFlight = null;
let companyStateInFlightUser = '';

function bootProgress(percent, label) {
  const loader = $('appBootLoader');
  if (!loader) return;
  $('appBootBar').style.width = Math.max(0, Math.min(100, percent)) + '%';
  $('appBootPercent').textContent = Math.round(percent) + '%';
  $('appBootLabel').textContent = label;
}
function finishBoot() {
  const loader = $('appBootLoader');
  if (!loader) return;
  bootProgress(100, 'Acesso preparado');
  loader.classList.add('is-hidden');
  window.setTimeout(() => { loader.hidden = true; }, 250);
}

function message(text, type = 'ok') {
  notice.textContent = text;
  notice.className = 'account-notice visible' + (type === 'error' ? ' error' : '');
}
function clearMessage() {
  notice.textContent = '';
  notice.className = 'account-notice';
}
function showForm(id) {
  document.body.classList.remove('account-workspace');
  $('tabLogin').hidden = false;
  $('tabSignup').hidden = false;
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
function showInvitePassword() {
  forms.forEach((formId) => { $(formId).hidden = formId !== 'invitePasswordForm'; });
  $('accountForms').hidden = false;
  $('accountSignedIn').hidden = true;
  $('accountLoading').hidden = true;
  $('tabLogin').hidden = true;
  $('tabSignup').hidden = true;
}
function showRecoveryForm(user) {
  showForm('recoveryForm');
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Sua conta';
  $('recoveryAccountName').textContent = name;
}
function showInviteWaiting() {
  $('accountLoading').hidden = true;
  $('accountSignedIn').hidden = true;
  $('accountForms').hidden = false;
  $('tabLogin').hidden = false;
  $('tabSignup').hidden = true;
  forms.forEach((formId) => { $(formId).hidden = formId !== 'loginForm'; });
  message('Para continuar, abra o link de convite recebido do administrador. Não crie uma conta separada.');
}
function showSignedIn(user) {
  $('accountLoading').hidden = true;
  $('accountForms').hidden = true;
  $('accountSignedIn').hidden = false;
  document.body.classList.add('account-workspace');
  $('signedInEmail').textContent = user.email || 'E-mail não disponível';
  $('companySetup').hidden = true;
  $('companyLinkedPanel').hidden = true;
  $('companyCreateName').value = user.user_metadata?.company_name || '';
}

function loadCompanyState(session) {
  const userId = session?.user?.id || '';
  if (companyStateInFlight && companyStateInFlightUser === userId) return companyStateInFlight;
  companyStateInFlightUser = userId;
  companyStateInFlight = loadCompanyStateInternal(session).finally(() => {
    if (companyStateInFlightUser === userId) { companyStateInFlight = null; companyStateInFlightUser = ''; }
  });
  return companyStateInFlight;
}

async function loadCompanyStateInternal(session) {
  if (!session?.access_token) return;
  $('companySetup').hidden = true;
  $('companyLinkedPanel').hidden = true;
  try {
    const response = await fetch('/api/my-company', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store'
    });
    let result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a empresa.');
    const metadata = session.user?.user_metadata || {};
    const inviteFlow = new URLSearchParams(location.search).has('convite');
    const shouldCreateCompany = !result.linked && !inviteFlow && String(metadata.company_name || '').trim().length >= 2 &&
      (metadata.company_setup_pending === true || metadata.company_setup_pending === undefined);
    if (shouldCreateCompany) {
      const createResponse = await fetch('/api/create-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ name: metadata.company_name })
      });
      const created = await createResponse.json().catch(() => ({}));
      if (createResponse.ok && created.company) {
        result = { ...result, linked: true, role: created.role || 'admin', company: created.company };
        void supabase.auth.updateUser({ data: { company_setup_pending: false } }).catch(() => {});
        message('Empresa criada automaticamente com o nome informado no cadastro.');
      } else if (createResponse.status === 409) {
        const refreshed = await fetch('/api/my-company', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
        const latest = await refreshed.json().catch(() => ({}));
        if (refreshed.ok) result = latest;
        if (!result.linked) throw new Error(created.error || 'Não foi possível concluir o cadastro automático da empresa.');
      } else {
        throw new Error(created.error || 'Não foi possível criar automaticamente a empresa. Você pode tentar novamente em Minha empresa.');
      }
    }
    if (result.linked && result.company) {
      $('signedInCompany').textContent = result.company.name;
      $('signedInRole').textContent = result.role === 'admin' ? 'Você é administrador desta empresa.' : 'Você faz parte desta empresa.';
      $('companyLinkedPanel').hidden = false;
      $('companyNameEditForm').hidden = result.role !== 'admin';
      $('companyNameEdit').value = result.company.name || '';
      currentCompanyRole = result.role || '';
      currentCompanyId = result.company.id || '';
      $('companyInvitePanel').hidden = result.role !== 'admin';
      $('companyMembersPanel').hidden = result.role !== 'admin';
      if (result.role === 'admin') void loadCompanyMembers();
      const accountParams = new URLSearchParams(location.search);
      if (result.role === 'admin' && accountParams.get('focus') === 'invite') {
        window.setTimeout(() => {
          const panel = $('companyInvitePanel');
          if (panel && !panel.hidden) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            $('companyInviteEmail')?.focus({ preventScroll: true });
          }
        }, 120);
      }
    } else {
      currentCompanyRole = '';
      currentCompanyId = '';
      $('companyInvitePanel').hidden = true;
      $('companyMembersPanel').hidden = true;
      $('companySetup').hidden = false;
    }
    if (location.hash === '#empresa' || location.hash === '#seguranca') {
      window.setTimeout(() => $(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
    }
  } catch (error) {
    if (!currentCompanyId && session.user?.email_confirmed_at) {
      $('companySetup').hidden = false;
      $('companyCreateName').value = session.user?.user_metadata?.company_name || '';
    }
    message(error.message || 'Não foi possível carregar os dados da empresa.', 'error');
  }
}
async function loadCompanyMembers() {
  const target = $('companyMembersList');
  const noticeEl = $('companyMembersNotice');
  if (!target || currentCompanyRole !== 'admin') return;
  noticeEl.textContent = 'Carregando participantes…';
  target.innerHTML = '<p class="company-members-empty">Carregando participantes…</p>';
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/company-members', {
      headers: { Authorization: 'Bearer ' + sessionData.session.access_token },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os participantes.');
    if (result.company?.id !== currentCompanyId) throw new Error('A empresa da sessão mudou. Atualize a página.');
    const members = result.members || [];
    const nextActions = $('companyNextActions');
    if (nextActions) nextActions.hidden = members.filter(member => member.status === 'active').length > 1;
    target.innerHTML = members.map(member => {
      const blocked = member.status === 'blocked' || member.banned;
      const role = member.role === 'admin' ? 'Administrador' : 'Membro';
      const state = blocked ? 'Bloqueado' : 'Ativo';
      const self = member.user_id === sessionData.session.user.id;
      const actions = self ? '<span class="company-member-self">Conta atual</span>' : [
        '<button type="button" data-company-action="edit_name">Editar nome</button>',
        member.role === 'admin'
          ? '<button type="button" data-company-action="demote">Tornar membro</button>'
          : '<button type="button" data-company-action="promote">Promover a administrador</button>',
        blocked
          ? '<button type="button" data-company-action="unblock">Desbloquear</button>'
          : '<button type="button" data-company-action="block">Bloquear</button>',
        '<button type="button" data-company-action="reset_password">Redefinir senha</button>',
        '<button type="button" class="danger" data-company-action="remove">Excluir da empresa</button>'
      ].join('');
      const name = member.name || 'Participante';
      return '<article class="company-member" data-user-id="' + escapeHtml(member.user_id) + '" data-current-name="' + escapeHtml(name) + '">' +
        '<div class="company-member-heading"><div class="company-member-identity"><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(member.email || 'E-mail não informado') + '</small></div>' +
        '<span class="company-member-status ' + (blocked ? 'blocked' : '') + '">' + state + '</span></div>' +
        '<div class="company-member-meta"><span><small>Perfil</small><b>' + role + '</b></span></div>' +
        '<div class="company-member-actions">' + actions + '</div></article>';
    }).join('') || '<p class="company-members-empty">Ainda não há participantes vinculados.</p>';
    noticeEl.textContent = members.length + ' participante(s) nesta empresa.';
  } catch (error) {
    target.innerHTML = '<p class="company-members-empty">Não foi possível carregar a lista.</p>';
    noticeEl.textContent = error.message || 'Não foi possível carregar os participantes.';
  }
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
async function manageCompanyMember(userId, action, row) {
  const labels = {
    promote: 'promover este participante a administrador',
    demote: 'rebaixar este administrador para membro',
    block: 'bloquear o acesso deste participante',
    unblock: 'desbloquear este participante',
    remove: 'remover este participante da empresa (a conta e as avaliações serão preservadas)',
    edit_name: 'editar o nome deste participante',
    reset_password: 'gerar um link para redefinição da senha deste participante'
  };
  let name = '';
  if (action === 'edit_name') {
    name = window.prompt('Nome do participante:', row?.dataset.currentName || '');
    if (name === null) return;
    name = name.trim();
    if (name.length < 2 || name.length > 120) return message('Informe um nome entre 2 e 120 caracteres.', 'error');
  } else if (!window.confirm('Confirma ' + labels[action] + '?')) return;

  const noticeEl = $('companyMembersNotice');
  noticeEl.textContent = action === 'reset_password' ? 'Gerando link seguro…' : 'Aplicando alteração…';
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/company-manage-member?v=recovery-token-hash-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionData.session.access_token },
      body: JSON.stringify({ user_id: userId, action, ...(action === 'edit_name' ? { name } : {}) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    if (action === 'reset_password') {
      let resetUrl;
      try { resetUrl = new URL(result.reset_url || ''); } catch { resetUrl = null; }
      const validResetUrl = result.flow_version === 'recovery-token-hash-v2'
        && resetUrl
        && resetUrl.origin === window.location.origin
        && resetUrl.pathname === '/conta.html'
        && resetUrl.searchParams.get('mode') === 'recovery'
        && Boolean(resetUrl.searchParams.get('auth_token'));
      if (!validResetUrl) {
        $('memberResetUrl').value = '';
        $('memberResetResult').hidden = true;
        throw new Error('A versão publicada da API ainda não está atualizada. Atualize o Preview e gere um novo link.');
      }
      $('memberResetUrl').value = resetUrl.toString();
      $('memberResetResult').hidden = false;
      noticeEl.textContent = 'Link de redefinição gerado. Copie e envie diretamente ao participante.';
      $('memberResetResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    noticeEl.textContent = 'Alteração concluída.';
    await loadCompanyMembers();
  } catch (error) {
    noticeEl.textContent = error.message || 'Não foi possível concluir a operação.';
  }
}

async function acceptPendingInvitation(session) {
  if (!invitationPasswordCompleted && new URLSearchParams(location.search).has('convite')) return;
  const token = new URLSearchParams(location.search).get('convite');
  if (!token) return true;
  if (invitationHandled || !session?.access_token) return false;
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
    return true;
  } catch (error) {
    invitationHandled = false;
    message(error.message || 'Não foi possível aceitar o convite.', 'error');
    return false;
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
function validPassword(value) { return typeof value === 'string' && value.length >= 8 && value.length <= 128; }
function friendlyError(error) {
  const text = String(error?.message || '');
  const code = String(error?.code || '');
  if (/invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(text)) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
  if (/user already registered/i.test(text)) return 'Não foi possível concluir o cadastro. Confira o e-mail informado ou tente entrar.';
  if (/password should be at least|password.*at least.*characters/i.test(text)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/same password|new password should be different|different from the old password/i.test(text)) return 'Escolha uma senha diferente da senha atual.';
  if (/weak password|password.*(too weak|compromised)/i.test(text)) return 'Escolha uma senha mais forte, com pelo menos 8 caracteres e sem sequências óbvias.';
  if (/session.*missing|missing.*session|not authenticated/i.test(text) || /session_not_found/i.test(code)) return 'A sessão de recuperação não está mais válida. Solicite um novo link de recuperação e abra-o no mesmo navegador.';
  if (/expired|invalid.*(token|otp)|otp.*expired/i.test(text) || /otp_expired|token_expired/i.test(code)) return 'O link de recuperação expirou ou já foi utilizado. Solicite um novo e-mail de recuperação.';
  if (/rate limit|too many requests/i.test(text)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (/network|fetch failed|failed to fetch/i.test(text)) return 'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.';
  if (text) return 'O serviço de autenticação informou: ' + text;
  return 'Não foi possível concluir a solicitação. Solicite um novo link de recuperação e tente novamente.';
}
async function init() {
  try {
    bootProgress(15, 'Verificando o acesso…');
    const invitationToken = new URLSearchParams(location.search).get('convite');
    if (invitationToken) {
      $('signupCompanyField').hidden = true;
      $('signupCompany').required = false;
      $('signupCompany').value = '';
    }
    bootProgress(35, 'Conectando ao serviço seguro…');
    const response = await fetch('/api/auth-config', { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.url || !config.publishableKey) {
      throw new Error(config.error || 'Configuração de autenticação indisponível.');
    }
    bootProgress(55, 'Preparando sua sessão…');
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
        showRecoveryForm(session?.user);
        message('Defina uma nova senha para concluir a recuperação.');
        return;
      }
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (session?.user) {
        const hasInvitation = new URLSearchParams(location.search).has('convite');
        if (hasInvitation && !invitationPasswordCompleted) {
          if (event === 'USER_UPDATED' && busy) return;
          showInvitePassword();
          return;
        }
        showSignedIn(session.user);
        void acceptPendingInvitation(session).then(() => loadCompanyState(session));
        if (event === 'SIGNED_IN') message('Acesso realizado com sucesso.');
      } else if (new URLSearchParams(location.search).has('convite')) {
        showInviteWaiting();
      } else if (!new URLSearchParams(location.search).has('mode') || location.search.includes('mode=recovery')) {
        showForm('loginForm');
      }
    });

    const params = new URLSearchParams(location.search);
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) throw error;
    let session = sessionData.session;

    bootProgress(75, params.has('convite') ? 'Validando convite da empresa…' : 'Carregando seus dados…');
    if (params.get('mode') === 'recovery' && params.get('auth_token')) {
      const { data: recoveryData, error: recoveryError } = await supabase.auth.verifyOtp({
        token_hash: params.get('auth_token'),
        type: 'recovery'
      });
      if (recoveryError || !recoveryData?.session?.user) {
        throw new Error('O link de recuperação expirou ou já foi utilizado. Solicite um novo link ao administrador.');
      }
      session = recoveryData.session;
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('auth_token');
      history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
    if (params.has('convite')) {
      const invitedEmail = cleanEmail(params.get('invite_email'));
      let inviteSession = session;
      if (!inviteSession && params.get('auth_token')) {
        const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: params.get('auth_token'),
          type: 'invite'
        });
        if (verifyError) throw new Error('Não foi possível validar este convite. Solicite um novo link ao administrador.');
        inviteSession = verified.session;
        params.delete('auth_token');
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete('auth_token');
        history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }
      if (inviteSession?.user) {
        if (invitedEmail && cleanEmail(inviteSession.user.email) !== invitedEmail) {
          await supabase.auth.signOut();
          showInviteWaiting();
          message('Este convite foi enviado para outro e-mail. Abra o link usando a conta correspondente.', 'error');
        } else {
          showInvitePassword();
          message('Convite validado. Crie sua senha para concluir a entrada na empresa.');
        }
      } else {
        showInviteWaiting();
        message('Este link não contém uma validação de convite ativa. Solicite um novo link ao administrador.', 'error');
      }
    } else if (params.get('mode') === 'recovery') {
      if (!session?.user) throw new Error('A sessão de recuperação não foi validada. Solicite um novo link.');
      showRecoveryForm(session.user);
      message('Conta identificada. Defina sua nova senha.');
    } else if (session?.user) {
      showSignedIn(session.user);
      await loadCompanyState(session);
      if (currentCompanyRole === 'admin' && params.get('entrada') === 'admin' && !params.has('convite') && !params.has('mode')) {
        window.location.replace('/?guia=admin&etapa=0');
        return;
      }
    } else if (params.get('mode') === 'recovery') showForm('recoveryForm');
    else if (params.get('cadastro') === '1') showForm('signupForm');
    else showForm('loginForm');
    bootProgress(94, 'Concluindo a preparação da sua conta…');
    finishBoot();
  } catch (error) {
    $('accountLoading').hidden = true;
    message(error.message || 'Não foi possível preparar o acesso.', 'error');
    finishBoot();
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
      if (currentCompanyRole === 'admin' && !new URLSearchParams(location.search).has('convite') && new URLSearchParams(location.search).get('entrada') === 'admin') {
        window.location.assign('/?guia=admin&etapa=0');
        return;
      }
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
  const signupParams = new URLSearchParams(location.search);
  const hasInvitation = signupParams.has('convite');
  const isAdminEntry = signupParams.get('entrada') === 'admin';
  if (name.length < 2 || (!hasInvitation && company.length < 2)) return message(hasInvitation ? 'Informe seu nome completo.' : 'Informe seu nome e o nome da empresa.', 'error');
  if (!validPassword(password)) return message('A senha precisa ter entre 8 e 128 caracteres.', 'error');
  if (password !== confirmation) return message('As senhas não coincidem.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: location.origin + '/conta.html' + (hasInvitation ? '?convite=' + encodeURIComponent(signupParams.get('convite')) : (isAdminEntry ? '?entrada=admin' : '')),
        data: { full_name: name, company_name: company, company_setup_pending: !hasInvitation }
      }
    });
    if (error) throw error;
    if (data.session?.user) {
      showSignedIn(data.session.user);
      await loadCompanyState(data.session);
      if (currentCompanyRole === 'admin' && isAdminEntry) {
        window.location.assign('/?guia=admin&etapa=0');
        return;
      }
      message('Conta criada e acesso realizado.');
    } else {
      showForm('loginForm');
      message('Cadastro recebido. Enviamos um link de confirmação para o e-mail informado. Confirme o endereço antes de entrar.');
    }
    form.reset();
  } catch (error) { message(friendlyError(error), 'error'); }
  finally { busy = false; setBusy(form, false); }
});

$('invitePasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase) return;
  const form = event.currentTarget;
  const name = $('inviteName').value.trim();
  const password = $('invitePassword').value;
  const confirmation = $('invitePasswordConfirm').value;
  if (name.length < 2) return message('Informe seu nome completo.', 'error');
  if (!validPassword(password)) return message('A senha precisa ter entre 8 e 128 caracteres.', 'error');
  if (password !== confirmation) return message('As senhas não coincidem.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('O link de convite não gerou uma sessão válida. Abra novamente o link recebido.');
    const { error } = await supabase.auth.updateUser({
      password,
      data: { full_name: name }
    });
    if (error) throw error;
    invitationPasswordCompleted = true;
    const { data: refreshed, error: refreshError } = await supabase.auth.getSession();
    if (refreshError || !refreshed.session?.access_token) throw new Error('Senha definida, mas a sessão expirou. Entre novamente e abra o link de convite.');
    const accepted = await acceptPendingInvitation(refreshed.session);
    if (!accepted) {
      showInvitePassword();
      message('Sua senha foi definida, mas o vínculo não foi concluído. Confira a mensagem acima e tente novamente.', 'error');
      return;
    }
    form.reset();
    bootProgress(90, 'Convite aceito. Abrindo o aplicativo…');
    window.location.replace('/index.html?guia=member&etapa=0');
  } catch (error) {
    message(friendlyError(error), 'error');
  } finally {
    busy = false; setBusy(form, false);
  }
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
  if (!validPassword(password)) return message('A senha precisa ter entre 8 e 128 caracteres.', 'error');
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
    // Atualiza o guia na própria tela, sem recarregar a página nem perder o contexto.
    window.dispatchEvent(new CustomEvent('m360:company-created'));
  } catch (error) {
    message(error.message || 'Não foi possível cadastrar a empresa.', 'error');
  } finally {
    busy = false; setBusy(form, false);
  }
});



$('companyNameEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !supabase || currentCompanyRole !== 'admin') return;
  const form = event.currentTarget;
  const name = $('companyNameEdit').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 180) return message('Informe um nome entre 2 e 180 caracteres.', 'error');
  busy = true; setBusy(form, true); clearMessage();
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/my-company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionData.session.access_token },
      body: JSON.stringify({ name })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.company) throw new Error(result.error || 'Não foi possível atualizar o nome da empresa.');
    $('signedInCompany').textContent = result.company.name;
    $('companyNameEdit').value = result.company.name;
    $('accountMenuCompany').textContent = result.company.name;
    message('Nome oficial da empresa atualizado.');
    window.dispatchEvent(new CustomEvent('m360:company-renamed', { detail: { company: result.company } }));
  } catch (error) {
    message(error.message || 'Não foi possível atualizar o nome da empresa.', 'error');
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

$('refreshCompanyMembers').addEventListener('click', () => loadCompanyMembers());
$('copyMemberReset').addEventListener('click', async () => { const value = $('memberResetUrl').value; if (!value) return; try { await navigator.clipboard.writeText(value); message('Link copiado. Envie ao participante para que ele defina uma nova senha.'); } catch { $('memberResetUrl').focus(); $('memberResetUrl').select(); message('Selecione e copie o link exibido.'); } });
$('companyMembersList').addEventListener('click', event => {
  const button = event.target.closest('[data-company-action]');
  if (!button) return;
  const card = button.closest('[data-user-id]');
  if (!card) return;
  manageCompanyMember(card.dataset.userId, button.dataset.companyAction, card);
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
