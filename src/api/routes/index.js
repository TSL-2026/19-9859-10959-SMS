const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');

const router = Router();

router.get('/me', authenticate, async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const result = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.sub]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0], tenant_id: req.tenant_id });
  } catch (err) {
    next(err);
  }
});

router.get('/documents', authenticate, async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const result = await pool.query('SELECT id, title, created_at FROM documents ORDER BY created_at DESC');
    res.json({ documents: result.rows });
  } catch (err) {
    next(err);
  }
});

const safetyRoutes = require('./safety');
router.use(safetyRoutes);

module.exports = router;
