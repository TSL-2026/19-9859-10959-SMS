const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query(
      'SELECT code, name FROM occurrence_categories ORDER BY code'
    );
    const { rows: users } = await pool.query(`
      SELECT u.id AS user_id, u.tenant_id, u.email, u.role,
             COALESCE(tc.tenant_name, 'CAA Regulator') AS tenant_name
      FROM users u
      LEFT JOIN tenant_config tc ON tc.tenant_id = u.tenant_id
      WHERE u.role = 'admin'
      ORDER BY tc.tenant_name
    `);

    const operators = users.map(u => {
      const token = jwt.sign(
        { sub: u.user_id, tenant_id: u.tenant_id, role: u.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      return { id: u.tenant_id, name: u.tenant_name, email: u.email, token };
    });

    const catOpts = categories.map(c =>
      `<option value="${c.code}">${c.code} — ${c.name}</option>`
    ).join('');

    const opOpts = operators.map(o =>
      `<option value="${o.token}" data-tenant="${o.id}">${o.name} (${o.email})</option>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quick Report — Safety Monitoring System</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #f1f5f9;
    color: #1e293b;
    line-height: 1.6;
    min-height: 100vh;
  }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }

  .header {
    background: linear-gradient(135deg, #0b1a2e 0%, #1a3a5c 100%);
    padding: 40px 0 32px;
    text-align: center;
  }
  .header h1 {
    color: #fff;
    font-size: 26px;
    font-weight: 700;
  }
  .header p {
    color: #94a9c0;
    font-size: 14px;
    margin-top: 6px;
  }

  .card {
    background: #fff;
    border-radius: 16px;
    padding: 32px;
    margin-top: -16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .form-group { margin-bottom: 20px; }
  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .form-group label .hint {
    font-weight: 400;
    text-transform: none;
    color: #94a3b8;
    font-size: 12px;
  }
  .form-group select,
  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 12px 14px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    font-size: 15px;
    font-family: inherit;
    background: #fff;
    color: #1e293b;
    outline: none;
    transition: border-color 0.2s;
  }
  .form-group select:focus,
  .form-group input:focus,
  .form-group textarea:focus {
    border-color: #2c7da0;
  }
  .form-group textarea { resize: vertical; min-height: 120px; }
  .form-group select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 44px;
  }

  .row { display: flex; gap: 16px; }
  .row .form-group { flex: 1; }

  .severity-slider {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .severity-slider input[type="range"] {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
    border-radius: 3px;
    outline: none;
    padding: 0;
    border: none;
  }
  .severity-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #2c7da0;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  }
  .severity-label {
    font-size: 28px;
    font-weight: 700;
    min-width: 36px;
    text-align: center;
  }
  .severity-tag {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .submit-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 8px;
  }
  .btn-primary {
    flex: 1;
    padding: 14px 24px;
    background: #1a3a5c;
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.2s, transform 0.1s;
  }
  .btn-primary:hover { background: #2c5a7c; transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
    transform: none;
  }

  .status-box {
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 14px;
    display: none;
    margin-bottom: 20px;
  }
  .status-box.success {
    display: block;
    background: #dcfce7;
    border: 1px solid #86efac;
    color: #166534;
  }
  .status-box.error {
    display: block;
    background: #fee2e2;
    border: 1px solid #fca5a5;
    color: #991b1b;
  }
  .status-box.loading {
    display: block;
    background: #e0f2fe;
    border: 1px solid #7dd3fc;
    color: #0c4a6e;
  }

  .back-link {
    display: inline-block;
    margin-top: 16px;
    color: #64748b;
    font-size: 14px;
    text-decoration: none;
  }
  .back-link:hover { color: #2c7da0; }

  @media (max-width: 480px) {
    .row { flex-direction: column; gap: 0; }
    .card { padding: 20px; }
    .header h1 { font-size: 22px; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="container">
    <h1>&#9888; Quick Safety Report</h1>
    <p>Submit a Mandatory Occurrence Report (MOR), Voluntary Safety Report (VSR), or Hazard in under 60 seconds</p>
  </div>
</div>

<div class="container">
  <div class="card">
    <div id="statusBox" class="status-box"></div>

    <div class="form-group">
      <label>Reporting on behalf of</label>
      <select id="operatorSelect">
        <option value="">— Select operator —</option>
        ${opOpts}
      </select>
    </div>

    <div class="row">
      <div class="form-group">
        <label>Report Type</label>
        <select id="reportType">
          <option value="MOR">MOR — Mandatory Occurrence Report</option>
          <option value="VSR">VSR — Voluntary Safety Report</option>
          <option value="Hazard">Hazard</option>
        </select>
      </div>
      <div class="form-group">
        <label>Occurrence Date</label>
        <input type="date" id="occurrenceDate">
      </div>
    </div>

    <div class="form-group">
      <label>Occurrence Category</label>
      <select id="category">
        <option value="">— Auto-classify —</option>
        ${catOpts}
      </select>
    </div>

    <div class="form-group">
      <label>Severity <span class="hint">(1 = Minor, 5 = Catastrophic)</span></label>
      <div class="severity-slider">
        <input type="range" id="severity" min="1" max="5" value="2" step="1">
        <span class="severity-label" id="severityDisplay">2</span>
      </div>
    </div>

    <div class="form-group">
      <label>Description</label>
      <textarea id="description" placeholder="Describe the occurrence — what happened, where, any contributing factors..."></textarea>
    </div>

    <div class="submit-row">
      <button class="btn-primary" id="submitBtn">&#128229; Submit Report</button>
    </div>
  </div>

  <a class="back-link" href="/">&larr; Back to landing page</a>
</div>

<script>
(function() {
  var severity = document.getElementById('severity');
  var severityDisplay = document.getElementById('severityDisplay');
  severity.addEventListener('input', function() {
    severityDisplay.textContent = this.value;
  });

  var now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('occurrenceDate').value = now.toISOString().slice(0, 10);

  var statusBox = document.getElementById('statusBox');
  var submitBtn = document.getElementById('submitBtn');

  function setStatus(type, msg) {
    statusBox.className = 'status-box ' + type;
    statusBox.textContent = '';
    statusBox.innerHTML = msg;
  }

  function hideStatus() {
    statusBox.className = 'status-box';
    statusBox.textContent = '';
  }

  submitBtn.addEventListener('click', async function() {
    var token = document.getElementById('operatorSelect').value;
    if (!token) {
      setStatus('error', 'Please select an operator first.');
      return;
    }
    var description = document.getElementById('description').value.trim();
    if (!description) {
      setStatus('error', 'Description is required.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    setStatus('loading', '&#8987; Submitting your report...');

    var payload = {
      report_type: document.getElementById('reportType').value,
      occurrence_date: document.getElementById('occurrenceDate').value || new Date().toISOString(),
      occurrence_category: document.getElementById('category').value || null,
      severity: parseInt(severity.value, 10),
      description_raw: description,
      source: 'Quick Report'
    };

    try {
      var resp = await fetch('/api/signals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      var data = await resp.json();
      if (resp.ok) {
        var sigId = (data.signal && data.signal.id) || data.id || 'N/A';
        setStatus('success',
          '&#9989; Report submitted successfully!<br><strong>Signal ID:</strong> ' + sigId + '<br>' +
          'Thank you for contributing to safety.'
        );
        document.getElementById('description').value = '';
        document.getElementById('category').value = '';
        document.getElementById('severity').value = '2';
        severityDisplay.textContent = '2';
      } else {
        setStatus('error', 'Submission failed: ' + (data.error || data.message || 'Unknown error'));
      }
    } catch (err) {
      setStatus('error', 'Network error. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
  });
})();
</script>

</body>
</html>`;
    res.send(html);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
