/**
 * Business settings stored as key/value rows in the Settings sheet.
 * Currency (INR) and timezone (Asia/Kolkata) are fixed by design.
 */

var SETTING_DEFS = {
  businessName: { type: 'string', max: 80, def: 'My Poultry Business' },
  businessPhone: { type: 'string', max: 30, def: '' },
  businessEmail: { type: 'string', max: 100, def: '' },
  businessAddress: { type: 'string', max: 200, def: '' },
  gstin: { type: 'string', max: 20, def: '' },
  defaultRatePerKg: { type: 'rate', def: '' },
  allowZeroRate: { type: 'bool', def: false },
  allowAdvancePayments: { type: 'bool', def: false },
  reportFooter: { type: 'string', max: 200, def: 'Thank you for your business.' },
  statementNote: { type: 'string', max: 300, def: '' },
  logoDataUrl: { type: 'logo', def: '' }
};

function readSettings() {
  if (PBM._memo.settings) return PBM._memo.settings;
  var out = {};
  Object.keys(SETTING_DEFS).forEach(function (k) { out[k] = SETTING_DEFS[k].def; });
  var t = readTable(getMasterSheet(PBM.SHEETS.SETTINGS));
  t.rows.forEach(function (r) {
    var key = String(r.key || '').trim();
    var def = SETTING_DEFS[key];
    if (!def) return;
    var v = r.value;
    if (def.type === 'bool') out[key] = v === true || String(v).toUpperCase() === 'TRUE';
    else if (def.type === 'rate') out[key] = v === '' ? '' : Number(v);
    else out[key] = String(v);
  });
  PBM._memo.settings = out;
  return out;
}

function settingsToApi(s) {
  var o = {};
  for (var k in s) o[k] = s[k];
  o.currency = 'INR';
  o.timezone = PBM.TZ;
  return o;
}

function actionGetSettings() {
  return settingsToApi(readSettings());
}

function actionUpdateSettings(payload, user) {
  requireOwner(user);
  var updates = {};
  Object.keys(payload || {}).forEach(function (key) {
    var def = SETTING_DEFS[key];
    if (!def) return; // ignore unknown keys (e.g. currency/timezone are fixed)
    var v = payload[key];
    if (def.type === 'string') updates[key] = optString(v, key, key, { max: def.max });
    else if (def.type === 'bool') updates[key] = optBool(v);
    else if (def.type === 'rate') updates[key] = isBlank(v) ? '' : paiseToRupees(parseScaled(v, 2, key, 'Default rate', { max: PBM.LIMITS.MAX_RATE_PAISE }));
    else if (def.type === 'logo') {
      var s = isBlank(v) ? '' : String(v);
      if (s && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(s)) validationError('Logo must be a PNG, JPEG or WEBP image', key);
      if (s.length > 45000) validationError('Logo image is too large (keep it under about 30 KB)', key);
      updates[key] = s;
    }
  });
  if (updates.businessName !== undefined && !updates.businessName) validationError('Business name is required', 'businessName');

  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.SETTINGS);
    var t = readTable(sh);
    var header = t.header.length ? t.header : PBM.SETTINGS_HEADERS;
    var byKey = {};
    t.rows.forEach(function (r) { byKey[String(r.key)] = r; });
    var ts = nowIso();
    var toAppend = [];
    Object.keys(updates).forEach(function (key) {
      var obj = { key: key, value: updates[key], updatedAt: ts, updatedBy: user.username };
      if (byKey[key]) writeObjectAt(sh, header, byKey[key]._row, obj, {});
      else toAppend.push(obj);
    });
    appendObjects(sh, header, toAppend, {});
    PBM._memo.settings = null;
    var keys = Object.keys(updates);
    if (keys.length) writeAudit([{ user: user.username, action: 'SETTINGS_UPDATE', summary: 'Updated: ' + keys.join(', ') }]);
    return settingsToApi(readSettings());
  });
}

function actionGetSystemStatus(payload, user) {
  requireOwner(user);
  var ss = getSpreadsheet();
  var id = ss.getId();
  var customers = readCustomers().rows;
  return {
    version: PBM.VERSION,
    spreadsheetName: ss.getName(),
    spreadsheetIdMasked: '…' + String(id).slice(-6),
    spreadsheetUrl: ss.getUrl(),
    sheetCount: ss.getSheets().length,
    customerCount: customers.length,
    advancedSheetsService: typeof Sheets !== 'undefined',
    timezone: PBM.TZ,
    serverTime: nowIso(),
    businessDate: todayStr(),
    dataVersion: getDataVersion()
  };
}
