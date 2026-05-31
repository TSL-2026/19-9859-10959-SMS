require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const TENANTS = [
  { id: '10000000-0000-0000-0000-000000000001', name: 'Buddha Air', user_id: 'b72f2cee-5ad0-45f1-a1d3-f058d6660474' },
  { id: '10000000-0000-0000-0000-000000000002', name: 'Yeti Airlines', user_id: '4dc0bed7-e27e-4d67-91d4-3121ab528329' },
  { id: '10000000-0000-0000-0000-000000000003', name: 'Shree Airlines', user_id: '04869b79-3a7a-4801-87e2-7ffbf1c9ca1d' },
  { id: '20000000-0000-0000-0000-000000000001', name: 'IndiGo', user_id: 'e1c983b7-b612-4cd7-a7a3-a83f2ac60fff' },
  { id: '20000000-0000-0000-0000-000000000002', name: 'Air India', user_id: '340bbe48-80fb-415b-8cd3-609b2f1f8dd8' },
  { id: '20000000-0000-0000-0000-000000000003', name: 'SpiceJet', user_id: '56cf2bdd-44db-4f95-ba66-7537fb3c57d6' },
  { id: '30000000-0000-0000-0000-000000000001', name: 'Delta Air Lines', user_id: 'c1ed6e93-cb94-459c-85a6-0b20bbb6ed80' },
  { id: '30000000-0000-0000-0000-000000000002', name: 'American Airlines', user_id: 'dc217314-3151-4020-bbf7-c923392feb1a' },
  { id: '30000000-0000-0000-0000-000000000003', name: 'United Airlines', user_id: 'fa56bcf0-e500-4605-969a-cdef0654f5c3' },
  { id: '40000000-0000-0000-0000-000000000001', name: 'Qantas', user_id: '0b651cc5-d169-4cc6-a3a1-7c00aa461008' },
  { id: '40000000-0000-0000-0000-000000000002', name: 'Virgin Australia', user_id: 'dc433045-ed19-49eb-a528-7707e49dbcd9' },
  { id: '40000000-0000-0000-0000-000000000003', name: 'Rex (Regional Express)', user_id: '533690df-74fc-4057-87fe-cffc7964697a' },
  { id: '50000000-0000-0000-0000-000000000001', name: 'Sita Air', user_id: '717935e7-0c3c-47fa-84e1-9e81844d092c' },
];

const SOURCES = [
  'Cockpit crew report', 'Cabin crew report', 'Maintenance inspection',
  'ATC report', 'Safety audit', 'Flight data monitoring',
  'Ground handling report', 'Operational observation',
];

const DEPARTMENTS = [
  'Flight Operations', 'Maintenance', 'Safety', 'Ground Operations',
  'Cabin Safety', 'Engineering',
];

const STATUSES = ['Closed', 'Reviewed', 'New', 'Dismissed', 'N/A'];
const DESCRIPTIONS = [
  'Hard landing during approach in crosswind conditions',
  'Engine bird strike on departure',
  'Runway excursion on landing',
  'TCAS RA during climb',
  'Cargo smoke indication during taxi',
  'Near miss with drone on final approach',
  'Fuel imbalance detected in cruise',
  'Cabin altitude warning during cruise',
  'Tail strike on round-out during landing',
  'Navigation discrepancy on RNAV approach',
  'Ground collision between catering truck and aircraft',
  'Medical emergency on board',
  'Uncontained engine failure in climb',
  'LASER illumination on approach',
  'Hydraulic system failure after takeoff',
  'Wind shear encounter on final',
  'Communication failure in oceanic airspace',
  'Battery fire in cargo compartment',
  'Runway incursion during taxi',
  'Severe turbulence encounter at cruise altitude',
  'Pilot incapacitation in cruise',
  'Fuel leak detected during pre-flight',
  'APU fire indication on ground',
  'Bird ingestion during takeoff roll',
  'Cabin door indication discrepancy',
  'Altitude deviation due to mis-set altimeter',
  'Foreign object debris found on runway',
  'Suspected fuel contamination',
  'Weather radar failure in known thunderstorm area',
  'Engine oil pressure loss in climb',
];

function randBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function seedDate(year) {
  const month = randBetween(1, 12);
  const day = randBetween(1, 28);
  return new Date(year, month - 1, day);
}

function generateDummyExcel(tenantName, year, count) {
  const header = ['S.N', 'External ID', 'Reported Date', 'Sources of Information',
    'Report Description', 'Occurrence', 'Hazard', 'Safety deficiency', 'Diversion',
    'Status', 'Assigned Department'];

  const rows = [];
  for (let i = 0; i < count; i++) {
    const date = seedDate(year);
    const dateStr = date.toISOString().slice(0, 10);
    const source = pick(SOURCES);
    const dept = pick(DEPARTMENTS);
    const desc = pick(DESCRIPTIONS);
    const status = pick(STATUSES);

    // Determine report type with weighted distribution
    const typeRand = Math.random();
    let isOccurrence = '', isHazard = '', isSafDef = '', isDiversion = '';
    if (typeRand < 0.25) isOccurrence = '✔';
    else if (typeRand < 0.45) isHazard = '✔';
    else if (typeRand < 0.65) isSafDef = '✔';
    else if (typeRand < 0.80) isDiversion = '✔';
    // 20% are VSR (no checkmark)

    rows.push([
      i + 1,
      `${tenantName.replace(/[^A-Z]/g, '').slice(0, 3).toUpperCase()}-${year}-${String(i + 1).padStart(3, '0')}`,
      dateStr,
      source,
      desc,
      isOccurrence,
      isHazard,
      isSafDef,
      isDiversion,
      status,
      dept,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((_, i) => ({ wch: i === 4 ? 50 : 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Master Logsheet');
  return wb;
}

async function uploadFile(filePath, tenantId, userId) {
  const token = jwt.sign(
    { sub: userId, tenant_id: tenantId, role: 'admin' },
    process.env.JWT_SECRET
  );

  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));

  const res = await fetch('http://localhost:3000/api/import/excel', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
}

async function main() {
  const tmpDir = path.join(__dirname, '..', 'tmp_excel');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const year = 2023;
  const signalsPerTenant = 50;

  for (const tenant of TENANTS) {
    const isSitaAir = tenant.id === '50000000-0000-0000-0000-000000000001';

    if (isSitaAir) {
      // Upload the real Master Logsheet for Sita Air
      const realFile = path.join(__dirname, '..', 'Master_Logsheet-2023.xlsx');
      if (fs.existsSync(realFile)) {
        console.log(`\n=== Sita Air: uploading real Master_Logsheet-2023.xlsx ===`);
        try {
          const result = await uploadFile(realFile, tenant.id, tenant.user_id);
          console.log(`  Imported: ${result.total_signals_imported} signals`);
          console.log(`  By type:`, JSON.stringify(result.by_type));
        } catch (err) {
          console.error(`  FAILED: ${err.message}`);
        }
      } else {
        console.log(`\n=== Master_Logsheet-2023.xlsx not found for Sita Air, generating dummy ===`);
        const wb = generateDummyExcel(tenant.name, year, signalsPerTenant);
        const filePath = path.join(tmpDir, `${tenant.name.replace(/[^a-z]/gi, '_')}_${year}.xlsx`);
        XLSX.writeFile(wb, filePath);
        console.log(`  Generated: ${filePath}`);
        try {
          const result = await uploadFile(filePath, tenant.id, tenant.user_id);
          console.log(`  Imported: ${result.total_signals_imported} signals`);
        } catch (err) {
          console.error(`  FAILED: ${err.message}`);
        }
      }
    } else {
      // Generate dummy Excel for other operators
      const wb = generateDummyExcel(tenant.name, year, signalsPerTenant);
      const filePath = path.join(tmpDir, `${tenant.name.replace(/[^a-z]/gi, '_')}_${year}.xlsx`);
      XLSX.writeFile(wb, filePath);
      console.log(`\n=== ${tenant.name}: uploading ${signalsPerTenant} signals ===`);
      try {
        const result = await uploadFile(filePath, tenant.id, tenant.user_id);
        console.log(`  Imported: ${result.total_signals_imported} signals`);
        console.log(`  By type:`, JSON.stringify(result.by_type));
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
      }
    }
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n✓ All uploads complete.`);
}

main().catch(err => { console.error(err); process.exit(1); });
