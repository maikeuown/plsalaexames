import { rawSchedule, firstBookableHour, lastBookableHour, jsonResponse } from './_lib.js';

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
const UNIQUE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS reservations_slot_uniq
  ON reservations (room, date, hour)
`;

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(SCHEMA_SQL).run();
  await db.prepare(UNIQUE_INDEX_SQL).run();
  schemaReady = true;
}

function noDb() {
  return jsonResponse(500, {
    error: 'Base de dados D1 não está ligada. Configure a binding "DB" nas Settings → Functions do projeto Pages.'
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  try {
    await ensureSchema(env.DB);
    const { results } = await env.DB.prepare(`
      SELECT id, teacher_name, room, date, hour, reason, created_at
      FROM reservations
      ORDER BY date ASC, hour ASC, room ASC
    `).all();
    return jsonResponse(200, results || []);
  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: 'Erro de servidor.' });
  }
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return noDb();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Pedido inválido.' });
  }

  const { teacher_name, room, date, hour, reason } = body || {};

  if (typeof teacher_name !== 'string' || teacher_name.trim().length < 2) {
    return jsonResponse(400, { error: 'Nome do professor inválido.' });
  }
  if (typeof reason !== 'string' || reason.trim().length < 2) {
    return jsonResponse(400, { error: 'Motivo inválido.' });
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse(400, { error: 'Data inválida.' });
  }
  const hourNum = Number(hour);
  if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
    return jsonResponse(400, { error: 'Hora inválida.' });
  }
  const roomNum = Number(room);
  if (!Number.isInteger(roomNum) || !rawSchedule.rooms.includes(roomNum)) {
    return jsonResponse(400, { error: 'Sala inválida.' });
  }
  const day = rawSchedule.examDays?.[date];
  if (!day) {
    return jsonResponse(400, { error: 'A data escolhida não é um dia de exame.' });
  }
  const startHour = firstBookableHour(day.lastExamEnds);
  const endHour = lastBookableHour(rawSchedule.dayEndsAt);
  if (hourNum < startHour || hourNum > endHour) {
    return jsonResponse(400, {
      error: `Hora fora do intervalo permitido. Disponível das ${String(startHour).padStart(2, '0')}:00 às ${String(endHour + 1).padStart(2, '0')}:00.`
    });
  }

  try {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare(`
      INSERT INTO reservations (teacher_name, room, date, hour, reason)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).bind(teacher_name.trim(), roomNum, date, hourNum, reason.trim()).first();
    return jsonResponse(200, { id: row.id, message: 'Reserva criada com sucesso.' });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      return jsonResponse(409, { error: 'Essa sala já foi reservada para esse horário.' });
    }
    console.error(e);
    return jsonResponse(500, { error: 'Erro de servidor.' });
  }
}

export async function onRequest() {
  return jsonResponse(405, { error: 'Method not allowed' });
}
