import schedule from '../exam-schedule.json';

function parseHHMM(s) {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}
function firstBookableHour(lastExamEnds) {
  const { h, m } = parseHHMM(lastExamEnds);
  return m === 0 ? h : h + 1;
}
function lastBookableHour(dayEndsAt) {
  return parseHHMM(dayEndsAt).h - 1;
}

function buildSchedule() {
  if (!Array.isArray(schedule.rooms) || schedule.rooms.length === 0) {
    throw new Error('exam-schedule.json: campo "rooms" em falta ou vazio.');
  }
  const days = {};
  for (const [date, info] of Object.entries(schedule.examDays || {})) {
    const startHour = firstBookableHour(info.lastExamEnds);
    const endHour = lastBookableHour(schedule.dayEndsAt);
    const slots = [];
    for (let h = startHour; h <= endHour; h++) slots.push(h);
    days[date] = {
      lastExamEnds: info.lastExamEnds,
      exams: info._exams || '',
      slots
    };
  }
  return { rooms: schedule.rooms, dayEndsAt: schedule.dayEndsAt, days };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_name TEXT NOT NULL,
    room INTEGER NOT NULL,
    date TEXT NOT NULL,
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (room, date, hour)
  )
`;

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(SCHEMA_SQL).run();
  schemaReady = true;
}

function noDb() {
  return json(500, {
    error: 'Base de dados D1 não está ligada. Configure a binding "DB" nas Settings do Worker.'
  });
}

async function handleSchedule(request) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    return json(200, buildSchedule());
  } catch (e) {
    return json(500, { error: 'Erro ao ler calendário de exames.' });
  }
}

async function handleReservations(request, env) {
  if (!env.DB) return noDb();
  try {
    await ensureSchema(env.DB);

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT id, teacher_name, room, date, hour, reason, created_at
        FROM reservations
        ORDER BY date ASC, hour ASC, room ASC
      `).all();
      return json(200, results || []);
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: 'Pedido inválido.' });
      }
      const { teacher_name, room, date, hour, reason } = body || {};

      if (typeof teacher_name !== 'string' || teacher_name.trim().length < 2) {
        return json(400, { error: 'Nome do professor inválido.' });
      }
      if (typeof reason !== 'string' || reason.trim().length < 2) {
        return json(400, { error: 'Motivo inválido.' });
      }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json(400, { error: 'Data inválida.' });
      }
      const hourNum = Number(hour);
      if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
        return json(400, { error: 'Hora inválida.' });
      }
      const roomNum = Number(room);
      if (!Number.isInteger(roomNum) || !schedule.rooms.includes(roomNum)) {
        return json(400, { error: 'Sala inválida.' });
      }
      const day = schedule.examDays?.[date];
      if (!day) {
        return json(400, { error: 'A data escolhida não é um dia de exame.' });
      }
      const startHour = firstBookableHour(day.lastExamEnds);
      const endHour = lastBookableHour(schedule.dayEndsAt);
      if (hourNum < startHour || hourNum > endHour) {
        return json(400, {
          error: `Hora fora do intervalo permitido. Disponível das ${String(startHour).padStart(2, '0')}:00 às ${String(endHour + 1).padStart(2, '0')}:00.`
        });
      }

      try {
        const row = await env.DB.prepare(`
          INSERT INTO reservations (teacher_name, room, date, hour, reason)
          VALUES (?, ?, ?, ?, ?)
          RETURNING id
        `).bind(teacher_name.trim(), roomNum, date, hourNum, reason.trim()).first();
        return json(200, { id: row.id, message: 'Reserva criada com sucesso.' });
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('UNIQUE') || msg.includes('constraint')) {
          return json(409, { error: 'Essa sala já foi reservada para esse horário.' });
        }
        console.error(e);
        return json(500, { error: 'Erro de servidor.' });
      }
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Erro de servidor.' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/schedule') {
      return handleSchedule(request);
    }
    if (url.pathname === '/api/reservations') {
      return handleReservations(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  }
};
