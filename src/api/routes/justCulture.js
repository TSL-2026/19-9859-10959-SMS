const { Router } = require('express');
const { regulatorAuth } = require('../../middleware/regulatorAuth');
const pool = require('../../db/pool');

const router = Router();

router.use(regulatorAuth);

router.get('/health', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT just_culture_health() AS result');
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

router.get('/timeline', async (req, res, next) => {
  try {
    const months = parseInt(req.query.months, 10) || 12;
    const { rows } = await pool.query('SELECT just_culture_timeline($1) AS result', [months]);
    const timeline = (rows[0].result || []).map(function(entry) {
      return Object.assign({}, entry, { count: entry.voluntary_count });
    });
    res.json({ timeline: timeline });
  } catch (err) {
    next(err);
  }
});

router.get('/benchmark', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT just_culture_benchmark() AS result');
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
