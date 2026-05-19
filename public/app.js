const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const $ = (sel) => document.querySelector(sel);
const dayStrip = $('#day-strip');
const dayInfo = $('#day-info');
const grid = $('#grid');
const gridHead = $('#grid-head');
const gridBody = grid.querySelector('tbody');
const emptyState = $('#empty-state');
const modal = $('#modal');
const modalSummary = $('#modal-summary');
const modalMsg = $('#modal-msg');
const fName = $('#f-name');
const fReason = $('#f-reason');
const modalSubmit = $('#modal-submit');
const toast = $('#toast');

let schedule = { rooms: [], dayEndsAt: '21:00', days: {} };
let reservations = [];
let selectedDate = null;
let savedName = localStorage.getItem('plsalaexames.name') || '';
let pendingSlot = null;

function fmtDateLong(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${iso.split('-').reverse().join('/')}`;
}
function fmtHour(h) {
  return `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showToast(msg, kind) {
  toast.textContent = msg;
  toast.className = 'toast' + (kind ? ' ' + kind : '');
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
}

async function loadAll() {
  const [s, r] = await Promise.all([
    fetch('/api/schedule').then(r => r.json()),
    fetch('/api/reservations').then(r => r.json())
  ]);
  schedule = s;
  reservations = r;
  renderHead();
  renderDayStrip();
  renderGrid();
}

function renderHead() {
  gridHead.innerHTML = '<th class="hour-col">Hora</th>';
  for (const room of schedule.rooms) {
    const th = document.createElement('th');
    th.textContent = `Sala ${room}`;
    gridHead.appendChild(th);
  }
}

function renderDayStrip() {
  const dates = Object.keys(schedule.days).sort();
  dayStrip.innerHTML = '';
  if (!selectedDate || !schedule.days[selectedDate]) {
    const today = new Date().toISOString().slice(0, 10);
    selectedDate = dates.find(d => d >= today) || dates[0] || null;
  }
  for (const date of dates) {
    const d = new Date(date + 'T12:00:00');
    const [y, m, dm] = date.split('-');
    const btn = document.createElement('button');
    btn.className = 'day-pill' + (date === selectedDate ? ' active' : '');
    btn.innerHTML = `
      <span class="wd">${WEEKDAYS[d.getDay()]}</span>
      <span class="dm">${dm}/${m}</span>
      <span class="y">${y}</span>
    `;
    btn.addEventListener('click', () => {
      selectedDate = date;
      renderDayStrip();
      renderGrid();
    });
    dayStrip.appendChild(btn);
  }
  if (selectedDate) {
    const active = dayStrip.querySelector('.day-pill.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

function renderDayInfo(day) {
  const firstSlot = day.slots[0];
  const lastSlot = day.slots[day.slots.length - 1];
  const timesLine = day.slots.length
    ? `Reservas disponíveis das ${String(firstSlot).padStart(2, '0')}:00 às ${String(lastSlot + 1).padStart(2, '0')}:00 — depois de o último exame terminar (${day.lastExamEnds}).`
    : `Sem blocos disponíveis (último exame termina às ${day.lastExamEnds}).`;

  const exams = (day.exams || '').split('·').map(s => s.trim()).filter(Boolean);

  let examsHtml;
  if (exams.length) {
    examsHtml = `
      <div class="di-exams-label">Exames neste dia</div>
      <ul class="di-exams">
        ${exams.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
      </ul>
    `;
  } else {
    examsHtml = `<p class="di-no-exams">Sem exames listados para este dia.</p>`;
  }

  dayInfo.innerHTML = `
    <div class="di-title">${escapeHtml(fmtDateLong(selectedDate))}</div>
    <div class="di-times">${escapeHtml(timesLine)}</div>
    ${examsHtml}
  `;
}

function renderGrid() {
  gridBody.innerHTML = '';
  if (!selectedDate) {
    emptyState.textContent = 'Não há dias de exame configurados.';
    emptyState.hidden = false;
    dayInfo.innerHTML = '';
    dayInfo.hidden = true;
    return;
  }
  const day = schedule.days[selectedDate];
  if (!day) {
    emptyState.hidden = false;
    dayInfo.hidden = true;
    return;
  }
  dayInfo.hidden = false;
  renderDayInfo(day);

  if (!day.slots.length) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const taken = new Map();
  for (const r of reservations) {
    if (r.date !== selectedDate) continue;
    taken.set(`${r.hour}-${r.room}`, r);
  }

  for (const hour of day.slots) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'hour-cell';
    th.textContent = fmtHour(hour);
    tr.appendChild(th);
    for (const room of schedule.rooms) {
      const td = document.createElement('td');
      const r = taken.get(`${hour}-${room}`);
      if (!r) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot free';
        btn.textContent = 'Reservar';
        btn.setAttribute('aria-label', `Reservar Sala ${room} às ${fmtHour(hour)}`);
        btn.addEventListener('click', () => openModal({ date: selectedDate, hour, room }));
        td.appendChild(btn);
      } else {
        const div = document.createElement('div');
        div.className = 'slot taken';
        div.title = r.reason;
        div.innerHTML = `
          <span class="who">${escapeHtml(r.teacher_name)}</span>
          <span class="why">${escapeHtml(r.reason)}</span>
        `;
        td.appendChild(div);
      }
      tr.appendChild(td);
    }
    gridBody.appendChild(tr);
  }
}

function openModal({ date, hour, room }) {
  pendingSlot = { date, hour, room };
  modalSummary.textContent = `Sala ${room} · ${fmtDateLong(date)} · ${fmtHour(hour)}`;
  modalMsg.textContent = '';
  modalMsg.className = 'msg';
  fName.value = savedName;
  fReason.value = '';
  modal.hidden = false;
  setTimeout(() => {
    if (savedName) fReason.focus(); else fName.focus();
  }, 30);
}
function closeModal() {
  modal.hidden = true;
  pendingSlot = null;
}

$('#modal-close').addEventListener('click', closeModal);
$('#modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

$('#booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingSlot) return;
  modalMsg.textContent = '';
  modalSubmit.disabled = true;
  try {
    const payload = {
      teacher_name: fName.value.trim(),
      reason: fReason.value.trim(),
      ...pendingSlot
    };
    const r = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) {
      modalMsg.textContent = data.error || 'Erro ao reservar.';
      modalMsg.className = 'msg err';
    } else {
      savedName = payload.teacher_name;
      localStorage.setItem('plsalaexames.name', savedName);
      closeModal();
      showToast('Reserva confirmada.', 'ok');
      await loadAll();
    }
  } catch {
    modalMsg.textContent = 'Erro de rede.';
    modalMsg.className = 'msg err';
  } finally {
    modalSubmit.disabled = false;
  }
});

loadAll();
setInterval(loadAll, 30000);
