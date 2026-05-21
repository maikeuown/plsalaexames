const $ = (s) => document.querySelector(s);
const loginPanel = $('#login-panel');
const dashboard = $('#dashboard');
const loginForm = $('#login-form');
const loginPassword = $('#login-password');
const loginMsg = $('#login-msg');
const tbody = document.querySelector('#admin-table tbody');
const emptyEl = $('#empty');
const toast = $('#toast');
const filterDate = $('#filter-date');
const filterRoom = $('#filter-room');
const filterSearch = $('#filter-search');

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

let token = sessionStorage.getItem('plsalaexames.admin') || '';
let reservations = [];
let schedule = { rooms: [], days: {} };

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${iso.split('-').reverse().join('/')}`;
}
function fmtHour(h) { return `${String(h).padStart(2, '0')}:00`; }
function fmtCreated(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showToast(msg, kind) {
  toast.textContent = msg;
  toast.className = 'toast' + (kind ? ' ' + kind : '');
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2800);
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'x-admin-password': token }
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  if (r.status === 401) {
    sessionStorage.removeItem('plsalaexames.admin');
    token = '';
    showLogin('Sessão expirada — entre novamente.');
    throw new Error('unauthorized');
  }
  return r;
}

function showLogin(msg) {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  if (msg) {
    loginMsg.textContent = msg;
    loginMsg.className = 'msg err';
  } else {
    loginMsg.textContent = '';
  }
  loginPassword.focus();
}
function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg.textContent = '';
  const pw = loginPassword.value;
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      loginMsg.textContent = data.error || 'Erro a iniciar sessão.';
      loginMsg.className = 'msg err';
      return;
    }
    token = pw;
    sessionStorage.setItem('plsalaexames.admin', token);
    showDashboard();
    await loadAll();
  } catch {
    loginMsg.textContent = 'Erro de rede.';
    loginMsg.className = 'msg err';
  }
});

$('#logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('plsalaexames.admin');
  token = '';
  loginPassword.value = '';
  showLogin();
});

$('#refresh-btn').addEventListener('click', loadAll);

async function loadAll() {
  try {
    const [r, s] = await Promise.all([
      api('GET', '/api/admin/reservations'),
      fetch('/api/schedule')
    ]);
    reservations = await r.json();
    schedule = await s.json();
    populateFilters();
    renderStats();
    renderTable();
  } catch (e) {
    if (String(e.message) !== 'unauthorized') {
      showToast('Erro a carregar dados.', 'err');
    }
  }
}

function populateFilters() {
  const currentDate = filterDate.value;
  const currentRoom = filterRoom.value;
  filterDate.innerHTML = '<option value="">Todos os dias</option>';
  for (const d of Object.keys(schedule.days || {}).sort()) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = fmtDate(d);
    filterDate.appendChild(opt);
  }
  filterDate.value = currentDate;
  filterRoom.innerHTML = '<option value="">Todas</option>';
  for (const r of schedule.rooms || []) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = `Sala ${r}`;
    filterRoom.appendChild(opt);
  }
  filterRoom.value = currentRoom;
}

function renderStats() {
  const total = reservations.length;
  const days = new Set(reservations.map(r => r.date)).size;
  const roomCounts = {};
  for (const r of reservations) roomCounts[r.room] = (roomCounts[r.room] || 0) + 1;
  let topRoom = '—';
  let topCount = 0;
  for (const [room, count] of Object.entries(roomCounts)) {
    if (count > topCount) { topCount = count; topRoom = `Sala ${room}`; }
  }
  $('#stat-total').textContent = total;
  $('#stat-days').textContent = days;
  $('#stat-top-room').textContent = topRoom;
}

function filteredRows() {
  const date = filterDate.value;
  const room = filterRoom.value;
  const q = filterSearch.value.trim().toLowerCase();
  return reservations.filter(r => {
    if (date && r.date !== date) return false;
    if (room && String(r.room) !== String(room)) return false;
    if (q) {
      const hay = (r.teacher_name + ' ' + r.reason).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderTable() {
  const rows = filteredRows();
  tbody.innerHTML = '';
  if (rows.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="id">#${r.id}</td>
      <td>${fmtDate(r.date)}</td>
      <td>${fmtHour(r.hour)}</td>
      <td>Sala ${r.room}</td>
      <td>${escapeHtml(r.teacher_name)}</td>
      <td class="reason" title="${escapeHtml(r.reason)}">${escapeHtml(r.reason)}</td>
      <td>${fmtCreated(r.created_at)}</td>
      <td><button class="row-del" data-id="${r.id}" data-name="${escapeHtml(r.teacher_name)}">Apagar</button></td>
    `;
    tbody.appendChild(tr);
  }
}

filterDate.addEventListener('change', renderTable);
filterRoom.addEventListener('change', renderTable);
filterSearch.addEventListener('input', renderTable);

tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.row-del');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name');
  if (!confirm(`Apagar a reserva #${id} de ${name}?`)) return;
  try {
    const r = await api('DELETE', `/api/admin/reservations/${id}`);
    if (r.ok) {
      showToast('Reserva apagada.', 'ok');
      await loadAll();
    } else {
      const data = await r.json().catch(() => ({}));
      showToast(data.error || 'Erro ao apagar.', 'err');
    }
  } catch {}
});

$('#delete-all-btn').addEventListener('click', async () => {
  if (!confirm('APAGAR TODAS as reservas? Esta ação não pode ser desfeita.')) return;
  if (!confirm('Tem mesmo a certeza? Vai apagar tudo.')) return;
  try {
    const r = await api('DELETE', '/api/admin/reservations');
    if (r.ok) {
      const data = await r.json();
      showToast(`Apagadas ${data.deleted} reservas.`, 'ok');
      await loadAll();
    } else {
      const data = await r.json().catch(() => ({}));
      showToast(data.error || 'Erro.', 'err');
    }
  } catch {}
});

$('#export-csv').addEventListener('click', () => {
  const rows = filteredRows();
  const header = ['id', 'data', 'hora', 'sala', 'professor', 'motivo', 'criada_em'];
  const csv = [
    header.join(','),
    ...rows.map(r => [
      r.id,
      r.date,
      fmtHour(r.hour),
      r.room,
      JSON.stringify(r.teacher_name),
      JSON.stringify(r.reason),
      r.created_at
    ].join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

if (token) {
  // tenta validar a sessão; se falhar, mostra login
  api('GET', '/api/admin/reservations').then(async (r) => {
    if (r.ok) {
      reservations = await r.json();
      const s = await fetch('/api/schedule').then(r => r.json());
      schedule = s;
      showDashboard();
      populateFilters();
      renderStats();
      renderTable();
    } else {
      showLogin();
    }
  }).catch(() => showLogin());
} else {
  showLogin();
}
