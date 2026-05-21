try { require('dotenv').config(); } catch { /* dotenv opcional */ }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const SCHEDULE_PATH = path.join(__dirname, 'exam-schedule.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_name TEXT NOT NULL,
    room INTEGER NOT NULL,
    date TEXT NOT NULL,
    hour INTEGER NOT NULL CHECK(hour BETWEEN 0 AND 23),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(room, date, hour)
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO reservations (teacher_name, room, date, hour, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const listStmt = db.prepare(`
  SELECT id, teacher_name, room, date, hour, reason, created_at
  FROM reservations
  ORDER BY date ASC, hour ASC, room ASC
`);
const deleteStmt = db.prepare(`DELETE FROM reservations WHERE id = ?`);
const statsTotalStmt = db.prepare(`SELECT COUNT(*) AS c FROM reservations`);
const statsByDayStmt = db.prepare(`SELECT date, COUNT(*) AS c FROM reservations GROUP BY date ORDER BY date`);
const statsByRoomStmt = db.prepare(`SELECT room, COUNT(*) AS c FROM reservations GROUP BY room ORDER BY room`);
const deleteAllStmt = db.prepare(`DELETE FROM reservations`);

function loadSchedule() {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf8');
  const s = JSON.parse(raw);
  if (!Array.isArray(s.rooms) || s.rooms.length === 0) {
    throw new Error('exam-schedule.json: campo "rooms" em falta ou vazio.');
  }
  return s;
}
function parseHHMM(s) { const [h, m] = s.split(':').map(Number); return { h, m }; }
function firstBookableHour(t) { const { h, m } = parseHHMM(t); return m === 0 ? h : h + 1; }
function lastBookableHour(t) { return parseHHMM(t).h - 1; }

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL bonito para o painel admin (em vez de /admin.html)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/schedule', (req, res) => {
  try {
    const schedule = loadSchedule();
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
    res.set('Cache-Control', 'no-store');
    res.json({ rooms: schedule.rooms, dayEndsAt: schedule.dayEndsAt, days });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao ler calendário de exames.' });
  }
});

app.get('/api/reservations', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(listStmt.all());
});

app.post('/api/reservations', (req, res) => {
  const { teacher_name, room, date, hour, reason } = req.body || {};

  if (typeof teacher_name !== 'string' || teacher_name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome do professor inválido.' });
  }
  if (typeof reason !== 'string' || reason.trim().length < 2) {
    return res.status(400).json({ error: 'Motivo inválido.' });
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Data inválida.' });
  }
  const hourNum = Number(hour);
  if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
    return res.status(400).json({ error: 'Hora inválida.' });
  }

  let schedule;
  try { schedule = loadSchedule(); }
  catch { return res.status(500).json({ error: 'Erro ao ler calendário.' }); }

  const roomNum = Number(room);
  if (!Number.isInteger(roomNum) || !schedule.rooms.includes(roomNum)) {
    return res.status(400).json({ error: 'Sala inválida.' });
  }
  const day = schedule.examDays?.[date];
  if (!day) {
    return res.status(400).json({ error: 'A data escolhida não é um dia de exame.' });
  }
  const startHour = firstBookableHour(day.lastExamEnds);
  const endHour = lastBookableHour(schedule.dayEndsAt);
  if (hourNum < startHour || hourNum > endHour) {
    return res.status(400).json({
      error: `Hora fora do intervalo permitido. Disponível das ${String(startHour).padStart(2, '0')}:00 às ${String(endHour + 1).padStart(2, '0')}:00.`
    });
  }

  const createdAt = new Date().toISOString();
  try {
    const result = insertStmt.run(teacher_name.trim(), roomNum, date, hourNum, reason.trim(), createdAt);
    res.json({ id: Number(result.lastInsertRowid), message: 'Reserva criada com sucesso.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Essa sala já foi reservada para esse horário.' });
    }
    res.status(500).json({ error: 'Erro ao criar reserva.' });
  }
});

// ----- Admin -----

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin não configurado. Defina ADMIN_PASSWORD.' });
  }
  const pw = req.get('x-admin-password') || (req.body && req.body.password) || req.query.password;
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Palavra-passe inválida.' });
  }
  next();
}

// Página HTML do admin: serve estática (sem informação sensível)
// A autenticação só acontece nas APIs.

// ping para validar a password (front-end usa para login)
app.post('/api/admin/login', (req, res, next) => requireAdmin(req, res, () => res.json({ ok: true })));

app.get('/api/admin/reservations', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(listStmt.all());
});

app.delete('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Pedido inválido.' });
  const r = deleteStmt.run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Reserva não encontrada.' });
  res.json({ ok: true });
});

app.delete('/api/admin/reservations', requireAdmin, (req, res) => {
  const r = deleteAllStmt.run();
  res.json({ ok: true, deleted: r.changes });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    total: statsTotalStmt.get().c,
    byDay: statsByDayStmt.all(),
    byRoom: statsByRoomStmt.all()
  });
});

app.listen(PORT, () => {
  console.log(`Reserva de salas a correr em http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.warn('AVISO: ADMIN_PASSWORD não definida. /admin estará desativado.');
  }
});
