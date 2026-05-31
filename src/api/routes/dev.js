const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');

const router = Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id AS user_id, u.tenant_id, u.email, u.role,
             COALESCE(tc.tenant_name, 'CAA Regulator') AS tenant_name
      FROM users u
      LEFT JOIN tenant_config tc ON tc.tenant_id = u.tenant_id
      ORDER BY tc.tenant_name NULLS FIRST, u.role DESC
    `);

    const cards = rows.map(u => {
      const token = jwt.sign(
        { sub: u.user_id, tenant_id: u.tenant_id, role: u.role },
        process.env.JWT_SECRET
      );
      return { ...u, token };
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Safety Monitor — Developer Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: linear-gradient(135deg, #0b1a2e 0%, #1a3a5c 100%);
    min-height: 100vh;
    color: #e0e8f0;
    padding: 40px 24px;
  }
  .container { max-width: 1280px; margin: 0 auto; }
  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-bottom: 40px; padding-bottom: 24px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .logo h1 {
    font-size: 28px; font-weight: 800;
    background: linear-gradient(90deg, #60b0f4, #7dd3fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .logo span {
    font-size: 13px; color: #8aa9c4; font-weight: 500;
    display: block; margin-top: 4px;
  }
  .badge {
    background: rgba(96,176,244,0.15); color: #7dd3fc;
    padding: 8px 16px; border-radius: 20px;
    font-size: 13px; font-weight: 600;
    border: 1px solid rgba(96,176,244,0.2);
  }
  .stats {
    display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap;
  }
  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px; padding: 16px 24px;
    backdrop-filter: blur(8px); flex: 1; min-width: 140px;
  }
  .stat-card .num { font-size: 28px; font-weight: 700; color: #60b0f4; }
  .stat-card .label { font-size: 12px; color: #8aa9c4; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-title {
    font-size: 18px; font-weight: 700; margin-bottom: 20px;
    color: #b0c8dc; letter-spacing: 0.3px;
  }
  .section-title .highlight { color: #f5b041; }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px; margin-bottom: 40px;
  }
  .card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px; padding: 20px;
    transition: all 0.2s ease; cursor: pointer;
    position: relative; overflow: hidden;
  }
  .card:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(96,176,244,0.3);
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.2);
  }
  .card.regulator {
    border-color: rgba(245,176,65,0.3);
    background: rgba(245,176,65,0.06);
  }
  .card.regulator:hover { border-color: rgba(245,176,65,0.5); }
  .card .region-tag {
    position: absolute; top: 12px; right: 12px;
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px;
  }
  .tag-asia { background: rgba(96,176,244,0.15); color: #7dd3fc; }
  .tag-na { background: rgba(245,176,65,0.15); color: #f5b041; }
  .tag-oceania { background: rgba(125,211,252,0.12); color: #7dd3fc; }
  .tag-regulator { background: rgba(245,176,65,0.2); color: #f5b041; }
  .card .name { font-size: 17px; font-weight: 700; color: #eef4f8; margin-bottom: 4px; }
  .card .email { font-size: 12px; color: #8aa9c4; margin-bottom: 12px; }
  .card .meta { display: flex; gap: 12px; font-size: 12px; }
  .card .meta span { color: #6a8aa4; }
  .card .meta .role-pill {
    padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;
  }
  .role-admin { background: rgba(96,176,244,0.15); color: #7dd3fc; }
  .role-regulator { background: rgba(245,176,65,0.15); color: #f5b041; }
  .card .signal-count { font-size: 13px; color: #60b0f4; margin-top: 8px; }
  .footer {
    text-align: center; padding-top: 32px;
    border-top: 1px solid rgba(255,255,255,0.06);
    font-size: 13px; color: #5a7a94;
  }
  .footer a { color: #60b0f4; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
  @media (max-width: 640px) {
    body { padding: 20px 16px; }
    header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo">
      <h1>ICAO Annex 19 SMS</h1>
      <span>Safety Monitoring System · Developer Console</span>
    </div>
    <div class="badge">&#9679; Live &nbsp; port 3000</div>
  </header>

  <div class="stats">
    <div class="stat-card"><div class="num">${cards.length}</div><div class="label">Accounts</div></div>
    <div class="stat-card"><div class="num">${cards.filter(c => c.role !== 'regulator').length}</div><div class="label">Operators</div></div>
    <div class="stat-card"><div class="num">1</div><div class="label">Regulator</div></div>
    <div class="stat-card"><div class="num">${cards.filter(c => c.role !== 'regulator').reduce((s, c) => { return { count: (s.count||0) + 1 }; }, {count:0}).count || cards.filter(c => c.role !== 'regulator').length}</div><div class="label">Regions</div></div>
  </div>

  <div class="section-title">&#127758; <span class="highlight">Regulator</span></div>
  <div class="grid" id="regulatorGrid"></div>

  <div class="section-title">&#9992;&#65039; Operator Dashboards <span style="font-weight:400;color:#6a8aa4;font-size:14px;">— click any card to open</span></div>
  <div class="grid" id="operatorGrid"></div>

  <div class="footer">
    ICAO Annex 19 Safety Monitoring System &mdash; <a href="https://github.com/anomalyco/opencode" target="_blank">openCode</a> demo &bull; Data is anonymized and aggregated
  </div>
</div>

<div id="selectorBar" style="margin-bottom:24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
  <select id="operatorSelect" style="flex:1;min-width:200px;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#e0e8f0;font-size:14px;font-family:inherit;outline:none;cursor:pointer;">
    <option value="">— Select an operator —</option>
  </select>
  <button id="openSelectedBtn" style="padding:10px 24px;border-radius:8px;border:none;background:#60b0f4;color:#0b1a2e;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;">&#128279; Open Dashboard</button>
</div>

<script>
(function() {
  const tenants = ${JSON.stringify(cards)};
  const regulator = tenants.find(function(t) { return t.role === 'regulator'; });
  const operators = tenants.filter(function(t) { return t.role !== 'regulator'; });

  function openDashboard(token) {
    window.open('/dashboard/regulator/?token=' + encodeURIComponent(token), '_blank');
  }

  function getRegionTag(tenantId) {
    if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000000') return '';
    var prefix = tenantId.slice(0, 1);
    var map = { '1': 'asia', '2': 'asia', '3': 'na', '4': 'oceania', '5': 'asia' };
    var region = map[prefix] || 'asia';
    return '<span class="region-tag tag-' + region + '">' + region + '</span>';
  }

  function getFlag(tenantId) {
    if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000000') return '&#127477;&#127462;';
    var prefix = tenantId.slice(0, 1);
    var map = { '1': '&#127475;&#127493;', '2': '&#127470;&#127475;', '3': '&#127482;&#127480;', '4': '&#127462;&#127482;', '5': '&#127475;&#127493;' };
    return map[prefix] || '&#127758;';
  }

  // Build regulator card
  if (regulator) {
    var regEl = document.createElement('div');
    regEl.className = 'card regulator';
    regEl.setAttribute('role', 'button');
    regEl.setAttribute('tabindex', '0');
    regEl.innerHTML =
      '<span class="region-tag tag-regulator">CAA</span>' +
      '<div class="name">&#127477;&#127462; ' + regulator.tenant_name + '</div>' +
      '<div class="email">' + regulator.email + '</div>' +
      '<div class="meta"><span class="role-pill role-regulator">Regulator</span><span>Aggregated view</span></div>';
    regEl.addEventListener('click', function() { openDashboard(regulator.token); });
    regEl.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDashboard(regulator.token); } });
    document.getElementById('regulatorGrid').appendChild(regEl);
  }

  // Build operator cards
  var opGrid = document.getElementById('operatorGrid');
  operators.forEach(function(t) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-token', t.token);
    card.setAttribute('data-name', t.tenant_name);
    card.innerHTML =
      getRegionTag(t.tenant_id) +
      '<div class="name">' + getFlag(t.tenant_id) + ' ' + t.tenant_name + '</div>' +
      '<div class="email">' + t.email + '</div>' +
      '<div class="meta"><span class="role-pill role-admin">Operator</span><span>' + t.tenant_id.slice(0, 8) + '&hellip;</span></div>';
    card.addEventListener('click', function() { openDashboard(t.token); });
    card.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDashboard(t.token); } });
    opGrid.appendChild(card);
  });

  // Populate select dropdown
  var select = document.getElementById('operatorSelect');
  operators.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t.token;
    opt.textContent = t.tenant_name + ' (' + t.email + ')';
    select.appendChild(opt);
  });

  document.getElementById('openSelectedBtn').addEventListener('click', function() {
    var token = select.value;
    if (token) openDashboard(token);
  });
  select.addEventListener('change', function() {
    if (this.value) openDashboard(this.value);
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
