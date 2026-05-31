const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');

const router = Router();

// All workflow endpoints require authentication
router.use(authenticate);

// Set tenant context for RLS
router.use(async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Status transition ──────────────────────────────────────────

router.patch('/signals/:id/status', async (req, res, next) => {
  try {
    const { status, note } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    const valid = ['draft', 'Reported', 'Under Investigation', 'Resolved', 'Closed', 'Dismissed'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    const { rows } = await pool.query(
      'SELECT transition_signal_status($1, $2, $3, $4, $5) AS result',
      [req.params.id, status, note || null, req.user.sub, req.user.name || null]
    );
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Status transition error', { error: err.message, signalId: req.params.id });
    next(err);
  }
});

// ─── Assign for investigation ───────────────────────────────────

router.patch('/signals/:id/assign', async (req, res, next) => {
  try {
    const { assigned_to_id, assigned_to_name, assigned_department } = req.body;
    if (!assigned_to_name && !assigned_department) {
      return res.status(400).json({ error: 'Either assigned_to_name or assigned_department is required' });
    }

    const { rows } = await pool.query(
      'SELECT assign_signal_for_investigation($1, $2, $3, $4, $5, $6) AS result',
      [req.params.id, assigned_to_id || null, assigned_to_name || null, assigned_department || null, req.user.sub, req.user.name || null]
    );
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Signal assign error', { error: err.message, signalId: req.params.id });
    next(err);
  }
});

// ─── Resolve with findings ──────────────────────────────────────

router.patch('/signals/:id/resolve', async (req, res, next) => {
  try {
    const { investigation_notes, corrective_actions, residual_risk_level, defenses_in_depth } = req.body;

    const { rows } = await pool.query(
      'SELECT resolve_signal($1, $2, $3, $4, $5, $6, $7) AS result',
      [req.params.id, investigation_notes || null, corrective_actions || null, residual_risk_level || null, defenses_in_depth ? JSON.stringify(defenses_in_depth) : null, req.user.sub, req.user.name || null]
    );
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Signal resolve error', { error: err.message, signalId: req.params.id });
    next(err);
  }
});

// ─── Close signal ───────────────────────────────────────────────

router.patch('/signals/:id/close', async (req, res, next) => {
  try {
    const { note } = req.body;

    const { rows } = await pool.query(
      'SELECT close_signal($1, $2, $3, $4) AS result',
      [req.params.id, note || null, req.user.sub, req.user.name || null]
    );
    res.json(rows[0].result);
  } catch (err) {
    logger.error('Signal close error', { error: err.message, signalId: req.params.id });
    next(err);
  }
});

// ─── Workflow history for a signal ──────────────────────────────

router.get('/signals/:id/workflow', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT we.*, ss.tenant_id
       FROM signal_workflow_events we
       JOIN safety_signals ss ON ss.id = we.signal_id
       WHERE we.signal_id = $1 AND ss.tenant_id = $2
       ORDER BY we.created_at DESC`,
      [req.params.id, req.tenant_id]
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Escalation rules CRUD ──────────────────────────────────────

router.get('/escalation-rules', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM escalation_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenant_id]
    );
    res.json({ rules: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/escalation-rules', async (req, res, next) => {
  try {
    const { rule_name, trigger_status, time_threshold_hours, escalate_to_role, escalate_to_department, alert_level, is_active } = req.body;

    if (!rule_name || !trigger_status || !time_threshold_hours) {
      return res.status(400).json({ error: 'Missing required fields: rule_name, trigger_status, time_threshold_hours' });
    }

    const { rows } = await pool.query(
      `INSERT INTO escalation_rules (tenant_id, rule_name, trigger_status, time_threshold_hours, escalate_to_role, escalate_to_department, alert_level, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.tenant_id, rule_name, trigger_status, time_threshold_hours, escalate_to_role || null, escalate_to_department || null, alert_level || 'MEDIUM', is_active !== false]
    );
    res.status(201).json({ rule: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/escalation-rules/:id', async (req, res, next) => {
  try {
    const { rule_name, trigger_status, time_threshold_hours, escalate_to_role, escalate_to_department, alert_level, is_active } = req.body;

    const { rows } = await pool.query(
      `UPDATE escalation_rules
       SET rule_name = COALESCE($1, rule_name),
           trigger_status = COALESCE($2, trigger_status),
           time_threshold_hours = COALESCE($3, time_threshold_hours),
           escalate_to_role = COALESCE($4, escalate_to_role),
           escalate_to_department = COALESCE($5, escalate_to_department),
           alert_level = COALESCE($6, alert_level),
           is_active = COALESCE($7, is_active)
       WHERE id = $8 AND tenant_id = $9
       RETURNING *`,
      [rule_name, trigger_status, time_threshold_hours, escalate_to_role, escalate_to_department, alert_level, is_active, req.params.id, req.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ rule: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/escalation-rules/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM escalation_rules WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ deleted: rows[0].id });
  } catch (err) {
    next(err);
  }
});

// ─── Check/trigger escalations ──────────────────────────────────

router.post('/escalations/check', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT check_escalations($1) AS result', [req.tenant_id]);
    res.json(rows[0].result);
  } catch (err) {
    next(err);
  }
});

// ─── Workflow notices ───────────────────────────────────────────

router.get('/notices', async (req, res, next) => {
  try {
    const includeAcknowledged = req.query.all === 'true';
    let query = 'SELECT wn.*, ss.report_id, ss.report_type FROM workflow_notices wn JOIN safety_signals ss ON ss.id = wn.signal_id WHERE wn.tenant_id = $1';
    if (!includeAcknowledged) query += ' AND wn.acknowledged_at IS NULL';
    query += ' ORDER BY wn.created_at DESC';

    const { rows } = await pool.query(query, [req.tenant_id]);
    res.json({ notices: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/notices/:id/acknowledge', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE workflow_notices
       SET acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND tenant_id = $3 AND acknowledged_at IS NULL
       RETURNING *`,
      [req.user.sub, req.params.id, req.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Notice not found or already acknowledged' });
    res.json({ notice: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
