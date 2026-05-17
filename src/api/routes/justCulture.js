const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { regulatorAuth } = require('../../middleware/regulatorAuth');
const pool = require('../../db/pool');

const router = Router();

router.get('/health', authenticate, regulatorAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT just_culture_health() AS result');
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

router.get('/timeline', authenticate, regulatorAuth, async (req, res, next) => {
  try {
    const months = parseInt(req.query.months, 10) || 12;
    const { rows } = await pool.query('SELECT just_culture_timeline($1) AS result', [months]);
    res.json({ timeline: rows[0].result });
  } catch (err) {
    next(err);
  }
});

router.get('/benchmark', authenticate, regulatorAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT just_culture_benchmark() AS result');
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
