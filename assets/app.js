const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://sitetrace-api.onrender.com';
const apiPath = (path) => `${apiBase}${path}`;
const page = document.body.dataset.page || 'home';
const state = { config: null, supabase: null, session: null, profile: null, sites: [], selectedSiteId: null, selectedChecks: [] };
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

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatDurationSince(value) {
  if (!value) return 'No downtime recorded';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function statusCopy(status) {
  if (status === 'online') return 'Responding normally';
  if (status === 'warning') return 'Needs attention';
  if (status === 'down') return 'Currently down';
  if (status === 'maintenance') return 'Maintenance window';
  return 'Waiting for first check';
}

function normalizePublicUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function uptimePercent(checks) {
  const counted = checks.filter((check) => ['online', 'warning', 'down'].includes(check.status));
  if (!counted.length) return '-';
  const up = counted.filter((check) => check.status === 'online' || check.status === 'warning').length;
  return `${((up / counted.length) * 100).toFixed(1)}%`;
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
  const target = document.getElementById('results') || document.getElementById('pageMessage') || document.getElementById('siteDetail');
  if (target) target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function setDashboardMessage(message, tone = '') {
  const target = document.getElementById('dashboardMessage');
  if (!target) return;
  target.className = `message ${tone}`.trim();
  target.textContent = message || '';
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
  if (!state.selectedSiteId && state.sites.length) state.selectedSiteId = state.sites[0].id;
  if (state.selectedSiteId && !state.sites.some((site) => site.id === state.selectedSiteId)) {
    state.selectedSiteId = state.sites.length ? state.sites[0].id : null;
  }
  if (state.selectedSiteId) await loadSelectedChecks();
  renderDashboard();
}

function renderDashboard() {
  document.getElementById('planValue').textContent = state.profile ? state.profile.plan : 'free';
  document.getElementById('siteCount').textContent = state.sites.length;
  const lastSite = state.sites.find((site) => site.last_checked_at);
  document.getElementById('lastCheckValue').textContent = lastSite ? new Date(lastSite.last_checked_at).toLocaleDateString() : '-';
  const list = document.getElementById('sitesList');
  const listCount = document.getElementById('siteListCount');
  if (listCount) listCount.textContent = state.sites.length;
  if (!state.sites.length) {
    list.innerHTML = '<div class="empty">No monitored sites yet.</div>';
    renderSiteDetail(null);
    return;
  }
  list.innerHTML = state.sites.map((site) => {
    const active = site.id === state.selectedSiteId ? ' active' : '';
    const status = statusLabel(site.last_status);
    return `<button class="site-list-item${active}" type="button" data-select="${site.id}"><span class="dot ${status === 'online' ? '' : status}"></span><span><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.url)}</small></span><em class="level-badge ${status}">${escapeHtml(status)}</em></button>`;
  }).join('');
  renderSiteDetail(state.sites.find((site) => site.id === state.selectedSiteId));
}

async function runSiteCheck(siteId) {
  const detail = document.getElementById('siteDetail');
  if (detail) detail.classList.add('is-loading');
  setDashboardMessage('Running check...');
  const response = await fetch(apiPath('/api/run-site-check'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ site_id: siteId, locale: 'en' }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Check failed');
  const emailResult = data.incident && data.incident.notifications && data.incident.notifications.email;
  await loadDashboard();
  if (emailResult && emailResult.sent) {
    setDashboardMessage('Incident email sent successfully.', 'success');
  } else if (emailResult && !emailResult.sent) {
    setDashboardMessage(`Incident was recorded, but email was not sent: ${emailResult.reason || 'unknown error'}`, 'error');
  } else if (data.incident && data.incident.pending_confirmation) {
    setDashboardMessage('First matching failure recorded. Run one more matching check to open an incident and send an alert.');
  } else {
    setDashboardMessage('Check completed.');
  }
}

async function testAlertEmail() {
  const button = document.getElementById('testEmailBtn');
  if (button) button.disabled = true;
  setDashboardMessage('Sending test email...');
  try {
    const response = await fetch(apiPath('/api/test-alert-email'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      const reason = data.email && data.email.reason ? `: ${data.email.reason}` : '';
      throw new Error(`${data.message || 'Test email failed'}${reason}`);
    }
    const event = data.delivery && data.delivery.last_event ? ` Event: ${data.delivery.last_event}.` : '';
    setDashboardMessage(`Test email sent to ${data.to}. Resend id: ${data.email && data.email.id ? data.email.id : 'created'}.${event}`, 'success');
  } catch (error) {
    setDashboardMessage(error.message || 'Test email failed', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadSelectedChecks() {
  if (!state.selectedSiteId) {
    state.selectedChecks = [];
    return;
  }
  const { data, error } = await state.supabase.from('checks').select('*').eq('site_id', state.selectedSiteId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  state.selectedChecks = data || [];
}

async function showHistory(siteId) {
  const { data, error } = await state.supabase.from('checks').select('*').eq('site_id', siteId).order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  const history = document.getElementById('siteDetail');
  if (!data.length) {
    history.innerHTML = '<div class="empty">No check history yet.</div>';
    return;
  }
  history.innerHTML = `<div class="check-list">${data.map((check) => `<div class="check"><span class="dot ${check.status}"></span><div><p class="check-title">${new Date(check.created_at).toLocaleString()} <span class="level-badge ${check.status}">${escapeHtml(check.status)}</span></p><p class="check-copy">${check.score || '-'} / 100 - ${check.response_time_ms || '-'}ms - HTTP ${check.status_code || '-'}</p></div><span class="check-value">${escapeHtml(check.result && check.result.page_context)}</span></div>`).join('')}</div>`;
}

function renderSiteDetail(site) {
  const detail = document.getElementById('siteDetail');
  if (!detail) return;
  detail.classList.remove('empty-state', 'is-loading');
  if (!site) {
    detail.classList.add('empty-state');
    detail.innerHTML = '<h2>No site selected</h2><p>Choose a monitored site from the left to see status, uptime context, and recent checks.</p>';
    return;
  }

  const checks = state.selectedChecks || [];
  const latest = checks[0];
  const lastDown = checks.find((check) => check.status === 'down');
  const incidents = checks.filter((check) => check.status === 'down').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const averageResponse = checks.filter((check) => Number(check.response_time_ms) > 0);
  const avgMs = averageResponse.length
    ? `${Math.round(averageResponse.reduce((sum, check) => sum + Number(check.response_time_ms || 0), 0) / averageResponse.length)}ms`
    : '-';
  const status = statusLabel(site.last_status);
  const latestResult = latest && latest.result ? latest.result : null;
  const importantChecks = latestResult && Array.isArray(latestResult.checks)
    ? latestResult.checks.filter((check) => check.level !== 'pass').slice(0, 5)
    : [];

  const issueHtml = importantChecks.length
    ? importantChecks.map((check) => `<div class="check compact-check"><span class="dot ${check.level}"></span><div><p class="check-title">${escapeHtml(check.title)} <span class="level-badge ${check.level}">${escapeHtml(check.level)}</span></p><p class="check-copy">${escapeHtml(check.recommendation)}</p></div><span class="check-value">${escapeHtml(check.value)}</span></div>`).join('')
    : '<div class="empty subtle">No open recommendations from the latest check.</div>';

  const historyHtml = checks.length
    ? checks.slice(0, 12).map((check) => `<div class="timeline-row"><span class="dot ${check.status === 'online' ? '' : check.status}"></span><div><strong>${escapeHtml(check.status)}</strong><small>${formatDateTime(check.created_at)} - ${check.score || '-'} / 100 - ${check.response_time_ms || '-'}ms - HTTP ${check.status_code || 'unreachable'}</small></div></div>`).join('')
    : '<div class="empty subtle">Run the first check to start history.</div>';
  const bars = checks.slice(0, 24).reverse().map((check) => `<span class="uptime-bar ${statusLabel(check.status)}" title="${escapeHtml(check.status)} ${formatDateTime(check.created_at)}"></span>`).join('');
  const publicUrl = site.public_slug ? `${window.location.origin}/status/${site.public_slug}` : '';

  detail.innerHTML = `
    <div class="detail-hero">
      <div>
        <p class="eyebrow compact">Selected monitor</p>
        <h2>${escapeHtml(site.name)}</h2>
        <p class="muted">${escapeHtml(site.url)}</p>
      </div>
      <span class="status-pill ${status}"><span class="dot ${status === 'online' ? '' : status}"></span>${escapeHtml(statusCopy(status))}</span>
    </div>
    <div class="detail-actions">
      <button class="button" type="button" data-run="${site.id}">Run check</button>
      <button class="button secondary" type="button" data-refresh-detail="${site.id}">Refresh history</button>
      <button class="button danger" type="button" data-delete="${site.id}">Delete</button>
    </div>
    <div class="detail-metrics">
      <div class="dash-card"><span class="muted">Current status</span><h3>${escapeHtml(status)}</h3></div>
      <div class="dash-card"><span class="muted">Uptime sample</span><h3>${uptimePercent(checks)}</h3></div>
      <div class="dash-card"><span class="muted">Score</span><h3>${site.last_score ? `${site.last_score}/100` : '-'}</h3></div>
      <div class="dash-card"><span class="muted">Response</span><h3>${site.last_response_time_ms ? `${site.last_response_time_ms}ms` : '-'}</h3></div>
      <div class="dash-card"><span class="muted">Avg response</span><h3>${avgMs}</h3></div>
      <div class="dash-card"><span class="muted">Last check</span><h3>${formatDurationSince(site.last_checked_at)}</h3></div>
      <div class="dash-card"><span class="muted">Since last down</span><h3>${formatDurationSince(lastDown && lastDown.created_at)}</h3></div>
      <div class="dash-card"><span class="muted">Recent incidents</span><h3>${incidents} down - ${warnings} warn</h3></div>
    </div>
    <div class="uptime-strip">${bars || '<span class="muted">No uptime samples yet.</span>'}</div>
    <form class="monitor-settings" id="monitorSettingsForm">
      <div class="settings-head"><strong>Monitor settings</strong><span class="muted">Keyword checks, maintenance, public status.</span></div>
      <label><span>Keyword must appear</span><input id="keywordInput" type="text" value="${escapeHtml(site.keyword || '')}" placeholder="optional text to monitor"></label>
      <label><span>Maintenance starts</span><input id="maintenanceStartInput" type="datetime-local" value="${site.maintenance_starts_at ? new Date(site.maintenance_starts_at).toISOString().slice(0,16) : ''}"></label>
      <label><span>Maintenance ends</span><input id="maintenanceEndInput" type="datetime-local" value="${site.maintenance_ends_at ? new Date(site.maintenance_ends_at).toISOString().slice(0,16) : ''}"></label>
      <label class="toggle-row"><input id="statusPageInput" type="checkbox" ${site.status_page_enabled ? 'checked' : ''}><span>Enable public status page</span></label>
      ${publicUrl && site.status_page_enabled ? `<a class="status-link" href="${publicUrl}" target="_blank" rel="noopener">${escapeHtml(publicUrl)}</a>` : ''}
      <button class="button secondary" type="submit">Save settings</button>
    </form>
    <div class="detail-grid">
      <div class="panel flat-panel"><div class="panel-top"><strong>Latest recommendations</strong></div><div class="check-list">${issueHtml}</div></div>
      <div class="panel flat-panel"><div class="panel-top"><strong>Recent checks</strong></div><div class="timeline">${historyHtml}</div></div>
    </div>`;
}

async function initDashboard() {
  if (page !== 'dashboard') return;
  await loadDashboard();
  document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
  document.getElementById('testEmailBtn').addEventListener('click', testAlertEmail);
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    if (state.supabase) await state.supabase.auth.signOut();
    window.location.href = '/signin';
  });
  document.getElementById('siteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const siteUrl = normalizePublicUrl(document.getElementById('siteUrl').value);
    if (!siteUrl) {
      document.getElementById('siteDetail').innerHTML = '<div class="empty">Enter a public website URL.</div>';
      return;
    }
    const payload = {
      user_id: state.session.user.id,
      name: document.getElementById('siteName').value,
      url: siteUrl,
      monitoring_enabled: true
    };
    const { error } = await state.supabase.from('sites').insert(payload);
    if (error) throw error;
    event.target.reset();
    await loadDashboard();
    document.getElementById('siteDetail').insertAdjacentHTML('afterbegin', '<div class="empty subtle">Saved.</div>');
  });
  document.getElementById('sitesList').addEventListener('click', async (event) => {
    const selectId = event.target.closest('[data-select]') && event.target.closest('[data-select]').dataset.select;
    try {
      if (selectId) {
        state.selectedSiteId = selectId;
        await loadSelectedChecks();
        renderDashboard();
      }
    } catch (error) {
      document.getElementById('siteDetail').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
  document.getElementById('siteDetail').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-run], [data-refresh-detail], [data-delete]');
    if (!action) return;
    const runId = action.dataset.run;
    const refreshId = action.dataset.refreshDetail;
    const deleteId = action.dataset.delete;
    try {
      if (runId) await runSiteCheck(runId);
      if (refreshId) {
        state.selectedSiteId = refreshId;
        await loadSelectedChecks();
        renderDashboard();
      }
      if (deleteId) {
        if (!window.confirm('Delete this monitored site and its check history?')) return;
        await state.supabase.from('sites').delete().eq('id', deleteId);
        await loadDashboard();
      }
    } catch (error) {
      const detail = document.getElementById('siteDetail');
      detail.classList.remove('is-loading');
      detail.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
  document.getElementById('siteDetail').addEventListener('submit', async (event) => {
    if (event.target.id !== 'monitorSettingsForm') return;
    event.preventDefault();
    const siteId = state.selectedSiteId;
    const payload = {
      keyword: document.getElementById('keywordInput').value.trim() || null,
      keyword_should_exist: true,
      maintenance_starts_at: document.getElementById('maintenanceStartInput').value ? new Date(document.getElementById('maintenanceStartInput').value).toISOString() : null,
      maintenance_ends_at: document.getElementById('maintenanceEndInput').value ? new Date(document.getElementById('maintenanceEndInput').value).toISOString() : null,
      status_page_enabled: document.getElementById('statusPageInput').checked
    };
    const response = await fetch(apiPath(`/api/sites/${siteId}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not save settings');
    await loadDashboard();
  });
}

async function initStatusPage() {
  if (page !== 'status') return;
  const slug = window.location.pathname.split('/').filter(Boolean).pop();
  const target = document.getElementById('publicStatusRoot');
  const response = await fetch(apiPath(`/public/status/${slug}`));
  const data = await response.json();
  if (!response.ok) {
    target.innerHTML = '<div class="empty">Status page not found.</div>';
    return;
  }
  const checks = data.checks || [];
  const incidents = data.incidents || [];
  const site = data.site;
  const status = statusLabel(site.last_status);
  const bars = checks.slice(0, 50).reverse().map((check) => `<span class="uptime-bar ${statusLabel(check.status)}" title="${escapeHtml(check.status)} ${formatDateTime(check.created_at)}"></span>`).join('');
  target.innerHTML = `
    <div class="public-status-card">
      <div class="detail-hero">
        <div><p class="eyebrow compact">Public status</p><h1>${escapeHtml(site.name)}</h1><p class="muted">${escapeHtml(site.url)}</p></div>
        <span class="status-pill ${status}"><span class="dot ${status === 'online' ? '' : status}"></span>${escapeHtml(statusCopy(status))}</span>
      </div>
      <div class="detail-metrics">
        <div class="dash-card"><span class="muted">Uptime sample</span><h3>${uptimePercent(checks)}</h3></div>
        <div class="dash-card"><span class="muted">Response</span><h3>${site.last_response_time_ms ? `${site.last_response_time_ms}ms` : '-'}</h3></div>
        <div class="dash-card"><span class="muted">Last check</span><h3>${formatDurationSince(site.last_checked_at)}</h3></div>
      </div>
      <div class="uptime-strip">${bars}</div>
      <div class="panel flat-panel"><div class="panel-top"><strong>Incident history</strong></div><div class="timeline">${incidents.length ? incidents.map((incident) => `<div class="timeline-row"><span class="dot ${incident.status === 'resolved' ? '' : incident.status}"></span><div><strong>${escapeHtml(incident.title)}</strong><small>${formatDateTime(incident.created_at)}${incident.resolved_at ? ` - resolved ${formatDateTime(incident.resolved_at)}` : ''}</small></div></div>`).join('') : '<div class="empty subtle">No incidents reported.</div>'}</div></div>
    </div>`;
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
initStatusPage().catch(renderError);
