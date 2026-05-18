const XLSX = require('xlsx');
const { redactPII, dateToWeekMonday } = require('./piiAnonymizer');

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDate(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  // Excel serial number
  const serial = Number(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Ordinal date: "2nd Jan 2023", "28th/23rd March 2023"
  const match = str.match(/^(\d{1,2})(?:st|nd|rd|th)(?:\/\d{1,2}(?:st|nd|rd|th))?\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const month = String(MONTHS[match[2].toLowerCase().slice(0, 3)] || 1).padStart(2, '0');
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
}

function priorityToSeverity(priority) {
  if (!priority || typeof priority !== 'string') return null;
  const upper = priority.toUpperCase();
  if (upper.includes('H')) return 5;
  if (upper.includes('M')) return 3;
  if (upper.includes('L')) return 1;
  return null;
}

function detectReportTypeFromCheckmarks(row) {
  if (row[5] === '✔' || row['Occurrence'] === '✔') return 'MOR';
  if (row[6] === '✔' || row['Hazard'] === '✔') return 'HAZARD';
  if (row[7] === '✔' || row['Safety deficiency'] === '✔') return 'SAFETY_DEFICIENCY';
  if (row[8] === '✔' || row['Diversion'] === '✔') return 'DIVERSION';

  return 'VSR';
}

// ─── Master Logsheet ──────────────────────────────────────────────────

async function processMasterSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (data.length < 6) return signals;

  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const extId = String(row[1] || '').trim();
    if (!extId) continue;

    const descriptionRaw = String(row[4] || '').trim();
    const reportType = detectReportTypeFromCheckmarks(row);

    signals.push({
      tenant_id: tenantId,
      external_id: extId,
      occurrence_date: parseDate(row[2]),
      source: String(row[3] || '').trim() || null,
      description_raw: descriptionRaw,
      status: String(row[9] || '').trim() || 'Reported',
      assigned_department: String(row[10] || '').trim() || null,
      report_type: reportType,
      severity: null,
      probability: null,
      risk_level: null,
      is_voluntary: reportType === 'VSR',
      reporter_role: reportType === 'VSR' ? 'reporter' : null,
    });
  }

  return signals;
}

// ─── Occurrence Log ────────────────────────────────────────────────────

async function processOccurrenceSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (data.length < 5) return signals;

  const headers = data[3];
  const h = {};
  headers.forEach((col, idx) => { if (col) h[col.toString().trim()] = idx; });

  const dateCol =
    h['Reported Date/  Date of Occ'] ||
    h['Reported Date/ Date of Occ'] ||
    h['Reported Date'] ||
    h['Date of Occ'];

  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Occurrence Code']]) continue;

    const descriptionRaw = String(row[h['Unsafe Event']] || '').trim();
    const priority = row[h['Report Priority Level'] || h['Report  Prority Level']];
    const severity = priorityToSeverity(priority);

    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Occurrence Code']]).trim(),
      occurrence_date: parseDate(dateCol != null ? row[dateCol] : null),
      description_raw: descriptionRaw,
      source: String(row[h['Sources of Information']] || '').trim() || null,
      report_type: 'MOR',
      severity,
      probability: null,
      risk_level: severity ? severity * 3 : null,
      is_voluntary: false,
      reporter_role: null,
    });
  }

  return signals;
}

// ─── Hazard Logsheet ──────────────────────────────────────────────────

async function processHazardSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (data.length < 5) return signals;

  const headers = data[3];
  const h = {};
  headers.forEach((col, idx) => { if (col) h[col.toString().trim()] = idx; });

  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Hazard code/ID']]) continue;

    const descriptionRaw = String(row[h['Unsafe Event (UE) (Reported/Projected)']] || row[h['Hazard Description']] || '').trim();
    const priority = row[h['Report prority Level (H/M/L)']] || row[h['Priority Level']];
    const severity = priorityToSeverity(priority);

    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Hazard code/ID']]).trim(),
      occurrence_date: parseDate(row[h['Reported Date']]),
      description_raw: descriptionRaw,
      source: String(row[h['Sources of infromation']] || row[h['Sources of information']] || '').trim() || null,
      report_type: 'HAZARD',
      severity,
      probability: null,
      risk_level: severity ? severity * 3 : null,
      is_voluntary: false,
      reporter_role: null,
    });
  }

  return signals;
}

// ─── Safety Deficiencies ──────────────────────────────────────────────

async function processSafetyDeficiencySheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (data.length < 5) return signals;

  const headers = data[3];
  const h = {};
  headers.forEach((col, idx) => { if (col) h[col.toString().trim()] = idx; });

  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Hazard code/ID']]) continue;

    const descriptionRaw = String(row[h['Unsafe Event (UE) (Reported/Projected)']] || row[h['Description']] || '').trim();
    const priority = row[h['Report prority Level (H/M/L)']] || row[h['Priority Level']];
    const severity = priorityToSeverity(priority);

    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Hazard code/ID']]).trim(),
      occurrence_date: parseDate(row[h['Reported Date']]),
      description_raw: descriptionRaw,
      source: String(row[h['Sources of infromation']] || row[h['Sources of information']] || '').trim() || null,
      report_type: 'SAFETY_DEFICIENCY',
      severity,
      probability: null,
      risk_level: severity ? severity * 3 : null,
      is_voluntary: false,
      reporter_role: null,
    });
  }

  return signals;
}

// ─── Flight Diversion ─────────────────────────────────────────────────

async function processDiversionSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (data.length < 5) return signals;

  const headers = data[3];
  const h = {};
  headers.forEach((col, idx) => { if (col) h[col.toString().trim()] = idx; });

  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['S.N']]) continue;

    const parts = [
      row[h['Flight Number']],
      row[h['Flight Sector']],
      row[h['Diverted to']],
      row[h['Reason  of diversion']],
      row[h['Remarks']],
    ].filter(Boolean).map(String).join(' | ');

    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['S.N']]).trim(),
      occurrence_date: parseDate(row[h['Date of Occurrence']]),
      description_raw: parts || null,
      report_type: 'DIVERSION',
      severity: 3,
      probability: 3,
      risk_level: 9,
      is_voluntary: false,
      reporter_role: null,
    });
  }

  return signals;
}

// ─── Main entry point ─────────────────────────────────────────────────

async function parseExcelFile(fileBuffer, tenantId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, defval: '' });
  const results = {
    success: true,
    sheets_processed: [],
    total_signals_imported: 0,
    by_type: { MOR: 0, VSR: 0, HAZARD: 0, SAFETY_DEFICIENCY: 0, DIVERSION: 0 },
    errors: [],
    signals: [],
  };

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    let signals = [];

    try {
      if (sheetName.includes('Master logsheet')) {
        signals = await processMasterSheet(worksheet, tenantId);
        results.sheets_processed.push('Master logsheet');
      } else if (sheetName.includes('Occurrence')) {
        signals = await processOccurrenceSheet(worksheet, tenantId);
        results.sheets_processed.push('Occurrence-Log-sheet');
      } else if (sheetName.includes('Hazard')) {
        signals = await processHazardSheet(worksheet, tenantId);
        results.sheets_processed.push('Hazard-logsheet');
      } else if (sheetName.includes('Safety defi')) {
        signals = await processSafetyDeficiencySheet(worksheet, tenantId);
        results.sheets_processed.push('Safety defi');
      } else if (sheetName.includes('Flight diversion')) {
        signals = await processDiversionSheet(worksheet, tenantId);
        results.sheets_processed.push('Flight diversion report');
      } else if (sheetName.includes('Risk Register')) {
        results.sheets_processed.push('Risk Register (skipped — reference only)');
        continue;
      } else {
        results.sheets_processed.push(`${sheetName} (unrecognized — skipped)`);
        continue;
      }

      for (const signal of signals) {
        if (signal.description_raw) {
          const redacted = redactPII(signal.description_raw);
          signal.description_raw = redacted;
        }
        if (signal.occurrence_date) {
          signal.occurrence_date = dateToWeekMonday(signal.occurrence_date);
        }
        if (results.by_type[signal.report_type] !== undefined) {
          results.by_type[signal.report_type]++;
        }
      }

      results.signals.push(...signals);
      results.total_signals_imported += signals.length;
    } catch (error) {
      results.errors.push(`Error processing sheet "${sheetName}": ${error.message}`);
    }
  }

  if (results.errors.length > 0) {
    results.success = false;
  }

  return results;
}

module.exports = { parseExcelFile, parseDate, priorityToSeverity, detectReportTypeFromCheckmarks };
