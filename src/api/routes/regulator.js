const { Router } = require('express');
const { regulatorAuth } = require('../../middleware/regulatorAuth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');

const router = Router();

// All regulator endpoints require regulator role
router.use(regulatorAuth);

// SPI summary across all tenants (aggregated counts only)
router.get('/spi', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT regulator_spi_summary($1, $2, $3, $4)',
      [req.query.occurrence_category_id || null, req.query.hazard_category_id || null, req.query.event_type_id || null, req.query.region || null]
    );
    res.json(rows[0].regulator_spi_summary);
  } catch (err) {
    logger.error('Regulator SPI summary error', { error: err.message });
    next(err);
  }
});

// Monthly trend data
router.get('/trends', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 60);
    const { rows } = await pool.query(
      'SELECT regulator_spi_trends($1, $2, $3, $4, $5)',
      [months, req.query.occurrence_category_id || null, req.query.hazard_category_id || null, req.query.event_type_id || null, req.query.region || null]
    );
    res.json(rows[0].regulator_spi_trends);
  } catch (err) {
    logger.error('Regulator trends error', { error: err.message });
    next(err);
  }
});

// Full aggregated export data (for PDF generation)
router.get('/export', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT regulator_export_data()');
    res.json(rows[0].regulator_export_data);
  } catch (err) {
    logger.error('Regulator export error', { error: err.message });
    next(err);
  }
});

// Industry Top Risks — get all (including inactive)
router.get('/top-risks', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT get_all_top_risks() AS result');
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Top risks get error', { error: err.message });
    next(err);
  }
});

// Industry Top Risks — upsert (create or update)
router.post('/top-risks', async (req, res, next) => {
  try {
    const { id, risk_name, risk_category, severity_ranking, description } = req.body;
    if (!risk_name || !risk_category || !severity_ranking) {
      return res.status(400).json({ error: 'Missing required fields: risk_name, risk_category, severity_ranking' });
    }
    const { rows } = await pool.query(
      'SELECT upsert_top_risk($1, $2, $3, $4, $5, $6) AS result',
      [id || null, risk_name, risk_category, severity_ranking, description || null, req.user.sub]
    );
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Top risks upsert error', { error: err.message });
    next(err);
  }
});

// Industry Top Risks — deactivate
router.delete('/top-risks/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT deactivate_top_risk($1) AS result', [req.params.id]);
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Top risks delete error', { error: err.message });
    next(err);
  }
});

// Taxonomy aggregation
router.get('/signals-by-category', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT regulator_signals_by_occurrence_category($1, $2, $3, $4)',
      [req.query.occurrence_category_id || null, req.query.hazard_category_id || null, req.query.event_type_id || null, req.query.region || null]
    );
    res.json(rows[0].regulator_signals_by_occurrence_category);
  } catch (err) {
    next(err);
  }
});

router.get('/signals-by-hazard', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT regulator_signals_by_hazard_category($1, $2, $3, $4)',
      [req.query.occurrence_category_id || null, req.query.hazard_category_id || null, req.query.event_type_id || null, req.query.region || null]
    );
    res.json(rows[0].regulator_signals_by_hazard_category);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
