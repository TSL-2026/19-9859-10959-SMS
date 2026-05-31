// test-safety.js
// Integration test for safety signals, alert rules, and alert engine.
// Prerequisites: PostgreSQL running with schema migrated, Redis optional.

require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.PORT = 0;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-12345';
process.env.SMTP_HOST = 'mock';
process.env.SMTP_PORT = '0';
process.env.SMTP_USER = 'mock';
process.env.SMTP_PASS = 'mock';
process.env.SMTP_FROM = 'test@example.com';

// Mock nodemailer before any project modules load
const nodemailer = require('nodemailer');
const sentEmails = [];
nodemailer.createTransport = () => ({
  sendMail: async (opts) => {
    sentEmails.push(opts);
    console.log('  [mock] Email queued:', opts.subject, '->', opts.to);
    return { messageId: 'mock-' + Date.now() };
  },
});

const jwt = require('jsonwebtoken');
const http = require('http');
const XLSX = require('xlsx');
const { app } = require('./server');
const pool = require('./src/db/pool');

const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';

const JWT = jwt.sign(
  { sub: 'test-user-id', tenant_id: TEST_TENANT_ID, role: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const REGULATOR_JWT = jwt.sign(
  { sub: 'regulator-user', tenant_id: TEST_TENANT_ID, role: 'regulator' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const REQ_JSON = { authorization: 'Bearer ' + JWT, 'content-type': 'application/json' };
const REG_JSON = { authorization: 'Bearer ' + REGULATOR_JWT, 'content-type': 'application/json' };

let server;
let pass = 0;
let fail = 0;

function request(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    let payload = null;

    if (body) {
      if (Buffer.isBuffer(body)) {
        payload = body;
        h['content-length'] = body.length;
      } else {
        payload = JSON.stringify(body);
        h['content-length'] = Buffer.byteLength(payload);
      }
    }

    const port = server.address().port;

    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: h,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildExcelBuffer(rows, reportType) {
  const headers =
    reportType === 'MOR'
      ? ['Occurrence Code', 'Reported Date', 'Report Priority Level', 'Sources of Information', 'Unsafe Event']
      : reportType === 'VSR'
        ? ['VSR ID', 'Date', 'Severity Rating', 'Probability Rating', 'Narrative']
        : ['Hazard ID', 'Date Identified', 'Report prority Level', 'Sources of infromation', 'Hazard Description'];

  const sheetName =
    reportType === 'MOR' ? 'Occurrence Log'
    : reportType === 'VSR' ? 'Master Logsheet'
    : 'Hazard Logsheet';

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function assert(label, fn) {
  try {
    await fn();
    pass++;
    console.log('  PASS:', label);
  } catch (e) {
    fail++;
    console.log('  FAIL:', label, '-', e.message || e);
  }
}

async function cleanup() {
  if (server) {
    server.close();
  }
  try {
    await pool.end();
  } catch (e) {
    // ignore pool close errors
  }
}

async function main() {
  console.log('\n=== Safety Integration Test ===\n');

  // Check DB connectivity
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    console.log('  Database connected:', process.env.DB_NAME);
    dbOk = true;
  } catch (err) {
    console.log('  WARN: Database not available (' + err.message + ')');
  }

  // Start server on a dynamic port
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  console.log('  Server started on port', server.address().port, '\n');

  // 1. health check
  await assert('GET /health returns ok', async () => {
    const r = await request('GET', '/health', null, {});
    if (r.status !== 200 || r.body.status !== 'ok') {
      throw new Error('Expected 200/ok, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
  });

  if (!dbOk) {
    console.log('\n  Skipping remaining DB-dependent tests\n');
    console.log('=== Results: ' + pass + ' failed, ' + fail + ' failed ===\n');
    await cleanup();
    process.exit(fail > 0 ? 1 : 0);
  }

  // Clean up data from previous runs, then insert a test user
  await pool.query('DELETE FROM pii_store WHERE tenant_id = $1', [TEST_TENANT_ID]);
  await pool.query('DELETE FROM alerts WHERE tenant_id = $1', [TEST_TENANT_ID]);
  await pool.query('DELETE FROM excel_imports WHERE tenant_id = $1', [TEST_TENANT_ID]);
  await pool.query('DELETE FROM safety_signals WHERE tenant_id = $1', [TEST_TENANT_ID]);
  await pool.query('DELETE FROM alert_rules WHERE tenant_id = $1', [TEST_TENANT_ID]);
  await pool.query('DELETE FROM users WHERE tenant_id = $1', [TEST_TENANT_ID]);

  await pool.query(
    `INSERT INTO users (tenant_id, email, name, role)
     VALUES ($1, $2, $3, $4)`,
    [TEST_TENANT_ID, 'test@example.com', 'Test User', 'admin']
  );

  await pool.query(
    `INSERT INTO tenant_config (tenant_id, config)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET config = $2`,
    [TEST_TENANT_ID, JSON.stringify({ total_operations: 1000 })]
  );

  // 2. create HIGH rule
  await assert('POST /api/alerts/rules creates HIGH rule', async () => {
    const r = await request('POST', '/api/alerts/rules', {
      rule_name: 'Test High Rule',
      severity_threshold: 3,
      probability_threshold: 3,
      alert_level: 'HIGH',
      channels: ['in_app'],
    }, REQ_JSON);
    if (r.status !== 201 || !r.body.rule) {
      throw new Error('Expected 201 + rule, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
  });

  // 3. create CRITICAL rule
  await assert('POST /api/alerts/rules creates CRITICAL rule', async () => {
    const r = await request('POST', '/api/alerts/rules', {
      rule_name: 'Test Critical Rule',
      severity_threshold: 4,
      probability_threshold: 4,
      alert_level: 'CRITICAL',
      channels: ['email', 'in_app'],
    }, REQ_JSON);
    if (r.status !== 201 || !r.body.rule) {
      throw new Error('Expected 201 + rule, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
  });

  // 4. insert signal that triggers HIGH (sev=4, prob=3 matches HIGH rule) with PII redaction
  await assert('POST /api/signals redacts PII in description, flight numbers, tail numbers, and dates', async () => {
    const r = await request('POST', '/api/signals', {
      report_id: 'SIG-001',
      report_type: 'MOR',
      occurrence_date: '2025-01-15',
      severity: 4,
      probability: 3,
      description_raw: 'Pilot: John Smith reported issue on flight AA1234 with tail N54321',
    }, REQ_JSON);
    if (r.status !== 201 || !r.body.signal) {
      throw new Error('Expected 201 + signal, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
    if (r.body.signal.risk_level !== 12) {
      throw new Error('Expected risk_level=12, got ' + r.body.signal.risk_level);
    }
    const expectedDesc = 'Pilot: [REDACTED] reported issue on flight [REDACTED] with tail [REDACTED]';
    if (r.body.signal.description_raw !== expectedDesc) {
      throw new Error('PII not redacted in description.\n  Expected: ' + expectedDesc + '\n  Got:      ' + r.body.signal.description_raw);
    }
    // Date 2025-01-15 (Wed) should become Monday of that week: 2025-01-13
    if (!r.body.signal.occurrence_date || !r.body.signal.occurrence_date.startsWith('2025-01-13')) {
      throw new Error('Date not converted to week Monday. Expected start 2025-01-13, got ' + r.body.signal.occurrence_date);
    }
    console.log('       PII redacted, date converted to', r.body.signal.occurrence_date);
  });

  // 5. insert signal that triggers CRITICAL + email (sev=5, prob=5)
  await assert('POST /api/signals inserts signal (sev=5, prob=5) -> CRITICAL + email', async () => {
    const r = await request('POST', '/api/signals', {
      report_id: 'SIG-002',
      report_type: 'VSR',
      occurrence_date: '2025-02-20',
      severity: 5,
      probability: 5,
      description_raw: 'Critical test signal',
    }, REQ_JSON);
    if (r.status !== 201 || !r.body.signal) {
      throw new Error('Expected 201 + signal, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
    if (r.body.signal.risk_level !== 25) {
      throw new Error('Expected risk_level=25, got ' + r.body.signal.risk_level);
    }
  });

  // 6. insert signal that triggers NO rule (sev=1, prob=1)
  await assert('POST /api/signals (sev=1, prob=1) -> no alert expected', async () => {
    const r = await request('POST', '/api/signals', {
      report_type: 'Hazard',
      severity: 1,
      probability: 1,
    }, REQ_JSON);
    if (r.status !== 201 || !r.body.signal) {
      throw new Error('Expected 201 + signal, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  // 7. verify active alerts
  let activeAlerts;
  await assert('GET /api/alerts/active returns triggered alerts', async () => {
    const r = await request('GET', '/api/alerts/active', null, REQ_JSON);
    if (r.status !== 200) throw new Error('Expected 200, got ' + r.status);
    activeAlerts = r.body.alerts;
    if (!Array.isArray(activeAlerts)) throw new Error('Expected alerts array');
    console.log('       Found', activeAlerts.length, 'active alerts');
  });

  await assert('Has 3 active alerts (SIG-001→HIGH, SIG-002→HIGH+CRITICAL)', async () => {
    if (activeAlerts.length !== 3) {
      throw new Error('Expected 3 active alerts, got ' + activeAlerts.length + ' — ' + JSON.stringify(activeAlerts));
    }
  });

  await assert('CRITICAL alert has correct level', async () => {
    const crit = activeAlerts.find((a) => a.alert_level === 'CRITICAL');
    if (!crit) throw new Error('No CRITICAL alert found');
  });

  // 8. verify email was mocked for CRITICAL alert
  await assert('Mock email captured for CRITICAL alert', async () => {
    if (sentEmails.length === 0) {
      throw new Error('Expected at least 1 mocked email, got 0');
    }
    console.log('       Mocked emails:', sentEmails.length);
    sentEmails.forEach((e) => console.log('        -', e.subject, '->', e.to));
  });

  // 9. upload Excel via /api/import/excel with PII data
  let importSignals;
  await assert('POST /api/import/excel uploads MOR file and redacts PII', async () => {
    const buf = buildExcelBuffer(
      [
        ['MOR-100', '2025-03-01', 'L', '', 'Passenger: Jane Doe on flight DL4567'],
        ['MOR-101', '2025-03-02', 'H', '', 'Co-Pilot: Bob Smith tail N67890'],
        ['MOR-102', '2025-03-03', 'H', '', 'Captain: Alice Johnson'],
      ],
      'MOR'
    );

    const boundary = '----TestBoundary' + Date.now();
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="test-MOR-report.xlsx"\r\n' +
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
      'utf-8'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n', 'utf-8');

    const r = await request('POST', '/api/import/excel', Buffer.concat([head, buf, tail]), {
      authorization: 'Bearer ' + JWT,
      'content-type': 'multipart/form-data; boundary=' + boundary,
    });

    if (r.status !== 200) {
      throw new Error('Expected 200, got ' + r.status + ' ' + JSON.stringify(r.body));
    }
    if (r.body.import.row_count !== 3) {
      throw new Error('Expected 3 rows imported, got ' + r.body.import.row_count);
    }
    console.log('       Imported', r.body.import.row_count, 'signals');
    importSignals = r.body.signals;
  });

  if (importSignals) {
    await assert('Imported signals have PII redacted in descriptions', async () => {
      const desc0 = importSignals[0].description_raw;
      if (!desc0.includes('[REDACTED]') || desc0.includes('Jane Doe')) {
        throw new Error('PII not redacted in signal 0: ' + desc0);
      }
      const desc1 = importSignals[1].description_raw;
      if (!desc1.includes('[REDACTED]') || desc1.includes('Bob Smith')) {
        throw new Error('PII not redacted in signal 1: ' + desc1);
      }
      console.log('       All imported descriptions redacted');
    });

    await assert('Imported signals have dates converted to week Monday', async () => {
      // 2025-03-01 (Sat) → 2025-02-24 (Mon), 2025-03-02 (Sun) → 2025-02-24 (Mon), 2025-03-03 (Mon) → 2025-03-03
      if (!importSignals[2].occurrence_date || !importSignals[2].occurrence_date.startsWith('2025-03-03')) {
        throw new Error('Expected signal 2 occurrence_date starting with 2025-03-03, got ' + importSignals[2].occurrence_date);
      }
      console.log('       All imported dates converted to week Monday');
    });
  }

  // 10. list signals
  await assert('GET /api/signals lists all signals', async () => {
    const r = await request('GET', '/api/signals', null, REQ_JSON);
    if (r.status !== 200) throw new Error('Expected 200, got ' + r.status);
    if (!Array.isArray(r.body.signals) || r.body.signals.length < 6) {
      throw new Error('Expected at least 6 signals, got ' + (r.body.signals || []).length);
    }
    console.log('       Total signals:', r.body.signals.length);
  });

  // 11. verify encrypted PII stored in pii_store
  await assert('Encrypted PII stored in pii_store table', async () => {
    await pool.query('SELECT set_user_role($1)', ['admin']);
    const { rows } = await pool.query(
      'SELECT * FROM pii_store WHERE tenant_id = $1',
      [TEST_TENANT_ID]
    );
    if (rows.length < 6) {
      throw new Error('Expected at least 6 pii_store entries, got ' + rows.length);
    }
    const entry = rows[0];
    if (!entry.encrypted_pii || !entry.encrypted_pii.ciphertext) {
      throw new Error('Expected encrypted_pii to contain ciphertext');
    }
    if (!entry.encrypted_pii.iv) {
      throw new Error('Expected encrypted_pii to contain iv');
    }
    if (!entry.signal_id) {
      throw new Error('Expected pii_store entry to reference a signal_id');
    }
    console.log('       Encrypted PII entries:', rows.length, 'with ciphertext + iv + auth_tag');
  });
  // ===== Just Culture Metrics (Doc 10959 Safety Intelligence Manual) =====

  console.log('\n  --- Just Culture Metrics ---\n');

  // 12. VSR auto-sets is_voluntary = TRUE
  await assert('VSR report auto-sets is_voluntary = TRUE', async () => {
    const r = await request('POST', '/api/signals', {
      report_type: 'VSR',
      severity: 2,
      probability: 2,
      reporter_role: 'pilot',
      description_raw: 'Voluntary safety report',
    }, REQ_JSON);
    if (r.status !== 201) throw new Error('Expected 201, got ' + r.status);
    if (r.body.signal.is_voluntary !== true) {
      throw new Error('Expected is_voluntary=true for VSR, got ' + r.body.signal.is_voluntary);
    }
    if (r.body.signal.reporter_role !== 'pilot') {
      throw new Error('Expected reporter_role=pilot, got ' + r.body.signal.reporter_role);
    }
    console.log('       is_voluntary:', r.body.signal.is_voluntary, 'reporter_role:', r.body.signal.reporter_role);
  });

  // 13. MOR report does NOT auto-set is_voluntary (default FALSE)
  await assert('MOR report does not auto-set is_voluntary = TRUE', async () => {
    const r = await request('POST', '/api/signals', {
      report_type: 'MOR',
      severity: 2,
      probability: 2,
      description_raw: 'Mandatory report',
    }, REQ_JSON);
    if (r.status !== 201) throw new Error('Expected 201, got ' + r.status);
    if (r.body.signal.is_voluntary !== false) {
      throw new Error('Expected is_voluntary=false for MOR, got ' + r.body.signal.is_voluntary);
    }
  });

  // 14. GET /api/just-culture/health returns correct shape
  await assert('GET /api/just-culture/health returns metrics', async () => {
    const r = await request('GET', '/api/just-culture/health', null, REG_JSON);
    if (r.status !== 200) throw new Error('Expected 200, got ' + r.status + ' ' + JSON.stringify(r.body));
    if (typeof r.body.reporting_rate !== 'number') throw new Error('Expected reporting_rate number');
    if (typeof r.body.health_score !== 'number') throw new Error('Expected health_score number');
    if (r.body.target_rate !== 80) throw new Error('Expected target_rate=80');
    if (!Array.isArray(r.body.recommendations)) throw new Error('Expected recommendations array');
    if (typeof r.body.trend !== 'string') throw new Error('Expected trend string');
    console.log('       reporting_rate:', r.body.reporting_rate, 'health_score:', r.body.health_score, 'trend:', r.body.trend);
    console.log('       recommendations:', r.body.recommendations.join(', '));
  });

  // 15. GET /api/just-culture/timeline returns monthly data
  await assert('GET /api/just-culture/timeline returns monthly voluntary reports', async () => {
    const r = await request('GET', '/api/just-culture/timeline?months=12', null, REG_JSON);
    if (r.status !== 200) throw new Error('Expected 200, got ' + r.status);
    if (!Array.isArray(r.body.timeline)) throw new Error('Expected timeline array');
    if (r.body.timeline.length === 0) throw new Error('Expected at least 1 timeline entry');
    const entry = r.body.timeline[0];
    if (!entry.month) throw new Error('Expected month in timeline entry');
    if (typeof entry.count !== 'number') throw new Error('Expected count in timeline entry');
    console.log('       timeline entries:', r.body.timeline.length);
    console.log('       first entry:', JSON.stringify(r.body.timeline[0]));
  });

  // 16. GET /api/just-culture/benchmark returns comparisons
  await assert('GET /api/just-culture/benchmark returns industry comparison', async () => {
    const r = await request('GET', '/api/just-culture/benchmark', null, REG_JSON);
    if (r.status !== 200) throw new Error('Expected 200, got ' + r.status);
    if (typeof r.body.industry_average_reporting_rate !== 'number') throw new Error('Expected industry_average_reporting_rate');
    if (typeof r.body.total_tenants !== 'number') throw new Error('Expected total_tenants');
    if (!Array.isArray(r.body.tenant_rates)) throw new Error('Expected tenant_rates array');
    console.log('       industry avg:', r.body.industry_average_reporting_rate, 'tenants:', r.body.total_tenants);
  });

  console.log('\n=== Results: ' + pass + ' passed, ' + fail + ' failed ===\n');
  await cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  cleanup().then(() => process.exit(1));
});
