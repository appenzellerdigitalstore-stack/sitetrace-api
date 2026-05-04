const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://sitetrace-api.onrender.com';
const apiPath = (path) => `${apiBase}${path}`;
const page = document.body.dataset.page || 'home';
const state = { config: null, supabase: null, session: null, profile: null, sites: [] };
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

if (page === 'home' && ['#pricing', '#api', '#dashboard'].includes(window.location.hash)) {
  window.location.replace(window.location.hash.replace('#', '/'));
}

function authHeaders() {
  return state.session ? { Authorization: `Bearer ${state.session.access_token}` } : {};
}

function statusLabel(level) {
  if (level === 'online') return 'online';
  if (level === 'warning') return 'warning';
  if (level === 'down') return 'down';
  return level || 'pending';
}

async function initSupabase() {
  if (!window.supabase) return;
  state.config = await fetch(apiPath('/config')).then((res) => res.json());
  if (state.config.supabase_url && state.config.supabase_anon_key) {
    state.supabase = window.supabase.createClient(state.config.supabase_url, state.config.supabase_anon_key);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((event, session) => {
      state.session = session;
      if (page === 'dashboard') loadDashboard();
    });
  }
}

function renderResults(data) {
  const target = document.getElementById('results');
  if (!target) return;

  const checks = Array.isArray(data.checks) ? data.checks : [];
  const failCount = checks.filter((check) => check.level === 'fail').length;
  const warningCount = checks.filter((check) => check.level === 'warning').length;
  const sorted = [...checks].sort((a, b) => ({ fail: 0, warning: 1, pass: 2 }[a.level] - { fail: 0, warning: 1, pass: 2 }[b.level]));
  const score = Number(data.score || data.seo_score || 0);
  const checkHtml = sorted.map((check) => `<div class="check"><span class="dot ${check.level === 'pass' ? '' : check.level}"></span><div><p class="check-title">${escapeHtml(check.title)} <span class="level-badge ${check.level}">${escapeHtml(check.level)}</span></p><p class="check-copy">${escapeHtml(check.description)}</p><p class="check-copy"><strong>Recommendation:</strong> ${escapeHtml(check.recommendation)}</p></div><span class="check-value">${escapeHtml(check.value)}</span></div>`).join('');

  target.innerHTML = `<div class="result-shell"><div class="panel-top"><div><p class="eyebrow compact">Site health report</p><strong>${escapeHtml(data.final_url || data.analyzed_url)}</strong></div><div class="score-ring" style="background:conic-gradient(var(--green) 0 ${score}%, rgba(255,255,255,.14) ${score}% 100%);"><span>${score}</span></div></div><div class="metric-grid"><div class="metric"><strong>${score}/100</strong><span>Score</span></div><div class="metric"><strong>${escapeHtml(data.response_time)}</strong><span>Response time</span></div><div class="metric"><strong>${escapeHtml(data.status_code)}</strong><span>Status code</span></div><div class="metric"><strong>${failCount}</strong><span>Failed</span></div><div class="metric"><strong>${warningCount}</strong><span>Warning</span></div><div class="metric"><strong>${checks.length}</strong><span>Checks</span></div></div><div class="check-list">${checkHtml}</div></div>`;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderError(message) {
  const target = document.getElementById('results') || document.getElementById('pageMessage');
  if (target) target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function initAnalyzer() {
  const form = document.getElementById('analyzeForm');
  if (!form) return;
  const input = document.getElementById('urlInput');
  const button = document.getElementById('analyzeBtn');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) return renderError('Enter a website URL first.');
    button.disabled = true;
    document.getElementById('results').innerHTML = '<div class="result-shell"><div class="panel-top"><strong>Analyzing your website...</strong></div></div>';
    try {
      const response = await fetch(apiPath('/analyze'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, locale: 'en' }) });
      const data = await response.json();
      if (!response.ok || data.status === 'error') renderError(data.message || 'Analysis failed');
      else renderResults(data);
    } catch (error) {
      renderError(error.message || 'Analysis failed');
    } finally {
      button.disabled = false;
    }
  });
}

async function initAuth() {
  const form = document.getElementById('authForm');
  if (!form) return;
  await initSupabase();
  const message = document.getElementById('authMessage');

  if (!state.supabase) {
    message.textContent = 'Supabase is not configured yet.';
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      message.textContent = error.message;
      return;
    }
    state.session = data.session;
    window.location.href = '/dashboard';
  });

  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const { error } = await state.supabase.auth.signUp({ email, password });
    message.textContent = error ? error.message : 'Account created. You can sign in now.';
  });
}

async function loadDashboard() {
  const setupWarning = document.getElementById('setupWarning');
  const authRequired = document.getElementById('authRequired');
  const dashboardView = document.getElementById('dashboardView');
  if (!dashboardView) return;

  if (!state.config) await initSupabase();
  const configured = Boolean(state.supabase);
  setupWarning.classList.toggle('hidden', configured);
  authRequired.classList.toggle('hidden', !configured || Boolean(state.session));
  dashboardView.classList.toggle('hidden', !configured || !state.session);

  const signOut = document.getElementById('signOutBtn');
  if (signOut) signOut.classList.toggle('hidden', !state.session);
  if (!configured || !state.session) return;

  const me = await fetch(apiPath('/api/me'), { headers: authHeaders() }).then((res) => res.json());
  state.profile = me.profile;
  const { data: sites, error } = await state.supabase.from('sites').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  state.sites = sites || [];
  renderDashboard();
}

function renderDashboard() {
  document.getElementById('planValue').textContent = state.profile ? state.profile.plan : 'free';
  document.getElementById('siteCount').textContent = state.sites.length;
  const lastSite = state.sites.find((site) => site.last_checked_at);
  document.getElementById('lastCheckValue').textContent = lastSite ? new Date(lastSite.last_checked_at).toLocaleDateString() : '-';
  const list = document.getElementById('sitesList');
  if (!state.sites.length) {
    list.innerHTML = '<div class="empty">No monitored sites yet.</div>';
    return;
  }
  list.innerHTML = state.sites.map((site) => `<div class="site-row"><div><strong>${escapeHtml(site.name)}</strong><span class="muted">${escapeHtml(site.url)}</span></div><span class="level-badge ${statusLabel(site.last_status)}">${escapeHtml(statusLabel(site.last_status))}</span><span class="muted">${site.last_score ? `${site.last_score}/100` : '-'}</span><div><button class="button secondary" data-run="${site.id}">Run check</button> <button class="button secondary" data-history="${site.id}">History</button> <button class="button danger" data-delete="${site.id}">Delete</button></div></div>`).join('');
}

async function runSiteCheck(siteId) {
  document.getElementById('historyPanel').innerHTML = '<div class="empty">Analyzing your website...</div>';
  const response = await fetch(apiPath('/api/run-site-check'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ site_id: siteId, locale: 'en' }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Check failed');
  renderResults(data.analysis);
  await loadDashboard();
}

async function showHistory(siteId) {
  const { data, error } = await state.supabase.from('checks').select('*').eq('site_id', siteId).order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  const history = document.getElementById('historyPanel');
  if (!data.length) {
    history.innerHTML = '<div class="empty">No check history yet.</div>';
    return;
  }
  history.innerHTML = `<div class="check-list">${data.map((check) => `<div class="check"><span class="dot ${check.status}"></span><div><p class="check-title">${new Date(check.created_at).toLocaleString()} <span class="level-badge ${check.status}">${escapeHtml(check.status)}</span></p><p class="check-copy">${check.score || '-'} / 100 - ${check.response_time_ms || '-'}ms - HTTP ${check.status_code || '-'}</p></div><span class="check-value">${escapeHtml(check.result && check.result.page_context)}</span></div>`).join('')}</div>`;
}

async function initDashboard() {
  if (page !== 'dashboard') return;
  await loadDashboard();
  document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    if (state.supabase) await state.supabase.auth.signOut();
    window.location.href = '/signin';
  });
  document.getElementById('siteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      user_id: state.session.user.id,
      name: document.getElementById('siteName').value,
      url: document.getElementById('siteUrl').value,
      monitoring_enabled: true
    };
    const { error } = await state.supabase.from('sites').insert(payload);
    if (error) throw error;
    event.target.reset();
    await loadDashboard();
    document.getElementById('historyPanel').innerHTML = '<div class="empty">Saved.</div>';
  });
  document.getElementById('sitesList').addEventListener('click', async (event) => {
    const runId = event.target.dataset.run;
    const historyId = event.target.dataset.history;
    const deleteId = event.target.dataset.delete;
    try {
      if (runId) await runSiteCheck(runId);
      if (historyId) await showHistory(historyId);
      if (deleteId) {
        if (!window.confirm('Delete this monitored site and its check history?')) return;
        await state.supabase.from('sites').delete().eq('id', deleteId);
        await loadDashboard();
      }
    } catch (error) {
      document.getElementById('historyPanel').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
}

async function initBilling() {
  const buttons = document.querySelectorAll('[data-upgrade]');
  if (!buttons.length) return;
  await initSupabase();
  buttons.forEach((button) => button.addEventListener('click', async () => {
    const message = document.getElementById('pageMessage');
    if (!state.session) {
      window.location.href = '/signin';
      return;
    }
    try {
      const response = await fetch(apiPath('/billing/create-checkout-session'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ plan: button.dataset.upgrade }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Billing is not configured');
      window.location.href = data.url;
    } catch (error) {
      message.textContent = error.message;
    }
  }));
}

initAnalyzer();
initAuth().catch(renderError);
initDashboard().catch(renderError);
initBilling().catch(renderError);
