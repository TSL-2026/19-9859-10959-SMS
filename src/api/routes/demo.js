const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id AS user_id, u.tenant_id, u.email, u.role,
             COALESCE(tc.tenant_name, 'CAA Regulator') AS tenant_name,
             tc.region
      FROM users u
      LEFT JOIN tenant_config tc ON tc.tenant_id = u.tenant_id
      ORDER BY tc.tenant_name NULLS FIRST, u.role DESC
    `);

    const accounts = rows.map(u => {
      const token = jwt.sign(
        { sub: u.user_id, tenant_id: u.tenant_id, role: u.role, region: u.region || null },
        process.env.JWT_SECRET
      );
      return { ...u, token };
    });

    const regulator = accounts.find(a => a.role === 'regulator');
    const operators = accounts.filter(a => a.role !== 'regulator');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demo Portal — Safety Monitoring System</title>
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
  .container { max-width: 800px; margin: 0 auto; padding: 24px; }

  .header {
    background: linear-gradient(135deg, #0b1a2e 0%, #1a3a5c 100%);
    padding: 48px 24px 40px;
    text-align: center;
  }
  .header h1 { color: #fff; font-size: 28px; font-weight: 700; }
  .header p { color: #94a9c0; font-size: 15px; margin-top: 8px; max-width: 500px; margin-left: auto; margin-right: auto; }
  .header .back-link { display: inline-block; margin-top: 16px; color: #60b0f4; font-size: 13px; text-decoration: none; }
  .header .back-link:hover { text-decoration: underline; }

  .card {
    background: #fff;
    border-radius: 16px;
    padding: 32px;
    margin-top: -16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .demo-note {
    background: #f0f7ff;
    border: 1px solid #b8d4f0;
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 13px;
    color: #1a3a5c;
    margin-bottom: 28px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .demo-note .icon { font-size: 20px; flex-shrink: 0; }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .account-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px; }
  .account-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
    background: #fff;
  }
  .account-item:hover { border-color: #2c7da0; background: #f8faff; }
  .account-item.regulator { border-color: #f5b041; background: #fffcf5; }
  .account-item.regulator:hover { border-color: #d4952e; }
  .account-item .flag { font-size: 24px; }
  .account-item .info { flex: 1; }
  .account-item .name { font-size: 15px; font-weight: 600; color: #0b1a2e; }
  .account-item .email { font-size: 12px; color: #94a3b8; margin-top: 1px; }
  .account-item .badge {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    padding: 3px 10px; border-radius: 8px; letter-spacing: 0.3px;
  }
  .badge-regulator { background: #fef3c7; color: #92400e; }
  .badge-admin { background: #dbeafe; color: #1e40af; }
  .badge-region {
    background: #e2e8f0; color: #475569;
    font-size: 10px; padding: 2px 8px; border-radius: 6px;
  }
  .account-item .arrow { color: #94a3b8; font-size: 18px; }

  .links-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
  }
  .links-row a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.15s;
  }
  .link-demo { background: #1a3a5c; color: #fff; }
  .link-demo:hover { background: #2c5a7c; }
  .link-report { background: #f0f7ff; color: #2c7da0; border: 1px solid #b8d4f0; }
  .link-report:hover { background: #e0efff; }
  .link-dev { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
  .link-dev:hover { background: #f1f5f9; }

  @media (max-width: 600px) {
    .header h1 { font-size: 22px; }
    .card { padding: 20px; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="container">
    <h1>&#128273; Demo Portal</h1>
    <p>Select an account to explore the safety monitoring dashboard. No password required for this demo environment.</p>
    <a href="/" class="back-link">&larr; Back to home</a>
  </div>
</div>

<div class="container">
  <div class="card">
    <div class="demo-note">
      <div class="icon">&#9888;&#65039;</div>
      <div>This is a <strong>live demo</strong> environment. Authentication is open for evaluation purposes. In production, operators sign in with credentials and the regulator uses a secure gateway. All data is anonymised and aggregated.</div>
    </div>

    <div class="section-title">&#127758; Regulator Dashboard</div>
    <div class="account-list" id="regulatorSection">
      ${regulator ? `
      <div class="account-item regulator" data-token="${regulator.token}" tabindex="0" role="button">
        <div class="flag">&#127477;&#127462;</div>
        <div class="info">
          <div class="name">${regulator.tenant_name}</div>
          <div class="email">${regulator.email}</div>
        </div>
        <span class="badge badge-regulator">Regulator</span>
        <span class="arrow">&#8594;</span>
      </div>` : ''}
    </div>

    <div class="section-title" style="margin-top:24px;">&#9992;&#65039; Operator Dashboards</div>
    <div class="account-list" id="operatorSection">
      ${operators.map(a => {
        const prefix = a.tenant_id.slice(0, 1);
        const flags = { '1': '&#127475;&#127493;', '2': '&#127470;&#127475;', '3': '&#127482;&#127480;', '4': '&#127462;&#127482;', '5': '&#127475;&#127493;' };
        const flag = flags[prefix] || '&#127758;';
        const region = a.region || '—';
        return `
      <div class="account-item" data-token="${a.token}" tabindex="0" role="button">
        <div class="flag">${flag}</div>
        <div class="info">
          <div class="name">${a.tenant_name}</div>
          <div class="email">${a.email}</div>
        </div>
        <span class="badge badge-region">${region}</span>
        <span class="badge badge-admin">Operator</span>
        <span class="arrow">&#8594;</span>
      </div>`;
      }).join('')}
    </div>

    <div class="links-row">
      <a href="/report" class="link-report">&#9888; Quick Report Form</a>
      <a href="/dev/dashboard" class="link-dev">&#9881; Developer Console</a>
    </div>
  </div>
</div>

<script>
(function() {
  function openDashboard(token) {
    if (!token) return;
    window.open('/dashboard/regulator/?token=' + encodeURIComponent(token), '_blank');
  }

  document.querySelectorAll('.account-item').forEach(function(el) {
    el.addEventListener('click', function() {
      openDashboard(this.getAttribute('data-token'));
    });
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDashboard(this.getAttribute('data-token'));
      }
    });
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
