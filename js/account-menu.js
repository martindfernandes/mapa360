import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0?bundle';

const $ = (id) => document.getElementById(id);
const root = $('accountMenu');
const trigger = $('accountMenuTrigger');
const panel = $('accountMenuPanel');
const signOut = $('accountMenuSignOut');
let supabase = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });
window.M360Auth = Object.freeze({
  async getSession() {
    await authReady;
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }
});

function setMenuOpen(open) {
  panel.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}
function initialsFromName(value) {
  const parts = String(value || '').trim().split(/\\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function showSession(session) {
  if (!session?.user) {
    root.hidden = true;
    const internalNav = $('workspaceNav'); if (internalNav) internalNav.hidden = true;
    setMenuOpen(false);
    return;
  }
  const user = session.user;
  const metadata = user.user_metadata || {};
  const name = metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Minha conta';
  $('accountMenuName').textContent = name;
  $('accountMenuEmail').textContent = user.email || '';
  $('accountMenuCompany').textContent = '';
  $('accountMenuAvatar').textContent = initialsFromName(name);
  root.hidden = false;
  const internalNav = $('workspaceNav');
  if (internalNav) internalNav.hidden = false;
  if (session.access_token) {
    fetch('/api/company-dashboard', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store'
    }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.company) {
        $('accountMenuCompany').textContent = result.company.name;
        const params = new URLSearchParams(window.location.search);
        const isPublicEntry = (window.location.pathname === '/' || window.location.pathname === '/index.html') &&
          !params.has('company-assessment') && !params.has('token') && !params.has('admin-report');
        if (isPublicEntry) window.location.replace('/inicio.html');
      } else if (response.status === 403) {
        const nav = $('workspaceNav'); if (nav) nav.hidden = true;
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') window.location.replace('/conta.html');
      }
    }).catch(() => {});
  }
}
async function init() {
  try {
    const response = await fetch('/api/auth-config', { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.url || !config.publishableKey) { resolveAuthReady(); return; }
    supabase = createClient(config.url, config.publishableKey, {
      auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    resolveAuthReady();
    showSession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => showSession(session));
  } catch (_error) {
    resolveAuthReady();
    root.hidden = true;
  }
}
trigger.addEventListener('click', () => setMenuOpen(panel.hidden));
document.addEventListener('click', (event) => {
  if (!root.contains(event.target)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setMenuOpen(false);
    trigger.focus();
  }
});
signOut.addEventListener('click', async () => {
  if (!supabase) return;
  signOut.disabled = true;
  signOut.textContent = 'Saindo…';
  const { error } = await supabase.auth.signOut();
  if (error) {
    signOut.disabled = false;
    signOut.textContent = 'Sair da conta';
    return;
  }
  window.location.assign('/conta.html');
});
init();
