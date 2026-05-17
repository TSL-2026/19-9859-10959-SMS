const { Router } = require('express');
const { regulatorAuth } = require('../../middleware/regulatorAuth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');

const router = Router();

// All regulator endpoints require regulator role
router.use(regulatorAuth);

// SPI summary across all tenants (aggregated counts only)
router.get('/spis', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT regulator_spi_summary()');
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
    const { rows } = await pool.query('SELECT regulator_spi_trends($1)', [months]);
    res.json(rows[0].regulator_spi_trends);
  } catch (err) {
    logger.error('Regulator trends error', { error: err.message });
    next(err);
  }
});

// Per-tenant aggregated data grouped by tenant_type (counts only, no raw data)
router.get('/tenants', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT regulator_spi_by_tenant_type()');
    res.json(rows[0].regulator_spi_by_tenant_type);
  } catch (err) {
    logger.error('Regulator by-tenant error', { error: err.message });
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

module.exports = router;
