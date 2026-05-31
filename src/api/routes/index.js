const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');

const router = Router();

router.get('/me', authenticate, async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const userResult = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.sub]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const configResult = await pool.query('SELECT tenant_name FROM tenant_config WHERE tenant_id = $1', [req.tenant_id]);
    const tenant_name = configResult.rows.length > 0 ? configResult.rows[0].tenant_name : null;
    res.json({ user: userResult.rows[0], tenant_id: req.tenant_id, tenant_name });
  } catch (err) {
    next(err);
  }
});

router.get('/documents', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, title, created_at FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenant_id]
    );
    res.json({ documents: result.rows });
  } catch (err) {
    next(err);
  }
});

// Public endpoint: industry top risks (for operators, no auth required)
router.get('/industry/top-risks', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT get_industry_top_risks() AS result');
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

// ─── Taxonomy Lookup Endpoints ───────────────────────────────────

router.get('/taxonomy/categories', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, code, name, description, icon FROM occurrence_categories ORDER BY code'
    );
    res.json({ categories: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/taxonomy/event-types', authenticate, async (req, res, next) => {
  try {
    const catId = req.query.category_id || null;
    let query = `SELECT et.id, et.code, et.name, et.description, oc.code AS category_code, oc.name AS category_name
                 FROM event_types et
                 JOIN occurrence_categories oc ON oc.id = et.category_id`;
    const params = [];
    if (catId) {
      query += ' WHERE et.category_id = $1';
      params.push(catId);
    }
    query += ' ORDER BY oc.code, et.code';
    const { rows } = await pool.query(query, params);
    res.json({ event_types: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/taxonomy/hazard-categories', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, code, name, description FROM hazard_categories ORDER BY code'
    );
    res.json({ hazard_categories: rows });
  } catch (err) {
    next(err);
  }
});

const safetyRoutes = require('./safety');
router.use(safetyRoutes);

module.exports = router;
