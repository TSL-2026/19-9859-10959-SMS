const XLSX = require('xlsx');

const FILE_TYPE_PATTERNS = {
  MOR: /\bmor\b/i,
  VSR: /\bvsr\b/i,
  Hazard: /\bhazard\b/i,
};

const DEFAULT_COLUMN_MAPS = {
  MOR: {
    report_id: 'Report ID',
    occurrence_date: 'Occurrence Date',
    severity: 'Severity',
    probability: 'Probability',
    description_raw: 'Description',
  },
  VSR: {
    report_id: 'VSR ID',
    occurrence_date: 'Date',
    severity: 'Severity Rating',
    probability: 'Probability Rating',
    description_raw: 'Narrative',
    reporter_role: 'Reporter Role',
  },
  Hazard: {
    report_id: 'Hazard ID',
    occurrence_date: 'Date Identified',
    severity: 'Severity',
    probability: 'Likelihood',
    description_raw: 'Hazard Description',
  },
};

function detectFileType(filename) {
  for (const [type, pattern] of Object.entries(FILE_TYPE_PATTERNS)) {
    if (pattern.test(filename)) {
      return type;
    }
  }
  return null;
}

function buildColumnMap(worksheet, reportType, tenantOverrides = {}) {
  const headerRow = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
  if (!headerRow) {
    throw new Error('Empty worksheet');
  }

  const defaults = DEFAULT_COLUMN_MAPS[reportType];
  const overrides = tenantOverrides[reportType] || {};
  const merged = { ...defaults, ...overrides };

  const map = {};
  for (const [field, expectedLabel] of Object.entries(merged)) {
    const idx = headerRow.findIndex(
      (h) => h && h.toString().trim().toLowerCase() === expectedLabel.toString().trim().toLowerCase()
    );
    if (idx !== -1) {
      map[field] = idx;
    }
  }

  if (!map.severity || !map.probability) {
    throw new Error(`Required columns (severity, probability) not found in ${reportType} file`);
  }

  return { headerRow, map };
}

function validateSeverity(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error(`Invalid severity value: ${val} — must be integer 1-5`);
  }
  return n;
}

function validateProbability(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error(`Invalid probability value: ${val} — must be integer 1-5`);
  }
  return n;
}

function parse(buffer, filename, tenantColumnOverrides = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const reportType = detectFileType(filename);
  if (!reportType) {
    throw new Error(`Unrecognized file type. Filename must contain MOR, VSR, or Hazard. Got: ${filename}`);
  }

  const { headerRow, map } = buildColumnMap(worksheet, reportType, tenantColumnOverrides);
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const signals = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === undefined || c === null || c === '')) {
      continue;
    }

    const severity = validateSeverity(row[map.severity]);
    const probability = validateProbability(row[map.probability]);
    const riskLevel = severity * probability;

    const signal = {
      report_id: map.report_id != null ? String(row[map.report_id] || '') : '',
      report_type: reportType,
      occurrence_date: map.occurrence_date != null ? row[map.occurrence_date] : null,
      severity,
      probability,
      risk_level: riskLevel,
      description_raw: map.description_raw != null ? String(row[map.description_raw] || '') : '',
      is_voluntary: reportType === 'VSR',
      reporter_role: map.reporter_role != null ? String(row[map.reporter_role] || '').toLowerCase().trim() : null,
    };

    if (signal.occurrence_date && typeof signal.occurrence_date === 'number') {
      const parsed = XLSX.SSF.parse_date_code(signal.occurrence_date);
      if (parsed) {
        const { y, m, d } = parsed;
        signal.occurrence_date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    signals.push(signal);
  }

  return { reportType, signals };
}

module.exports = { parse, detectFileType, FILE_TYPE_PATTERNS, DEFAULT_COLUMN_MAPS };
