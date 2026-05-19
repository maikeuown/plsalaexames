const { sql } = require('@vercel/postgres');
const { rawSchedule, firstBookableHour, lastBookableHour } = require('./_lib');

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      teacher_name TEXT NOT NULL,
      room INTEGER NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (room, date, hour)
    )
  `;
}

module.exports = async (req, res) => {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, teacher_name, room, date, hour, reason, created_at
        FROM reservations
        ORDER BY date ASC, hour ASC, room ASC
      `;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
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
      const roomNum = Number(room);
      if (!Number.isInteger(roomNum) || !rawSchedule.rooms.includes(roomNum)) {
        return res.status(400).json({ error: 'Sala inválida.' });
      }
      const day = rawSchedule.examDays?.[date];
      if (!day) {
        return res.status(400).json({ error: 'A data escolhida não é um dia de exame.' });
      }
      const startHour = firstBookableHour(day.lastExamEnds);
      const endHour = lastBookableHour(rawSchedule.dayEndsAt);
      if (hourNum < startHour || hourNum > endHour) {
        return res.status(400).json({
          error: `Hora fora do intervalo permitido. Disponível das ${String(startHour).padStart(2, '0')}:00 às ${String(endHour + 1).padStart(2, '0')}:00.`
        });
      }

      try {
        const { rows } = await sql`
          INSERT INTO reservations (teacher_name, room, date, hour, reason)
          VALUES (${teacher_name.trim()}, ${roomNum}, ${date}, ${hourNum}, ${reason.trim()})
          RETURNING id
        `;
        return res.status(200).json({ id: rows[0].id, message: 'Reserva criada com sucesso.' });
      } catch (e) {
        if (e.code === '23505') {
          return res.status(409).json({ error: 'Essa sala já foi reservada para esse horário.' });
        }
        throw e;
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro de servidor.' });
  }
};
