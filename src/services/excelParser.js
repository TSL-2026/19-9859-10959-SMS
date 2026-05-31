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
  const serial = Number(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
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

function extractYear(filename) {
  if (!filename) return 'unknown';
  const m = filename.match(/(\d{4})/);
  return m ? m[1] : 'unknown';
}

function findHeaderRow(data, expectedNames) {
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;
    const matches = expectedNames.filter(name => {
      const lower = name.toLowerCase();
      return row.some(c => c && c.toString().trim().toLowerCase().includes(lower));
    });
    if (matches.length >= 2) return i;
  }
  return -1;
}

function buildColIndex(headers) {
  const h = {};
  headers.forEach((col, idx) => {
    if (col) h[col.toString().trim()] = idx;
  });
  return h;
}

// ─── Sheet matching patterns ─────────────────────────────────────────

function classifySheet(name) {
  const s = name.toLowerCase().trim();
  if (s.includes('master') && s.includes('logsheet')) return 'master';
  if (s.includes('occurrence') && s.includes('log')) return 'occurrence';
  if (s.includes('hazard') && s.includes('logsheet')) return 'hazard';
  if (s.includes('safety defi') || s.includes('safety deficiency')) return 'safety_defi';
  if (s.includes('flight diversion')) return 'diversion';
  if (s.includes('risk register')) return 'risk_register';
  return null;
}

// ─── Master Logsheet ──────────────────────────────────────────────────

async function processMasterSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const headerRow = findHeaderRow(data, [
    'S.N', 'Reported Date', 'Sources of Information',
    'Report Description', 'Status', 'Occurrence',
    'Hazard', 'Safety deficiency', 'Diversion',
  ]);
  if (headerRow === -1) return signals;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    const extId = String(row[1] || '').trim();
    if (!extId) continue;
    signals.push({
      tenant_id: tenantId,
      external_id: extId,
      occurrence_date: parseDate(row[2]),
      source: String(row[3] || '').trim() || null,
      description_raw: String(row[4] || '').trim(),
      status: (function(s) { s = s.trim(); if (!s) return 'Reported'; var m = { 'closed': 'closed', 'dismissed': 'dismissed', 'new': 'new', 'reviewed': 'reviewed', 'reported': 'Reported', 'n/a': 'N/A', 'na': 'N/A', 'open': 'new' }; return m[s.toLowerCase()] || 'Reported'; })(String(row[9] || '')),
      assigned_department: String(row[10] || '').trim() || null,
      report_type: detectReportTypeFromCheckmarks(row),
      severity: null,
      probability: null,
      risk_level: null,
      is_voluntary: detectReportTypeFromCheckmarks(row) === 'VSR',
      reporter_role: detectReportTypeFromCheckmarks(row) === 'VSR' ? 'reporter' : null,
    });
  }
  return signals;
}

// ─── Occurrence Log ────────────────────────────────────────────────────

async function processOccurrenceSheet(worksheet, tenantId) {
  const signals = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const headerRow = findHeaderRow(data, [
    'Occurrence Code', 'Reported Date', 'Unsafe Event',
    'Sources of Information', 'Report Priority Level',
  ]);
  if (headerRow === -1) return signals;

  const h = buildColIndex(data[headerRow]);
  const dateCol = h['Reported Date/  Date of Occ'] ||
    h['Reported Date/ Date of Occ'] ||
    h['Reported Date'] ||
    h['Date of Occ'];

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Occurrence Code']]) continue;
    const priority = row[h['Report Priority Level']] || row[h['Report  Prority Level']];
    const severity = priorityToSeverity(priority);
    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Occurrence Code']]).trim(),
      occurrence_date: parseDate(dateCol != null ? row[dateCol] : null),
      description_raw: String(row[h['Unsafe Event']] || '').trim(),
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
  const headerRow = findHeaderRow(data, [
    'Hazard code/ID', 'Reported Date', 'Unsafe Event',
    'Report prority Level', 'Priority Level', 'Sources of infromation',
  ]);
  if (headerRow === -1) return signals;

  const h = buildColIndex(data[headerRow]);

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Hazard code/ID']]) continue;
    const priority = row[h['Report prority Level (H/M/L)']] || row[h['Priority Level']];
    const severity = priorityToSeverity(priority);
    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Hazard code/ID']]).trim(),
      occurrence_date: parseDate(row[h['Reported Date']]),
      description_raw: String(
        row[h['Unsafe Event (UE) (Reported/Projected)']] ||
        row[h['Hazard Description']] || ''
      ).trim(),
      source: String(
        row[h['Sources of infromation']] ||
        row[h['Sources of information']] || ''
      ).trim() || null,
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
  const headerRow = findHeaderRow(data, [
    'Hazard code/ID', 'Reported Date', 'Unsafe Event',
    'Report prority Level', 'Priority Level', 'Description',
  ]);
  if (headerRow === -1) return signals;

  const h = buildColIndex(data[headerRow]);

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (!row[h['Hazard code/ID']]) continue;
    const priority = row[h['Report prority Level (H/M/L)']] || row[h['Priority Level']];
    const severity = priorityToSeverity(priority);
    signals.push({
      tenant_id: tenantId,
      external_id: String(row[h['Hazard code/ID']]).trim(),
      occurrence_date: parseDate(row[h['Reported Date']]),
      description_raw: String(
        row[h['Unsafe Event (UE) (Reported/Projected)']] ||
        row[h['Description']] || ''
      ).trim(),
      source: String(
        row[h['Sources of infromation']] ||
        row[h['Sources of information']] || ''
      ).trim() || null,
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
  const headerRow = findHeaderRow(data, [
    'S.N', 'Date of Occurrence', 'Flight Number',
    'Flight Sector', 'Reason of diversion', 'Diverted to',
  ]);
  if (headerRow === -1) return signals;

  const h = buildColIndex(data[headerRow]);

  for (let i = headerRow + 1; i < data.length; i++) {
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

// ─── Processor dispatch ───────────────────────────────────────────────

const PROCESSORS = {
  master: processMasterSheet,
  occurrence: processOccurrenceSheet,
  hazard: processHazardSheet,
  safety_defi: processSafetyDeficiencySheet,
  diversion: processDiversionSheet,
};

// ─── Main entry point ─────────────────────────────────────────────────

async function parseExcelFile(fileBuffer, tenantId, filename) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, defval: '' });
  const year = extractYear(filename);
  const results = {
    success: true,
    year,
    filename,
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
      const type = classifySheet(sheetName);
      if (!type) {
        results.sheets_processed.push(`${sheetName} (unrecognized — skipped)`);
        continue;
      }
      if (type === 'risk_register') {
        results.sheets_processed.push(`${sheetName} (skipped — reference only)`);
        continue;
      }

      signals = await PROCESSORS[type](worksheet, tenantId);
      results.sheets_processed.push(`${sheetName} (${signals.length} signals)`);

      for (const signal of signals) {
        if (signal.description_raw) {
          signal.description_raw = redactPII(signal.description_raw);
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

  if (results.errors.length > 0) results.success = false;
  return results;
}

async function parseMultipleExcelFiles(files, tenantId) {
  const combined = {
    files: [],
    total_signals_imported: 0,
    by_year: {},
    by_type: { MOR: 0, VSR: 0, HAZARD: 0, SAFETY_DEFICIENCY: 0, DIVERSION: 0 },
    errors: [],
  };

  for (const file of files) {
    const result = await parseExcelFile(file.buffer, tenantId, file.originalname);
    combined.files.push({
      filename: file.originalname,
      year: result.year,
      success: result.success,
      sheets_processed: result.sheets_processed,
      total_signals_imported: result.total_signals_imported,
      by_type: result.by_type,
      errors: result.errors,
      signals: result.signals,
    });

    combined.total_signals_imported += result.total_signals_imported;
    if (!combined.by_year[result.year]) combined.by_year[result.year] = 0;
    combined.by_year[result.year] += result.total_signals_imported;
    for (const [t, c] of Object.entries(result.by_type)) {
      combined.by_type[t] += c;
    }
    if (result.errors.length > 0) {
      combined.errors.push(...result.errors.map(e => `[${file.originalname}] ${e}`));
    }
  }

  return combined;
}

module.exports = {
  parseExcelFile, parseMultipleExcelFiles,
  parseDate, priorityToSeverity, detectReportTypeFromCheckmarks,
};
