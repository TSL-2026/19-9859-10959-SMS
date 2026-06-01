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

async function storeSignal(signalData, tenantId, userRole) {
  const { redactedSignal, encryptedData } = piiAnonymizer.extractAndRedact(signalData);

  const isVoluntary = signalData.is_voluntary !== undefined
    ? signalData.is_voluntary
    : redactedSignal.report_type === 'VSR';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sev = redactedSignal.severity || 1;
    const prob = redactedSignal.probability || 1;
    const risk = redactedSignal.risk_level || sev * prob;

    const result = await client.query(
      `INSERT INTO safety_signals
         (tenant_id, report_id, report_type, occurrence_date, severity, probability,
          risk_level, description_raw, status, is_voluntary, reporter_role,
          source, assigned_department)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantId,
        redactedSignal.report_id || signalData.external_id || '',
        redactedSignal.report_type,
        redactedSignal.occurrence_date,
        sev,
        prob,
        risk,
        redactedSignal.description_raw,
        signalData.status || 'Reported',
        isVoluntary,
        signalData.reporter_role || null,
        signalData.source || null,
        signalData.assigned_department || null,
      ]
    );

    if (encryptedData) {
      await client.query('SELECT set_user_role($1)', [userRole || 'member']);
      await client.query(
        `INSERT INTO pii_store (tenant_id, signal_id, encrypted_pii)
         VALUES ($1, $2, $3)`,
        [tenantId, result.rows[0].id, JSON.stringify(encryptedData)]
      );
    }

    await client.query(
      `UPDATE safety_signals ss
       SET
         occurrence_category_id = (t.tax->>'occurrence_category_id')::UUID,
         event_type_id          = (t.tax->>'event_type_id')::UUID,
         hazard_category_id     = (t.tax->>'hazard_category_id')::UUID
       FROM (
         SELECT classify_signal_taxonomy($1, $2, $3) AS tax
       ) t
       WHERE ss.id = $4`,
      [redactedSignal.description_raw, redactedSignal.report_type, signalData.source || null, result.rows[0].id]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required for import.' });
  }
  next();
}

router.post('/import/excel', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.tenant_id;

    const reportTypeOverride = req.body.report_type || null;

    const { parseExcelFile } = require('../../services/excelParser');
    const result = await parseExcelFile(req.file.buffer, tenantId, req.file.originalname);

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
      import: { row_count: insertedSignals.length },
      signals: insertedSignals,
      by_type: result.by_type,
      year: result.year,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/import/batch', authenticate, requireAdmin, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const tenantId = req.tenant_id;

    const { parseMultipleExcelFiles } = require('../../services/excelParser');
    const result = await parseMultipleExcelFiles(req.files, tenantId);

    const allInserted = [];
    for (const fileResult of result.files) {
      for (const signal of fileResult.signals) {
        const inserted = await storeSignal(signal, tenantId, req.user.role);
        allInserted.push(inserted);
        alertEngine.evaluateSignal(inserted, tenantId).catch((err) => {
          logger.error('Alert engine error during batch import', {
            error: err.message, signalId: inserted.id,
          });
        });
      }
    }

    res.json({
      success: true,
      files_processed: result.files.length,
      total_signals_imported: result.total_signals_imported,
      by_year: result.by_year,
      by_type: result.by_type,
      details: result.files.map(f => ({
        filename: f.filename,
        year: f.year,
        total_signals_imported: f.total_signals_imported,
        by_type: f.by_type,
        errors: f.errors,
      })),
      errors: result.errors,
    });
  } catch (error) {
    console.error('Batch import error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/signals', authenticate, async (req, res, next) => {
  try {
    const { report_id, report_type, occurrence_date, severity, probability, description_raw, reporter_role, is_voluntary, source } = req.body;

    if (!report_type || !severity) {
      return res.status(400).json({ error: 'Missing required field(s): report_type, severity' });
    }

    if (!['MOR', 'VSR', 'Hazard', 'HAZARD', 'SAFETY_DEFICIENCY', 'DIVERSION'].includes(report_type)) {
      return res.status(400).json({ error: 'report_type must be MOR, VSR, Hazard, SAFETY_DEFICIENCY, or DIVERSION' });
    }

    const sev = Number(severity);
    const prob = probability !== undefined ? Number(probability) : 1;
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
      source: source || null,
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
    const { rows } = await pool.query(
      `SELECT ss.*,
              oc.code AS occurrence_category_code, oc.name AS occurrence_category_name,
              et.code AS event_type_code, et.name AS event_type_name,
              hc.code AS hazard_category_code, hc.name AS hazard_category_name
       FROM safety_signals ss
       LEFT JOIN occurrence_categories oc ON oc.id = ss.occurrence_category_id
       LEFT JOIN event_types et ON et.id = ss.event_type_id
       LEFT JOIN hazard_categories hc ON hc.id = ss.hazard_category_id
       WHERE ss.tenant_id = $1
       ORDER BY ss.created_at DESC`,
      [req.tenant_id]
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
    const { rows } = await pool.query(
      `SELECT a.*, s.report_id, s.report_type, s.severity, s.probability, s.risk_level, s.description_raw, r.rule_name
       FROM alerts a
       JOIN safety_signals s ON s.id = a.signal_id
       JOIN alert_rules r ON r.id = a.rule_id
       WHERE a.tenant_id = $1 AND a.acknowledged_at IS NULL
       ORDER BY a.triggered_at DESC`,
      [req.tenant_id]
    );
    res.json({ alerts: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
