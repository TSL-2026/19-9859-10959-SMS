const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text) {
  if (!text) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { ciphertext: encrypted, iv: iv.toString('hex'), auth_tag: authTag };
}

function redactPII(text) {
  if (!text) return text;
  return text
    .replace(
      /(Pilot|Co-Pilot|Crew Member|Passenger|Captain|First Officer|Officer|Engineer|Flight Attendant|Technician|Inspector|Doctor|Nurse|Patient|Controller|Dispatcher)\s*[:\-]?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g,
      '$1: [REDACTED]'
    )
    .replace(/\b[A-Z]{2,3}\d{1,4}\b/g, '[REDACTED]')
    .replace(/\bN\d{4,5}\b/g, '[REDACTED]');
}

function dateToWeekMonday(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split('T')[0];
}

function extractAndRedact(signal) {
  const redactedSignal = {
    ...signal,
    report_id: redactPII(signal.report_id || ''),
    description_raw: redactPII(signal.description_raw || ''),
    occurrence_date: dateToWeekMonday(signal.occurrence_date),
  };

  const piiPayload = JSON.stringify({
    report_id: signal.report_id || null,
    description_raw: signal.description_raw || null,
    occurrence_date: signal.occurrence_date || null,
  });

  const encryptedData = encrypt(piiPayload);

  return { redactedSignal, encryptedData };
}

module.exports = { encrypt, redactPII, dateToWeekMonday, extractAndRedact };
