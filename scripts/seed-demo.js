require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/db/pool');

const TENANTS = [
  // Nepal
  { id: '10000000-0000-0000-0000-000000000001', name: 'Buddha Air', country: 'Nepal', region: 'asia', ops: 45000 },
  { id: '10000000-0000-0000-0000-000000000002', name: 'Yeti Airlines', country: 'Nepal', region: 'asia', ops: 32000 },
  { id: '10000000-0000-0000-0000-000000000003', name: 'Shree Airlines', country: 'Nepal', region: 'asia', ops: 28000 },
  { id: '50000000-0000-0000-0000-000000000001', name: 'Sita Air', country: 'Nepal', region: 'asia', ops: 15000 },
  // India
  { id: '20000000-0000-0000-0000-000000000001', name: 'IndiGo', country: 'India', region: 'asia', ops: 180000 },
  { id: '20000000-0000-0000-0000-000000000002', name: 'Air India', country: 'India', region: 'asia', ops: 120000 },
  { id: '20000000-0000-0000-0000-000000000003', name: 'SpiceJet', country: 'India', region: 'asia', ops: 75000 },
  // USA
  { id: '30000000-0000-0000-0000-000000000001', name: 'Delta Air Lines', country: 'USA', region: 'na', ops: 350000 },
  { id: '30000000-0000-0000-0000-000000000002', name: 'American Airlines', country: 'USA', region: 'na', ops: 320000 },
  { id: '30000000-0000-0000-0000-000000000003', name: 'United Airlines', country: 'USA', region: 'na', ops: 290000 },
  // Australia
  { id: '40000000-0000-0000-0000-000000000001', name: 'Qantas', country: 'Australia', region: 'oceania', ops: 95000 },
  { id: '40000000-0000-0000-0000-000000000002', name: 'Virgin Australia', country: 'Australia', region: 'oceania', ops: 68000 },
  { id: '40000000-0000-0000-0000-000000000003', name: 'Rex (Regional Express)', country: 'Australia', region: 'oceania', ops: 22000 },
];

const REPORT_TYPES = ['MOR', 'VSR', 'Hazard', 'HAZARD', 'SAFETY_DEFICIENCY', 'DIVERSION'];
const STATUSES = ['Reported', 'Under Investigation', 'Resolved', 'Closed', 'Dismissed'];
const SOURCES = ['Cockpit crew report', 'Cabin crew report', 'Maintenance inspection', 'ATC report', 'Safety audit', 'Operational observation', 'Internal investigation', 'External report', 'Ground handling report', 'Flight data monitoring'];
const DEPARTMENTS = ['Flight Operations', 'Maintenance', 'Safety', 'Ground Operations', 'Cabin Safety', 'Quality Assurance', 'Training', 'Engineering', 'Dispatch', 'Security'];
const ROLES = ['pilot', 'cabin', 'maintenance', 'atc', 'ground', 'flight_ops', 'other'];
const DESCRIPTIONS = [
  'Hard landing during approach in crosswind conditions. Aircraft inspected per maintenance procedure.',
  'Engine bird strike on departure. Engine shut down as precaution, returned to gate.',
  'Runway excursion on landing. Aircraft exited paved surface onto grass. No injuries.',
  'TCAS RA during climb. Crew followed RA指令, vertical separation maintained.',
  'Cargo smoke indication during taxi. Fire brigade inspected, false alarm confirmed.',
  'Near miss with drone on final approach. Go-around executed, unstable approach.',
  'Fuel imbalance detected in cruise. Cross-feed操作 restored balance, landed without incident.',
  'Cabin altitude warning during cruise. Emergency descent initiated, masks deployed.',
  'Tail strike on round-out during landing. Inspection found structural damage, aircraft grounded.',
  'Navigation discrepancy on RNAV approach. Missed approach executed, ILS used for landing.',
  'Ground collision between catering truck and aircraft. Minor damage to cargo door.',
  'Medical emergency on board. Passenger experienced chest pain, priority landing requested.',
  'Uncontained engine failure in climb. Debris punctured fuselage, cabin depressurized.',
  'LASER illumination on approach. Crew incapacitated temporarily, auto-land used.',
  'Hydraulic system failure after takeoff. Returned to departure airport, overweight landing.',
  'Wind shear encounter on final. Go-around from low altitude. No ground contact.',
  'Communication failure in oceanic airspace. Lost contact for 22 minutes. Procedural separation used.',
  'Battery fire in cargo compartment. Fire suppression discharged, diversion to alternate.',
  'Runway incursion during taxi. Holding position violated. TCAS alerted traffic on approach.',
  'Maintenance error: incorrect oil cap left loose. Engine oil loss detected in pre-flight.',
  'Severe turbulence encounter at cruise altitude. Cabin crew和passengers injured.',
  'Pilot incapacitation in cruise. Co-pilot assumed control, diversion arranged.',
  'Fuel leak detected during pre-flight. Aircraft taken out of service for maintenance.',
  'APU fire indication on ground. Fire bottle discharged, APU shut down.',
  'Bird ingestion during takeoff roll. Takeoff rejected below V1. Returned to gate.',
  'Cabin door indication discrepancy. Door not properly sealed, maintenance rectified.',
  'Altitude deviation due to mis-set altimeter. ATC notified, separation assured.',
  'Foreign object debris found on runway during departure brief. Runway inspected, departure delayed.',
  'Suspected燃油 contamination. Fuel sample tested, contaminated batch identified.',
  'Weather radar failure in known thunderstorm area. Circulation, holding pattern until weather passed.',
];

const ASSIGNED_DEPT_MAP = {
  'Cockpit crew report': 'Flight Operations',
  'Cabin crew report': 'Cabin Safety',
  'Maintenance inspection': 'Maintenance',
  'ATC report': 'Flight Operations',
  'Safety audit': 'Safety',
  'Operational observation': 'Flight Operations',
  'Internal investigation': 'Safety',
  'External report': 'Quality Assurance',
  'Ground handling report': 'Ground Operations',
  'Flight data monitoring': 'Safety',
};

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function seedDate(year) {
  const month = randBetween(1, 12);
  const day = randBetween(1, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Generate weighted severity by region: Nepal higher, USA lower
function genSeverity(region) {
  const w = { asia: [1, 3, 2, 2, 1], na: [3, 3, 2, 1, 1], oceania: [2, 3, 2, 2, 1] };
  const poolArr = w[region] || w.na;
  const total = poolArr.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < poolArr.length; i++) {
    r -= poolArr[i];
    if (r <= 0) return i + 1;
  }
  return 3;
}

function genProbability() {
  const w = [3, 3, 2, 1, 1];
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 2;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Clearing existing data...');
    await client.query('DELETE FROM pii_store');
    await client.query('DELETE FROM alerts');
    await client.query('DELETE FROM alert_rules');
    await client.query('DELETE FROM safety_signals');
    await client.query('DELETE FROM tenant_config');
    await client.query('DELETE FROM users');

    // Insert regulator account
    await client.query(
      `INSERT INTO users (id, tenant_id, email, name, role, tenant_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'regulator@caa.gov', 'CAA Regulator', 'regulator', 'regulator']
    );
    console.log('  Regulator: regulator@caa.gov');

    let totalSignals = 0;

    for (const tenant of TENANTS) {
      console.log(`\n--- ${tenant.name} (${tenant.country}) ---`);

      // 1. Insert admin user
      const email = `admin@${tenant.name.toLowerCase().replace(/[^a-z]/g, '')}.com`;
      await client.query(
        `INSERT INTO users (tenant_id, email, name, role, tenant_type)
         VALUES ($1, $2, $3, 'admin', 'airline')`,
        [tenant.id, email, `${tenant.name} Admin`]
      );
      console.log(`  Admin: ${email}`);

      // 2. Insert tenant_config
      await client.query(
        `INSERT INTO tenant_config (tenant_id, config, tenant_name, region)
         VALUES ($1, $2, $3, $4)`,
        [tenant.id, JSON.stringify({ total_operations: tenant.ops }), tenant.name, tenant.region]
      );

      // 3. Insert alert rules
      const rules = [
        { name: 'High Severity', sev: 3, prob: 3, level: 'HIGH', ch: ['in_app'] },
        { name: 'Critical Risk', sev: 4, prob: 4, level: 'CRITICAL', ch: ['email', 'in_app'] },
        { name: 'Medium Watch', sev: 2, prob: 3, level: 'MEDIUM', ch: ['in_app'] },
      ];
      const ruleIds = [];
      for (const r of rules) {
        const { rows } = await client.query(
          `INSERT INTO alert_rules (tenant_id, rule_name, severity_threshold, probability_threshold, alert_level, channels)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [tenant.id, r.name, r.sev, r.prob, r.level, JSON.stringify(r.ch)]
        );
        ruleIds.push(rows[0].id);
      }

      // 4. Generate signals: ~40 for 2023, ~40 for 2024, ~30 for 2025
      const years = [2023, 2024, 2025];
      const counts = { 2023: 40, 2024: 40, 2025: 30 };
      const BATCH = 25;

      for (const year of years) {
        const batchVals = [];
        const batchParams = [];
        let paramIdx = 1;

        for (let i = 0; i < counts[year]; i++) {
          const reportType = pick(REPORT_TYPES);
          const source = pick(SOURCES);
          const severity = genSeverity(tenant.region);
          const probability = genProbability();
          const riskLevel = severity * probability;
          const status = pick(STATUSES);
          const role = pick(ROLES);
          const isVoluntary = reportType === 'VSR';
          const dept = ASSIGNED_DEPT_MAP[source] || pick(DEPARTMENTS);
          const date = seedDate(year);
          const desc = pick(DESCRIPTIONS);
          const reportId = `${reportType}-${year}-${String(i + 1).padStart(3, '0')}`;

          batchVals.push(`($${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++})`);
          batchParams.push(tenant.id, reportId, reportType, date, severity, probability, riskLevel, desc, status, isVoluntary, role, source, dept);
          totalSignals++;

          if (batchVals.length >= BATCH || i === counts[year] - 1) {
            const { rows } = await client.query(
              `INSERT INTO safety_signals
                 (tenant_id, report_id, report_type, occurrence_date, severity, probability,
                  risk_level, description_raw, status, is_voluntary, reporter_role,
                  source, assigned_department)
               VALUES ${batchVals.join(', ')}
               RETURNING id, severity, probability`,
              batchParams
            );

            for (const signal of rows) {
              for (const rule of rules) {
                if (signal.severity >= rule.sev && signal.probability >= rule.prob) {
                  if (Math.random() < 0.6) {
                    const matchingRule = ruleIds[rules.indexOf(rule)];
                    await client.query(
                      `INSERT INTO alerts (tenant_id, signal_id, rule_id, alert_level)
                       VALUES ($1, $2, $3, $4)`,
                      [tenant.id, signal.id, matchingRule, rule.level]
                    );
                  }
                }
              }
            }

            batchVals.length = 0;
            batchParams.length = 0;
            paramIdx = 1;
          }
        }
        console.log(`  ${counts[year]} signals (${year})`);
      }
    }

    console.log(`\n✓ Seed complete. ${totalSignals} total signals across ${TENANTS.length} tenants.`);
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
