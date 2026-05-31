const { Router } = require('express');
const pool = require('../../db/pool');

const router = Router();

router.get('/', async (req, res) => {
  let totalSignals = 0, totalAlerts = 0, operatorCount = 0, regionCount = 0;
  try {
    totalSignals = (await pool.query('SELECT COUNT(*)::int AS c FROM safety_signals')).rows[0].c;
  } catch (_) {}
  try {
    totalAlerts = (await pool.query('SELECT COUNT(*)::int AS c FROM alerts')).rows[0].c;
  } catch (_) {}
  try {
    operatorCount = (await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'")).rows[0].c;
  } catch (_) {}
  try {
    regionCount = (await pool.query('SELECT COUNT(DISTINCT region)::int AS c FROM tenant_config WHERE region IS NOT NULL')).rows[0].c;
  } catch (_) {}

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AviaSafe — ICAO Annex 19 Safety Intelligence Platform</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #f8fafc;
    color: #1e293b;
    line-height: 1.6;
    padding-top: 110px;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* Nav */
  nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(8px);
    border-bottom: 1px solid #e2e8f0;
  }
  nav .nav-inner {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 24px; max-width: 1100px; margin: 0 auto;
  }
  nav .logo { font-size: 18px; font-weight: 700; color: #0b1a2e; display: flex; align-items: center; gap: 10px; }
  nav .logo svg { width: 28px; height: 28px; }
  nav .nav-links { display: flex; gap: 24px; align-items: center; }
  nav .nav-links a { text-decoration: none; font-size: 14px; font-weight: 500; color: #475569; transition: color 0.2s; }
  nav .nav-links a:hover { color: #2c7da0; }
  .nav-cta {
    padding: 8px 20px; background: #1a3a5c; color: #fff !important;
    border-radius: 8px; font-weight: 600 !important;
  }
  .nav-cta:hover { background: #2c5a7c !important; }

  /* News Ticker */
  .ticker {
    position: fixed; top: 56px; left: 0; right: 0; z-index: 99;
    background: #dc2626; color: #fff; font-size: 14px; font-weight: 600;
    padding: 12px 0; overflow: hidden; white-space: nowrap;
    line-height: 1.3;
  }
  .ticker span {
    display: inline-block;
    animation: ticker 40s linear infinite;
    padding-left: 100%;
  }
  @keyframes ticker {
    0% { transform: translateX(0); }
    100% { transform: translateX(-100%); }
  }

  /* Hero */
  .hero {
    background: linear-gradient(135deg, #0b1a2e 0%, #1a3a5c 50%, #0f2a44 100%);
    color: #e0e8f0; padding: 80px 0 60px; position: relative; overflow: hidden;
  }
  .hero::after {
    content: ''; position: absolute; top: -50%; right: -20%;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(96,176,244,0.08) 0%, transparent 70%);
    border-radius: 50%;
  }
  .hero .container { position: relative; z-index: 1; }
  .hero-badge {
    display: inline-block; background: rgba(96,176,244,0.15);
    color: #7dd3fc; padding: 6px 16px; border-radius: 20px;
    font-size: 13px; font-weight: 600; margin-bottom: 20px;
    border: 1px solid rgba(96,176,244,0.2);
  }
  .hero h1 {
    font-size: 44px; font-weight: 800; margin-bottom: 16px; line-height: 1.15;
    background: linear-gradient(90deg, #60b0f4, #7dd3fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .hero p { font-size: 18px; color: #94a9c0; max-width: 680px; margin-bottom: 36px; line-height: 1.7; }
  .hero-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 48px; }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 32px; background: #2c7da0; color: #fff;
    border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
    cursor: pointer; font-family: inherit; text-decoration: none;
    transition: background 0.2s, transform 0.1s;
  }
  .btn-primary:hover { background: #3a8db5; transform: translateY(-1px); }
  .btn-secondary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 32px; background: rgba(255,255,255,0.06); color: #e0e8f0;
    border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
    font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit; text-decoration: none;
    transition: background 0.2s;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.12); }
  .hero-stats {
    display: flex; gap: 40px; flex-wrap: wrap;
  }
  .hero-stats .stat { text-align: center; }
  .hero-stats .num { font-size: 34px; font-weight: 700; color: #60b0f4; }
  .hero-stats .label { font-size: 13px; color: #6a8aa4; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

  /* Sections */
  section { padding: 72px 0; scroll-margin-top: 120px; }
  section:nth-child(even) { background: #fff; }
  .section-title { font-size: 30px; font-weight: 700; margin-bottom: 12px; color: #0b1a2e; }
  .section-subtitle { font-size: 16px; color: #64748b; margin-bottom: 44px; max-width: 700px; line-height: 1.7; }

  /* Features */
  .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .feature-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
    padding: 32px; transition: box-shadow 0.2s, transform 0.2s;
  }
  .feature-card:hover { box-shadow: 0 8px 30px rgba(0,0,0,0.06); transform: translateY(-2px); }
  .feature-card .icon { font-size: 36px; margin-bottom: 16px; }
  .feature-card h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #0b1a2e; }
  .feature-card p { font-size: 14px; color: #64748b; line-height: 1.7; }

  /* How it works */
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; counter-reset: step; }
  .step { text-align: center; padding: 0 8px; }
  .step-num {
    width: 48px; height: 48px; border-radius: 50%; background: #1a3a5c;
    color: #7dd3fc; font-size: 20px; font-weight: 700; line-height: 48px;
    margin: 0 auto 16px;
  }
  .step h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; color: #0b1a2e; }
  .step p { font-size: 13px; color: #64748b; line-height: 1.6; }

  /* Compliance */
  .compliance-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .compliance-card {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 28px; text-align: center; border-top: 4px solid #2c7da0;
  }
  .compliance-card .code { font-size: 13px; color: #2c7da0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .compliance-card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; color: #0b1a2e; }
  .compliance-card p { font-size: 13px; color: #64748b; }

  /* CTA */
  .cta-section {
    background: linear-gradient(135deg, #0b1a2e 0%, #1a3a5c 100%);
    text-align: center; padding: 72px 24px;
  }
  .cta-section h2 { font-size: 32px; font-weight: 700; color: #fff; margin-bottom: 12px; }
  .cta-section p { color: #94a9c0; font-size: 16px; margin-bottom: 32px; max-width: 600px; margin-left: auto; margin-right: auto; }
  .cta-section .btn-primary { font-size: 18px; padding: 16px 40px; background: #2c7da0; }
  .cta-section .btn-primary:hover { background: #3a8db5; }

  /* Footer */
  footer { text-align: center; padding: 40px 24px; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }

  @media (max-width: 768px) {
    .hero h1 { font-size: 30px; }
    .hero p { font-size: 16px; }
    .features-grid, .compliance-grid { grid-template-columns: repeat(2, 1fr); }
    .steps { grid-template-columns: repeat(2, 1fr); gap: 32px; }
  }
  @media (max-width: 480px) {
    .features-grid, .compliance-grid { grid-template-columns: 1fr; }
    .steps { grid-template-columns: 1fr; }
    nav .nav-links a:not(.nav-cta) { display: none; }
    .hero h1 { font-size: 26px; }
    .hero-actions { flex-direction: column; }
    .hero-actions a { text-align: center; justify-content: center; }
  }
</style>
</head>
<body>

<nav>
  <div class="nav-inner">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="#2c7da0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      AviaSafe
    </div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#compliance">Compliance</a>
      <a href="#how">How It Works</a>
      <a href="/report">Quick Report</a>
      <a href="/demo" class="nav-cta">View Demo</a>
    </div>
  </div>
</nav>

<div class="ticker"><span>Built with reference to ICAO Annex&nbsp;19 (Safety Management), Doc&nbsp;9859 (SMM), and Doc&nbsp;10959 (Safety Intelligence Manual) &mdash; ICAO Annex&nbsp;19 Compliant Safety Intelligence Platform &mdash; </span></div>

<!-- Hero -->
<div class="hero">
  <div class="container">
    <div class="hero-badge">&#9679; ICAO Annex 19 Compliant</div>
    <h1>Safety Intelligence Platform<br>for Aviation Operators &amp; Regulators</h1>
    <p>A multi-tenant safety monitoring system aligned with ICAO Annex&nbsp;19 (Safety Management), Doc&nbsp;9859 (SMM), and Doc&nbsp;10959 (Safety Intelligence Manual). Collect, analyse, and act on safety data across your entire operation.</p>
    <div class="hero-actions">
      <a href="/demo" class="btn-primary">&#9654; View Live Demo</a>
      <a href="/report" class="btn-secondary">&#9888; Submit Quick Report</a>
    </div>
    <div class="hero-stats">
      <div class="stat"><div class="num">${operatorCount}</div><div class="label">Operators</div></div>
      <div class="stat"><div class="num">${totalSignals.toLocaleString()}</div><div class="label">Safety Signals</div></div>
      <div class="stat"><div class="num">${regionCount}</div><div class="label">Regions</div></div>
      <div class="stat"><div class="num">${totalAlerts.toLocaleString()}</div><div class="label">Active Alerts</div></div>
    </div>
  </div>
</div>

<!-- Features -->
<section id="features">
  <div class="container">
    <h2 class="section-title">&#128640; Platform Features</h2>
    <p class="section-subtitle">Built from the ground up to meet ICAO SMS requirements for safety data collection, analysis, and exchange.</p>
    <div class="features-grid">
      <div class="feature-card">
        <div class="icon">&#128200;</div>
        <h3>Safety Performance Monitoring</h3>
        <p>Track MOR, VSR, Hazard, and Deficiency signals with risk assessment matrices (severity &#215; probability). Automated alerting based on configurable thresholds per operator.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#9878;&#65039;</div>
        <h3>Just Culture Analytics</h3>
        <p>Measure voluntary vs. mandatory reporting rates, compute health scores, and benchmark against safety intelligence targets. Fosters a non-punitive reporting culture aligned with Doc&nbsp;10959.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#128737;&#65039;</div>
        <h3>Multi-Tenant Isolation</h3>
        <p>Each operator&#8217;s data is fully isolated at the database level. The regulator sees only aggregated, anonymised industry-wide metrics with zero raw PII exposure.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#128196;</div>
        <h3>Regulatory Reporting</h3>
        <p>Export ICAO Annex&nbsp;19-compliant SPI reports in PDF. Executive summaries, signal breakdowns by type, monthly trends, and risk analysis for regulatory submissions.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#128228;</div>
        <h3>Bulk Import &amp; Integration</h3>
        <p>Upload Excel logs (Master Logsheet, Occurrence Log, Hazard Logsheet, Safety Deficiencies, Diversions). PII auto-redacted and encrypted. REST API for system integration.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#128274;</div>
        <h3>PII Anonymization</h3>
        <p>Personally Identifiable Information (names, flight numbers, tail numbers) is automatically redacted. Original data AES-256-GCM encrypted and stored separately.</p>
      </div>
    </div>
  </div>
</section>

<!-- How It Works -->
<section id="how" style="background:#fff;">
  <div class="container">
    <h2 class="section-title">&#128204; How It Works</h2>
    <p class="section-subtitle">From hazard identification to regulatory oversight — the complete safety data lifecycle.</p>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Report</h3>
        <p>Submit safety reports via web form, Excel upload, or API. PII is automatically redacted and encrypted at rest.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Classify &amp; Assess</h3>
        <p>ICAO ADREP taxonomy classification, risk scoring (severity &#215; probability), and automated alert evaluation.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Investigate</h3>
        <p>Assign signals, document defences-in-depth, track resolution. Automated escalation for overdue items.</p>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <h3>Analyse &amp; Report</h3>
        <p>Regulator-level SPI dashboards, Just Culture benchmarks, regional aggregation, and PDF export.</p>
      </div>
    </div>
  </div>
</section>

<!-- Compliance -->
<section id="compliance">
  <div class="container">
    <h2 class="section-title">&#128214; Regulatory Compliance</h2>
    <p class="section-subtitle">Designed to align with international aviation safety standards and guidance material.</p>
    <div class="compliance-grid">
      <div class="compliance-card">
        <div class="code">ICAO Annex 19</div>
        <h3>Safety Management</h3>
        <p>SARPs for State Safety Programme (SSP) and Safety Management Systems (SMS), including safety data collection, analysis, and exchange.</p>
      </div>
      <div class="compliance-card">
        <div class="code">ICAO Doc 9859</div>
        <h3>Safety Management Manual</h3>
        <p>Hazard identification, risk assessment methodology, and Safety Performance Indicators (SPIs) as defined in the SMM.</p>
      </div>
      <div class="compliance-card">
        <div class="code">ICAO Doc 10959</div>
        <h3>Safety Intelligence Manual</h3>
        <p>Data analysis, safety intelligence development, and Just Culture measurement frameworks complementing Annex&nbsp;19, Amendment&nbsp;2.</p>
      </div>
      <div class="compliance-card">
        <div class="code">EU 376/2014</div>
        <h3>Occurrence Reporting</h3>
        <p>Mandatory and voluntary occurrence reporting classification aligning with European occurrence reporting regulation.</p>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<div class="cta-section">
  <div class="container">
    <h2>See It In Action</h2>
    <p>Explore the full platform with 1,430 real-world safety signals across 13 operators in 3 regions. No sign-up required.</p>
    <a href="/demo" class="btn-primary">&#9654; Launch Live Demo</a>
  </div>
</div>

<footer>
  Copyright A project by Ghanshyam Acharya for TAC Nepal
</footer>

</body>
</html>`;
    res.send(html);
});

module.exports = router;
