/**
 * Low-level spreadsheet access: opening the workbook, creating master and
 * customer sheets, header-mapped batch reads/writes and the dataset cache.
 *
 * Records are always located by their ID column, never by a remembered row
 * number. Row numbers (`_row`) are only used inside a single locked
 * operation, immediately after the sheet has been re-read.
 */

function getSpreadsheet() {
  if (PBM._memo.ss) return PBM._memo.ss;
  var id = PropertiesService.getScriptProperties().getProperty(PBM.PROP.SPREADSHEET_ID);
  var ss = null;
  try {
    ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    console.error('openSpreadsheet failed: ' + e);
    fail('CONFIG_ERROR', 'The business spreadsheet could not be opened. Check the SPREADSHEET_ID script property and that the script owner can edit the spreadsheet.');
  }
  if (!ss) fail('CONFIG_ERROR', 'The business spreadsheet is not configured. Set the SPREADSHEET_ID script property and run setup().');
  PBM._memo.ss = ss;
  return ss;
}

function getMasterSheet(name) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    ensureMasterSheets();
    sh = ss.getSheetByName(name);
  }
  if (!sh) fail('CONFIG_ERROR', 'Required sheet "' + name + '" is missing. Run setup() from the Apps Script editor.');
  return sh;
}

/** Creates Settings, Clients, AuditLog and Dashboard if they do not exist. Idempotent. */
function ensureMasterSheets() {
  var ss = getSpreadsheet();
  ensureSheetWithHeaders(ss, PBM.SHEETS.CLIENTS, PBM.CLIENT_HEADERS, PBM.CLIENT_FORMATS);
  ensureSheetWithHeaders(ss, PBM.SHEETS.SETTINGS, PBM.SETTINGS_HEADERS, {});
  ensureSheetWithHeaders(ss, PBM.SHEETS.AUDIT, PBM.AUDIT_HEADERS, {});
  if (!ss.getSheetByName(PBM.SHEETS.DASHBOARD)) {
    var d = ss.insertSheet(PBM.SHEETS.DASHBOARD);
    d.getRange(1, 1, 6, 2).setValues([
      ['Poultry Business Manager', ''],
      ['This tab is informational. All financial totals are calculated live by the app from the Clients sheet and each customer tab, so they can never drift out of date.', ''],
      ['', ''],
      ['Active customers', '=COUNTIF(Clients!G:G,"ACTIVE")'],
      ['Inactive (archived) customers', '=COUNTIF(Clients!G:G,"INACTIVE")'],
      ['Total customers', '=MAX(0,COUNTA(Clients!A:A)-1)']
    ]);
    d.getRange(1, 1).setFontWeight('bold');
  }
}

/** Gets or creates a sheet and writes its header row exactly once. */
function ensureSheetWithHeaders(ss, name, headers, formats) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var first = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var hasHeader = first.some(function (v) { return v !== '' && v !== null; });
  if (!hasHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else {
    // Append any header that a newer app version needs but the sheet lacks.
    var missing = headers.filter(function (h) { return first.indexOf(h) === -1; });
    if (missing.length) {
      var start = sh.getLastColumn() + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
    }
  }
  return sh;
}

/** Reads a whole sheet into header-keyed objects (one batch read). */
function readTable(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { header: [], rows: [] };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  return valuesToTable(values);
}

function valuesToTable(values) {
  if (!values || !values.length) return { header: [], rows: [] };
  var header = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var empty = true;
    var obj = { _row: r + 1 };
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      var v = c < row.length ? row[c] : '';
      if (v === null || v === undefined) v = '';
      if (v !== '') empty = false;
      obj[header[c]] = v;
    }
    if (!empty) rows.push(obj);
  }
  return { header: header, rows: rows };
}

function objectToRow(obj, header) {
  return header.map(function (h) {
    if (!h || !Object.prototype.hasOwnProperty.call(obj, h)) return '';
    var v = obj[h];
    if (v === null || v === undefined) return '';
    return typeof v === 'string' ? safeCellText(v) : v;
  });
}

function formatRowFor(header, formats) {
  return header.map(function (h) { return formats[h] || '@'; });
}

/** Appends rows using an explicit range so cell formats are always correct. */
function appendObjects(sh, header, objs, formats) {
  if (!objs.length) return;
  var start = sh.getLastRow() + 1;
  var needed = start + objs.length - 1;
  var maxRows = sh.getMaxRows();
  if (needed > maxRows) sh.insertRowsAfter(maxRows, Math.max(needed - maxRows, 200));
  var rows = objs.map(function (o) { return objectToRow(o, header); });
  var fmt = formatRowFor(header, formats || {});
  var fmts = objs.map(function () { return fmt.slice(); });
  var range = sh.getRange(start, 1, rows.length, header.length);
  range.setNumberFormats(fmts);
  range.setValues(rows);
}

/** Overwrites one existing row (located by ID just before, under lock). */
function writeObjectAt(sh, header, rowNumber, obj, formats) {
  var range = sh.getRange(rowNumber, 1, 1, header.length);
  range.setNumberFormats([formatRowFor(header, formats || {})]);
  range.setValues([objectToRow(obj, header)]);
}

// ------------------------------------------------------ customer sheets ----

function createTransactionSheet(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  ensureSheetWithHeaders(ss, sheetName, PBM.TXN_HEADERS, PBM.TXN_FORMATS);
  return sh;
}

/** Returns a unique, valid tab name for a customer, avoiding existing tabs. */
function uniqueSheetName(ss, customerId, customerName, ignoreName) {
  var base = buildSheetName(customerId, customerName);
  var name = base;
  var n = 2;
  var reserved = [PBM.SHEETS.SETTINGS, PBM.SHEETS.CLIENTS, PBM.SHEETS.AUDIT, PBM.SHEETS.DASHBOARD]
    .map(function (s) { return s.toLowerCase(); });
  while ((ss.getSheetByName(name) && name !== ignoreName) || reserved.indexOf(name.toLowerCase()) !== -1) {
    name = base.substring(0, 85) + ' (' + n + ')';
    n++;
  }
  return name;
}

// ------------------------------------------------------- dataset reads ----

function bumpDataVersion() {
  var props = PropertiesService.getScriptProperties();
  var v = parseInt(props.getProperty(PBM.PROP.DATA_VERSION) || '0', 10) + 1;
  props.setProperty(PBM.PROP.DATA_VERSION, String(v));
  PBM._memo.dataset = null;
  return v;
}

function getDataVersion() {
  return PropertiesService.getScriptProperties().getProperty(PBM.PROP.DATA_VERSION) || '0';
}

/** All customers from the Clients sheet as normalised objects. */
function readCustomers() {
  var t = readTable(getMasterSheet(PBM.SHEETS.CLIENTS));
  return { header: t.header, rows: t.rows.filter(function (r) { return r.customerId; }).map(customerFromRow) };
}

function customerFromRow(r) {
  return {
    customerId: String(r.customerId).trim(),
    customerName: String(r.customerName || '').trim(),
    phone: String(r.phone || '').trim(),
    address: String(r.address || ''),
    notes: String(r.notes || ''),
    createdAt: normalizeTimestampCell(r.createdAt),
    status: String(r.status || 'ACTIVE').trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    openingPaise: cellToPaise(r.openingBalance),
    sheetName: String(r.sheetName || '').trim(),
    updatedAt: normalizeTimestampCell(r.updatedAt),
    version: cellToInt(r.version) || 1,
    requestId: String(r.requestId || ''),
    createdBy: String(r.createdBy || ''),
    _row: r._row
  };
}

function txnFromRow(r, customerId) {
  var type = String(r.transactionType || '').trim().toUpperCase();
  return {
    transactionId: String(r.transactionId || '').trim(),
    customerId: customerId,
    transactionDate: normalizeDateCell(r.transactionDate),
    transactionType: type,
    birdCount: cellToInt(r.birdCount),
    grams: cellToGrams(r.weightKg),
    ratePaise: cellToPaise(r.ratePerKg),
    billPaise: cellToPaise(r.billAmount),
    paymentPaise: cellToPaise(r.paymentAmount),
    paymentMethod: String(r.paymentMethod || '').trim().toUpperCase(),
    referenceNumber: String(r.referenceNumber || ''),
    notes: String(r.notes || ''),
    createdAt: normalizeTimestampCell(r.createdAt),
    updatedAt: normalizeTimestampCell(r.updatedAt),
    createdBy: String(r.createdBy || ''),
    status: String(r.status || 'ACTIVE').trim().toUpperCase() === 'VOID' ? 'VOID' : 'ACTIVE',
    version: cellToInt(r.version) || 1,
    requestId: String(r.requestId || ''),
    updatedBy: String(r.updatedBy || ''),
    voidedAt: normalizeTimestampCell(r.voidedAt),
    voidedBy: String(r.voidedBy || ''),
    voidReason: String(r.voidReason || ''),
    _row: r._row
  };
}

function txnToRowObject(t) {
  var isBill = t.transactionType === 'BILL';
  var isPay = t.transactionType === 'PAYMENT';
  return {
    transactionId: t.transactionId,
    transactionDate: t.transactionDate,
    transactionType: t.transactionType,
    birdCount: isBill ? t.birdCount : '',
    weightKg: isBill ? t.grams / 1000 : '',
    ratePerKg: isBill ? paiseToRupees(t.ratePaise) : '',
    billAmount: isPay ? '' : (t.billPaise ? paiseToRupees(t.billPaise) : (isBill ? 0 : '')),
    paymentAmount: isBill ? '' : (t.paymentPaise ? paiseToRupees(t.paymentPaise) : (isPay ? 0 : '')),
    paymentMethod: isPay ? t.paymentMethod : '',
    referenceNumber: t.referenceNumber || '',
    notes: t.notes || '',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy,
    status: t.status,
    version: t.version,
    requestId: t.requestId || '',
    updatedBy: t.updatedBy || '',
    voidedAt: t.voidedAt || '',
    voidedBy: t.voidedBy || '',
    voidReason: t.voidReason || ''
  };
}

/** Parses raw values of one customer tab into transactions. */
function parseTxnValues(values, customerId) {
  var t = valuesToTable(values);
  var txns = [];
  var unidentified = 0;
  t.rows.forEach(function (r) {
    var x = txnFromRow(r, customerId);
    if (!x.transactionId || PBM.TXN_TYPES.indexOf(x.transactionType) === -1 || !x.transactionDate) {
      unidentified++;
      return;
    }
    txns.push(x);
  });
  return { header: t.header, txns: txns, unidentified: unidentified };
}

function readCustomerSheet(ss, customer) {
  var sh = customer.sheetName ? ss.getSheetByName(customer.sheetName) : null;
  if (!sh) return { sheet: null, missing: true, header: [], txns: [], unidentified: 0 };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var values = lastRow && lastCol ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [];
  var parsed = parseTxnValues(values, customer.customerId);
  parsed.sheet = sh;
  parsed.missing = false;
  return parsed;
}

/**
 * Loads every customer and every transaction.
 * - Uses one Sheets API batchGet call per 80 tabs when the Advanced Sheets
 *   service is enabled (much faster than opening tabs one by one).
 * - Falls back to SpreadsheetApp per tab otherwise, or if a tab is missing.
 * - Caches the parsed dataset for a few minutes, keyed by a data version that
 *   every write through the API increments. Pass fresh=true to bypass (e.g.
 *   after editing the spreadsheet by hand).
 */
function loadDataset(fresh) {
  if (PBM._memo.dataset && !fresh) return PBM._memo.dataset;
  var version = getDataVersion();
  if (!fresh) {
    var cached = readDatasetCache(version);
    if (cached) {
      PBM._memo.dataset = cached;
      return cached;
    }
  }
  var ss = getSpreadsheet();
  var customers = readCustomers().rows;
  var byCustomer = {};
  var missingSheets = [];
  var unidentified = {};
  var pending = customers.slice();

  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    var chunkSize = 80;
    var leftovers = [];
    for (var i = 0; i < pending.length; i += chunkSize) {
      var chunk = pending.slice(i, i + chunkSize).filter(function (c) { return c.sheetName; });
      if (!chunk.length) continue;
      try {
        var resp = Sheets.Spreadsheets.Values.batchGet(ss.getId(), {
          ranges: chunk.map(function (c) { return "'" + c.sheetName.replace(/'/g, "''") + "'!A1:Z"; }),
          valueRenderOption: 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER'
        });
        (resp.valueRanges || []).forEach(function (vr, idx) {
          var p = parseTxnValues(vr.values || [], chunk[idx].customerId);
          byCustomer[chunk[idx].customerId] = p.txns;
          if (p.unidentified) unidentified[chunk[idx].customerId] = p.unidentified;
        });
      } catch (e) {
        // Usually a missing/renamed tab; read this chunk tab by tab instead.
        leftovers = leftovers.concat(chunk);
      }
    }
    pending = leftovers.concat(pending.filter(function (c) { return !c.sheetName; }));
  }

  pending.forEach(function (c) {
    var p = readCustomerSheet(ss, c);
    if (p.missing) missingSheets.push(c.customerId);
    byCustomer[c.customerId] = p.txns;
    if (p.unidentified) unidentified[c.customerId] = p.unidentified;
  });

  customers.forEach(function (c) { if (!byCustomer[c.customerId]) byCustomer[c.customerId] = []; });

  var ds = {
    version: version,
    loadedAt: nowIso(),
    customers: customers,
    txnsByCustomer: byCustomer,
    missingSheets: missingSheets,
    unidentified: unidentified
  };
  writeDatasetCache(version, ds);
  PBM._memo.dataset = ds;
  return ds;
}

var DATASET_CHUNK = 90000;

function readDatasetCache(version) {
  try {
    var cache = CacheService.getScriptCache();
    var head = cache.get('ds:' + version + ':n');
    if (!head) return null;
    var n = parseInt(head, 10);
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('ds:' + version + ':' + i);
    var parts = cache.getAll(keys);
    var json = '';
    for (var j = 0; j < n; j++) {
      if (!parts[keys[j]]) return null;
      json += parts[keys[j]];
    }
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function writeDatasetCache(version, ds) {
  try {
    var json = JSON.stringify(ds);
    var n = Math.ceil(json.length / DATASET_CHUNK);
    if (n > 40) return; // too large to cache usefully; read live instead
    var map = {};
    for (var i = 0; i < n; i++) map['ds:' + version + ':' + i] = json.substring(i * DATASET_CHUNK, (i + 1) * DATASET_CHUNK);
    map['ds:' + version + ':n'] = String(n);
    CacheService.getScriptCache().putAll(map, PBM.DATASET_CACHE_SECONDS);
  } catch (e) {
    console.warn('Dataset cache skipped: ' + e);
  }
}

/** Runs fn while holding the script-wide lock; flushes writes before release. */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PBM.LOCK_WAIT_MS)) {
    fail('LOCK_TIMEOUT', 'The system is busy saving another entry. Please try again in a few seconds.');
  }
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}
