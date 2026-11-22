import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0?bundle';

const $ = (id) => document.getElementById(id);
const root = $('accountMenu');
const trigger = $('accountMenuTrigger');
const panel = $('accountMenuPanel');
const signOut = $('accountMenuSignOut');
let supabase = null;

function setMenuOpen(open) {
  panel.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}
function showSession(session) {
  if (!session?.user) {
    root.hidden = true;
    setMenuOpen(false);
    return;
  }
  const user = session.user;
  const metadata = user.user_metadata || {};
  const name = metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Minha conta';
  $('accountMenuName').textContent = name;
  $('accountMenuEmail').textContent = user.email || '';
  $('accountMenuCompany').textContent = '';
  $('accountMenuAvatar').textContent = (name.trim()[0] || 'U').toUpperCase();
  root.hidden = false;
  if (session.access_token) {
    fetch('/api/my-company', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store'
    }).then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result?.linked && result.company) $('accountMenuCompany').textContent = result.company.name;
      }).catch(() => {});
  }
}
async function init() {
  try {
    const response = await fetch('/api/auth-config', { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.url || !config.publishableKey) return;
    supabase = createClient(config.url, config.publishableKey, {
      auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    showSession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => showSession(session));
  } catch (_error) {
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
