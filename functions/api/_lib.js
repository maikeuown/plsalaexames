import schedule from '../../exam-schedule.json';

function parseHHMM(s) {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}

export function firstBookableHour(lastExamEnds) {
  const { h, m } = parseHHMM(lastExamEnds);
  return m === 0 ? h : h + 1;
}

export function lastBookableHour(dayEndsAt) {
  return parseHHMM(dayEndsAt).h - 1;
}

export function buildSchedule() {
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

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export const rawSchedule = schedule;
