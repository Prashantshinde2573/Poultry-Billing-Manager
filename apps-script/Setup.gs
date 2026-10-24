/**
 * One-time setup and maintenance functions. Run these from the Apps Script
 * editor (select the function → Run). They are NOT reachable from the web.
 *
 * First-time setup:
 *   1. Project Settings → Script properties → add
 *        SPREADSHEET_ID      = the ID from your spreadsheet URL
 *        BOOTSTRAP_USERNAME  = owner login name, e.g. "owner" (lowercase)
 *        BOOTSTRAP_PASSWORD  = a strong temporary password (8+ characters)
 *   2. Run setup(). It creates the master sheets, creates the owner account
 *      and then DELETES BOOTSTRAP_PASSWORD from the script properties.
 */

function setup() {
  PBM._memo = {};
  ensureMasterSheets();
  getPepper();
  var props = PropertiesService.getScriptProperties();
  var username = (props.getProperty(PBM.PROP.BOOTSTRAP_USERNAME) || '').trim().toLowerCase();
  var password = props.getProperty(PBM.PROP.BOOTSTRAP_PASSWORD) || '';
  var users = getUsers();
  var report = ['Master sheets ready: Clients, Settings, AuditLog, Dashboard.'];

  if (username && password) {
    validateUsername(username);
    validateNewPassword(password);
    if (users[username]) {
      report.push('User "' + username + '" already exists — password NOT changed. Use resetOwnerPassword() to reset it.');
    } else {
      users[username] = createUserRecord(username, password, 'OWNER', 'Owner');
      saveUsers(users);
      report.push('Owner account "' + username + '" created.');
    }
    props.deleteProperty(PBM.PROP.BOOTSTRAP_PASSWORD);
    report.push('BOOTSTRAP_PASSWORD removed from script properties.');
  } else if (!Object.keys(users).length) {
    report.push('WARNING: no users exist. Add BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD script properties and run setup() again.');
  }

  var settingsSheet = getMasterSheet(PBM.SHEETS.SETTINGS);
  if (settingsSheet.getLastRow() < 2) {
    appendObjects(settingsSheet, PBM.SETTINGS_HEADERS, [
      { key: 'businessName', value: 'My Poultry Business', updatedAt: nowIso(), updatedBy: 'setup' }
    ], {});
  }
  report.forEach(function (l) { console.log(l); });
  return report.join('\n');
}

/**
 * Resets (or creates) an owner password using BOOTSTRAP_USERNAME and
 * BOOTSTRAP_PASSWORD, then deletes BOOTSTRAP_PASSWORD. Signs that user out
 * everywhere. Use this if the owner forgets their password.
 */
function resetOwnerPassword() {
  PBM._memo = {};
  var props = PropertiesService.getScriptProperties();
  var username = (props.getProperty(PBM.PROP.BOOTSTRAP_USERNAME) || '').trim().toLowerCase();
  var password = props.getProperty(PBM.PROP.BOOTSTRAP_PASSWORD) || '';
  if (!username || !password) throw new Error('Set BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD script properties first.');
  validateUsername(username);
  validateNewPassword(password);
  var users = getUsers();
  var existing = users[username];
  var rec = createUserRecord(username, password, 'OWNER', existing ? existing.displayName : 'Owner');
  if (existing) rec.epoch = (existing.epoch || 1) + 1;
  users[username] = rec;
  saveUsers(users);
  props.deleteProperty(PBM.PROP.BOOTSTRAP_PASSWORD);
  writeAuditSafe('setup', 'OWNER_PASSWORD_RESET', '', '', 'Owner password reset for ' + username);
  console.log('Owner password set for "' + username + '". BOOTSTRAP_PASSWORD removed.');
}

/**
 * Gives an ID to rows typed into a customer tab by hand (rows without a
 * transactionId are ignored by the app until repaired). Valid manual rows
 * need: transactionDate, transactionType (BILL/PAYMENT/ADJUSTMENT) and amounts.
 */
function repairManualRows() {
  PBM._memo = {};
  var ss = getSpreadsheet();
  var fixed = 0;
  withLock(function () {
    readCustomers().rows.forEach(function (c) {
      var sh = c.sheetName ? ss.getSheetByName(c.sheetName) : null;
      if (!sh) return;
      var t = readTable(sh);
      t.rows.forEach(function (r) {
        if (r.transactionId) return;
        var type = String(r.transactionType || '').toUpperCase();
        var date = normalizeDateCell(r.transactionDate);
        if (PBM.TXN_TYPES.indexOf(type) === -1 || !date) return;
        var x = txnFromRow(r, c.customerId);
        x.transactionId = newTransactionId(date);
        x.transactionDate = date;
        x.transactionType = type;
        if (type === 'BILL' && x.grams && x.ratePaise && !x.billPaise) x.billPaise = computeBillPaise(x.grams, x.ratePaise);
        x.createdAt = x.createdAt || nowIso();
        x.updatedAt = nowIso();
        x.createdBy = x.createdBy || 'manual';
        x.updatedBy = 'repair';
        writeObjectAt(sh, t.header, r._row, txnToRowObject(x), PBM.TXN_FORMATS);
        fixed++;
      });
    });
    bumpDataVersion();
  });
  if (fixed) writeAuditSafe('setup', 'REPAIR_MANUAL_ROWS', '', '', 'Assigned IDs to ' + fixed + ' manual rows');
  console.log('Repaired ' + fixed + ' manual rows.');
}

/** Clears the dashboard cache after editing the spreadsheet by hand. */
function clearDataCache() {
  PBM._memo = {};
  bumpDataVersion();
  console.log('Cache cleared; the app will read fresh data on the next request.');
}
