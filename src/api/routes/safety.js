const { Router } = require('express');
const multer = require('multer');
const { regulatorAuth } = require('../../middleware/regulatorAuth');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../db/pool');
const logger = require('../../services/logger');
const alertEngine = require('../../services/alertEngine');
const piiAnonymizer = require('../../services/piiAnonymizer');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function storeSignal(signal, tenantId, userRole) {
  const { redactedSignal, encryptedData } = piiAnonymizer.extractAndRedact(signal);

  const isVoluntary = signal.is_voluntary !== undefined ? signal.is_voluntary : redactedSignal.report_type === 'VSR';
  const reporterRole = signal.reporter_role || null;

  const { rows } = await pool.query(
    `INSERT INTO safety_signals
       (tenant_id, report_id, report_type, occurrence_date, severity, probability, risk_level, description_raw, is_voluntary, reporter_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId,
      redactedSignal.report_id,
      redactedSignal.report_type,
      redactedSignal.occurrence_date,
      redactedSignal.severity,
      redactedSignal.probability,
      redactedSignal.risk_level,
      redactedSignal.description_raw,
      isVoluntary,
      reporterRole,
    ]
  );

  const insertedSignal = rows[0];

  if (encryptedData) {
    await pool.query('SELECT set_user_role($1)', [userRole || 'member']);
    await pool.query(
      `INSERT INTO pii_store (tenant_id, signal_id, encrypted_pii)
       VALUES ($1, $2, $3)`,
      [tenantId, insertedSignal.id, JSON.stringify(encryptedData)]
    );
  }

  return insertedSignal;
}

router.post('/import/excel', regulatorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.body.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required in request body' });
    }

    const reportTypeOverride = req.body.report_type || null;

    const { parseExcelFile } = require('../../services/excelParser');
    const result = await parseExcelFile(req.file.buffer, tenantId);

    const insertedSignals = [];
    for (const signal of result.signals) {
      if (reportTypeOverride && signal.report_type === 'VSR') {
        signal.report_type = reportTypeOverride;
      }
      signal.is_voluntary = signal.report_type === 'VSR';
      const inserted = await storeSignal(signal, tenantId, req.user.role);
      insertedSignals.push(inserted);

      alertEngine.evaluateSignal(inserted, tenantId).catch((err) => {
        logger.error('Alert engine error during import', { error: err.message, signalId: inserted.id });
      });
    }

    res.json({
      success: true,
      sheets_processed: result.sheets_processed,
      total_signals_imported: result.total_signals_imported,
      by_type: result.by_type,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/signals', authenticate, async (req, res, next) => {
  try {
    const { report_id, report_type, occurrence_date, severity, probability, description_raw, reporter_role, is_voluntary } = req.body;

    if (!report_type || !severity || !probability) {
      return res.status(400).json({ error: 'Missing required fields: report_type, severity, probability' });
    }

    if (!['MOR', 'VSR', 'Hazard'].includes(report_type)) {
      return res.status(400).json({ error: 'report_type must be MOR, VSR, or Hazard' });
    }

    const sev = Number(severity);
    const prob = Number(probability);
    if (sev < 1 || sev > 5 || prob < 1 || prob > 5) {
      return res.status(400).json({ error: 'severity and probability must be integers between 1 and 5' });
    }

    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);

    const signal = await storeSignal({
      report_id: report_id || '',
      report_type,
      occurrence_date: occurrence_date || null,
      severity: sev,
      probability: prob,
      risk_level: sev * prob,
      description_raw: description_raw || '',
      reporter_role: reporter_role || null,
      is_voluntary: is_voluntary !== undefined ? is_voluntary : report_type === 'VSR',
    }, req.tenant_id, req.user.role);

    alertEngine.evaluateSignal(signal, req.tenant_id).catch((err) => {
      logger.error('Alert engine error', { error: err.message, signalId: signal.id });
    });

    res.status(201).json({ signal });
  } catch (err) {
    next(err);
  }
});

router.get('/signals', authenticate, async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const { rows } = await pool.query(
      'SELECT * FROM safety_signals ORDER BY created_at DESC'
    );
    res.json({ signals: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/alerts/rules', authenticate, async (req, res, next) => {
  try {
    const { rule_name, severity_threshold, probability_threshold, alert_level, channels, is_active } = req.body;

    if (!rule_name || !severity_threshold || !probability_threshold || !alert_level) {
      return res.status(400).json({ error: 'Missing required fields: rule_name, severity_threshold, probability_threshold, alert_level' });
    }

    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const { rows } = await pool.query(
      `INSERT INTO alert_rules (tenant_id, rule_name, severity_threshold, probability_threshold, alert_level, channels, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.tenant_id,
        rule_name,
        severity_threshold,
        probability_threshold,
        alert_level,
        JSON.stringify(channels || ['in_app']),
        is_active !== false,
      ]
    );

    res.status(201).json({ rule: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/alerts/active', authenticate, async (req, res, next) => {
  try {
    await pool.query('SELECT set_tenant_context($1)', [req.tenant_id]);
    const { rows } = await pool.query(
      `SELECT a.*, s.report_id, s.report_type, s.severity, s.probability, s.risk_level, s.description_raw, r.rule_name
       FROM alerts a
       JOIN safety_signals s ON s.id = a.signal_id
       JOIN alert_rules r ON r.id = a.rule_id
       WHERE a.acknowledged_at IS NULL
       ORDER BY a.triggered_at DESC`
    );
    res.json({ alerts: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
