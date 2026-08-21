const API_BASE = 'http://127.0.0.1:3001';
const ADMIN_API_KEY = localStorage.getItem('adminApiKey') || '';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadSessions();
  loadHealth();

  document.getElementById('refresh-sessions').addEventListener('click', loadSessions);
  document.getElementById('refresh-health').addEventListener('click', loadHealth);

  setInterval(loadSessions, 5000);
});

function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;

      navBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      views.forEach((v) => {
        v.classList.toggle('hidden', v.id !== `${viewName}-view`);
      });

      if (viewName === 'health') {
        loadHealth();
      }
    });
  });
}

async function loadSessions() {
  try {
    const response = await fetch(`${API_BASE}/sessions`, {
      headers: ADMIN_API_KEY ? { Authorization: `Bearer ${ADMIN_API_KEY}` } : {},
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    renderSessions(data.sessions);
  } catch (error) {
    console.error('Failed to load sessions:', error);
    document.getElementById('sessions-tbody').innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
  }
}

function renderSessions(sessions) {
  const tbody = document.getElementById('sessions-tbody');
  if (!sessions || sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No sessions configured</td></tr>';
    return;
  }

  tbody.innerHTML = sessions
    .map(
      (s) => `
    <tr class="${s.provider === null ? 'unassigned' : ''}">
      <td>${escapeHtml(s.clientId)}</td>
      <td><code>${escapeHtml(s.apiKey)}</code></td>
      <td class="provider-cell">${s.provider || '<em>Not set</em>'}</td>
      <td>${new Date(s.updatedAt).toLocaleString()}</td>
      <td class="actions">
        <select data-apiKey="${escapeHtml(s.apiKey)}" class="provider-select">
          <option value="">Select provider...</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="lmstudio">LM Studio</option>
        </select>
        <button class="btn btn-primary assign-btn" data-apiKey="${escapeHtml(s.apiKey)}">Save</button>
        <button class="btn btn-danger clear-btn" data-apiKey="${escapeHtml(s.apiKey)}">Clear</button>
      </td>
    </tr>
  `
    )
    .join('');

  document.querySelectorAll('.assign-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const apiKey = btn.dataset.apikey;
      const select = document.querySelector(`.provider-select[data-api-key="${apiKey}"]`);
      const provider = select?.value;
      if (!provider) {
        alert('Please select a provider');
        return;
      }
      assignProvider(apiKey, provider);
    });
  });

  document.querySelectorAll('.clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const apiKey = btn.dataset.apikey;
      removeProvider(apiKey);
    });
  });
}

async function assignProvider(apiKey, provider) {
  try {
    const response = await fetch(`${API_BASE}/sessions/assign-provider`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: ADMIN_API_KEY ? `Bearer ${ADMIN_API_KEY}` : '',
      },
      body: JSON.stringify({ apiKey, provider }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to assign provider');
    }

    loadSessions();
  } catch (error) {
    alert(`Failed: ${error.message}`);
  }
}

async function removeProvider(apiKey) {
  try {
    const response = await fetch(`${API_BASE}/sessions/remove-provider`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: ADMIN_API_KEY ? `Bearer ${ADMIN_API_KEY}` : '',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to remove provider');
    }

    loadSessions();
  } catch (error) {
    alert(`Failed: ${error.message}`);
  }
}

async function loadHealth() {
  try {
    const [healthRes, providersRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/providers`),
    ]);

    const health = await healthRes.json();
    const providers = await providersRes.json();

    const container = document.getElementById('health-status');
    container.innerHTML = `
      <div class="health-card">
        <h3><span class="status healthy"></span>Gateway</h3>
        <p>Status: ${health.status}</p>
        <p>Uptime: ${new Date(health.timestamp).toLocaleString()}</p>
      </div>
      ${Object.entries(providers.providers || {})
        .map(
          ([name, config]) => `
        <div class="health-card">
          <h3><span class="status healthy"></span>${escapeHtml(name)}</h3>
          <p>Type: ${config.type}</p>
          <p>URL: ${escapeHtml(config.baseURL)}</p>
        </div>
      `
        )
        .join('')}
    `;
  } catch (error) {
    document.getElementById('health-status').innerHTML = `<p>Error: ${error.message}</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
