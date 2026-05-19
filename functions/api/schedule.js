import { buildSchedule, jsonResponse } from './_lib.js';

export async function onRequestGet() {
  try {
    return jsonResponse(200, buildSchedule());
  } catch (e) {
    return jsonResponse(500, { error: 'Erro ao ler calendário de exames.' });
  }
}

export async function onRequest() {
  return jsonResponse(405, { error: 'Method not allowed' });
}
