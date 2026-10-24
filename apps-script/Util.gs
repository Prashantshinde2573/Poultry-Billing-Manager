/**
 * Shared helpers: errors, validation, exact decimal money maths, dates.
 *
 * MONEY RULE: every amount is handled internally as an integer number of
 * paise (1 rupee = 100 paise) and every weight as an integer number of grams.
 * Rupees/kilograms only appear when values are written to the sheet or sent
 * to the browser. This avoids floating-point rounding errors.
 */

// ---------------------------------------------------------------- errors ---

function ApiError(code, message, details) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message;
  this.details = details;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function fail(code, message, details) {
  throw new ApiError(code, message, details);
}

function validationError(message, field) {
  throw new ApiError('VALIDATION_ERROR', message, field ? { field: field } : undefined);
}

// ------------------------------------------------------------ validation ---

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function reqString(v, field, label, opts) {
  opts = opts || {};
  if (isBlank(v)) validationError(label + ' is required', field);
  return optString(v, field, label, opts);
}

function optString(v, field, label, opts) {
  opts = opts || {};
  if (isBlank(v)) return '';
  if (typeof v !== 'string' && typeof v !== 'number') validationError(label + ' must be text', field);
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  var max = opts.max || 500;
  var min = opts.min || 0;
  if (s.length > max) validationError(label + ' must be at most ' + max + ' characters', field);
  if (s.length < min) validationError(label + ' must be at least ' + min + ' characters', field);
  if (opts.pattern && !opts.pattern.test(s)) validationError(label + ' is not valid', field);
  return s;
}

function reqEnum(v, field, label, allowed) {
  if (isBlank(v)) validationError(label + ' is required', field);
  var s = String(v).trim().toUpperCase();
  if (allowed.indexOf(s) === -1) validationError(label + ' must be one of: ' + allowed.join(', '), field);
  return s;
}

function optBool(v) {
  return v === true || v === 'true';
}

/**
 * Parses a non-negative (or, with allowNegative, signed) decimal with at most
 * `decimals` fractional digits into an exact integer scaled by 10^decimals.
 * e.g. parseScaled('135.8', 3) === 135800 ; parseScaled(114, 2) === 11400
 */
function parseScaled(v, decimals, field, label, opts) {
  opts = opts || {};
  if (isBlank(v)) validationError(label + ' is required', field);
  if (typeof v !== 'number' && typeof v !== 'string') validationError(label + ' must be a number', field);
  if (typeof v === 'number' && !isFinite(v)) validationError(label + ' must be a number', field);
  var s = String(v).trim().replace(/,/g, '');
  if (/e/i.test(s)) validationError(label + ' is out of range', field);
  var m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) validationError(label + ' must be a valid number', field);
  var neg = !!m[1];
  if (neg && !opts.allowNegative) validationError(label + ' cannot be negative', field);
  var frac = m[3] || '';
  // Allow trailing zeros beyond precision (e.g. "10.500" for 2 decimals)
  frac = frac.replace(/0+$/, '');
  if (frac.length > decimals) validationError(label + ' can have at most ' + decimals + ' decimal places', field);
  while (frac.length < decimals) frac += '0';
  var intPart = m[2].replace(/^0+(?=\d)/, '');
  if (intPart.length > 12) validationError(label + ' is too large', field);
  var n = parseInt(intPart + frac, 10);
  if (neg) n = -n;
  if (opts.max !== undefined && Math.abs(n) > opts.max) validationError(label + ' is too large', field);
  if (opts.positive && n <= 0) validationError(label + ' must be greater than zero', field);
  return n;
}

function parseInteger(v, field, label, opts) {
  opts = opts || {};
  if (isBlank(v)) {
    if (opts.defaultValue !== undefined) return opts.defaultValue;
    validationError(label + ' is required', field);
  }
  var s = String(v).trim();
  if (!/^\d+$/.test(s)) validationError(label + ' must be a whole number (0 or more)', field);
  var n = parseInt(s, 10);
  if (opts.max !== undefined && n > opts.max) validationError(label + ' is too large', field);
  return n;
}

function reqCustomerId(v) {
  return reqString(v, 'customerId', 'Customer', { max: 20, pattern: /^C\d{4,10}$/ });
}

function reqTransactionId(v) {
  return reqString(v, 'transactionId', 'Transaction', { max: 40, pattern: /^T\d{8}-[A-F0-9]{8,12}$/ });
}

function reqRequestId(v) {
  return reqString(v, 'requestId', 'Request ID', { min: 8, max: 64, pattern: /^[A-Za-z0-9_-]+$/ });
}

function reqVersion(v) {
  return parseInteger(v, 'expectedVersion', 'Record version', { max: 1000000 });
}

/** Indian-first phone normaliser. Returns E.164-like "+919876543210". */
function normalizePhone(v, required) {
  if (isBlank(v)) {
    if (required) validationError('Mobile number is required', 'phone');
    return '';
  }
  var raw = String(v).trim();
  var hasPlus = raw.charAt(0) === '+';
  var digits = raw.replace(/\D/g, '');
  if (!hasPlus) {
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 11 && digits.charAt(0) === '0') return '+91' + digits.substring(1);
    if (digits.length === 12 && digits.indexOf('91') === 0) return '+' + digits;
    validationError('Enter a 10-digit mobile number, or include the country code with +', 'phone');
  }
  if (digits.length < 8 || digits.length > 15) validationError('Mobile number is not valid', 'phone');
  return '+' + digits;
}

// --------------------------------------------------------------- money -----

function paiseToRupees(p) {
  return Math.round(p) / 100;
}

/** Reads a rupee value stored in a cell (number or text) as integer paise. */
function cellToPaise(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[,₹\s]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

function cellToGrams(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 1000);
}

function cellToInt(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}

/**
 * Bill amount in paise = weight(grams) × rate(paise per kg) ÷ 1000,
 * rounded half-up to the nearest paisa. All operands are exact integers.
 */
function computeBillPaise(grams, ratePaise) {
  var product = grams * ratePaise;            // < 2^53 given LIMITS
  return Math.floor((product + 500) / 1000);
}

// --------------------------------------------------------------- dates -----

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  return Utilities.formatDate(new Date(), PBM.TZ, 'yyyy-MM-dd');
}

function isoToBusinessDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, PBM.TZ, 'yyyy-MM-dd');
}

function isValidYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
}

function reqDate(v, field, label, opts) {
  opts = opts || {};
  if (isBlank(v)) validationError(label + ' is required', field);
  var s = String(v).trim();
  if (!isValidYmd(s)) validationError(label + ' must be a valid date (YYYY-MM-DD)', field);
  if (s < PBM.MIN_DATE) validationError(label + ' is too far in the past', field);
  if (opts.notFuture && s > todayStr()) validationError(label + ' cannot be in the future', field);
  return s;
}

function ymdToUtc(s) {
  var p = s.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}

function utcToYmd(d) {
  var y = d.getUTCFullYear();
  var m = d.getUTCMonth() + 1;
  var day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function addDays(s, n) {
  var d = ymdToUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToYmd(d);
}

/** First day of the month that is `n` months before the month of `s`. */
function firstOfMonthOffset(s, n) {
  var d = ymdToUtc(s);
  var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return utcToYmd(t);
}

/** ISO weekday: Monday = 1 … Sunday = 7 */
function isoWeekday(s) {
  var w = ymdToUtc(s).getUTCDay();
  return w === 0 ? 7 : w;
}

function daysBetween(a, b) {
  return Math.round((ymdToUtc(b).getTime() - ymdToUtc(a).getTime()) / 86400000);
}

/**
 * Normalises any date-like cell value (text, Date object or Sheets serial
 * number) to 'yyyy-MM-dd'. Returns '' if it cannot be understood.
 */
function normalizeDateCell(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, PBM.TZ, 'yyyy-MM-dd');
  }
  if (typeof v === 'number') {
    // Google Sheets serial date: days since 1899-12-30
    var base = Date.UTC(1899, 11, 30);
    return utcToYmd(new Date(base + Math.round(v) * 86400000));
  }
  var s = String(v).trim();
  if (isValidYmd(s)) return s;
  var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s); // dd/MM/yyyy (Indian format)
  if (m) {
    var cand = m[3] + '-' + (m[2].length === 1 ? '0' : '') + m[2] + '-' + (m[1].length === 1 ? '0' : '') + m[1];
    if (isValidYmd(cand)) return cand;
  }
  var iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (iso) return isoToBusinessDate(s);
  return '';
}

function normalizeTimestampCell(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
}

// ----------------------------------------------------------------- ids -----

function randomHex(len) {
  var hex = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  while (hex.length < len) hex += Utilities.getUuid().replace(/-/g, '').toUpperCase();
  return hex.substring(0, len);
}

function newTransactionId(dateStr) {
  return 'T' + dateStr.replace(/-/g, '') + '-' + randomHex(10);
}

function formatCustomerId(n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return 'C' + s;
}

/**
 * Builds a valid, unique tab name: "C0007 Rahul Sharma".
 * Removes characters Google Sheets forbids ([ ] * ? / \ :), apostrophes and
 * control characters, collapses spaces and keeps the name under the
 * 100-character tab-name limit. The ID prefix guarantees uniqueness even for
 * customers with identical names and avoids collisions with master sheets.
 */
function buildSheetName(customerId, customerName) {
  var clean = String(customerName || '')
    .replace(/[\[\]\*\?\/\\:]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  var name = clean ? customerId + ' ' + clean : customerId;
  if (name.length > 90) name = name.substring(0, 90).trim();
  return name;
}

/** Prevents user-entered text from being interpreted as a spreadsheet formula. */
function safeCellText(s) {
  if (typeof s !== 'string' || s === '') return s;
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function sha256Hex(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
