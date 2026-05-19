const { buildSchedule } = require('./_lib');

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(buildSchedule());
  } catch (e) {
    res.status(500).json({ error: 'Erro ao ler calendário de exames.' });
  }
};
