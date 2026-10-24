/**
 * Audit log. Records who changed what. Never records passwords, tokens or
 * other secrets — only IDs and short human-readable summaries.
 * appendRow is atomic, so audit writes are safe even outside the script lock.
 */

function writeAudit(entries) {
  if (!entries || !entries.length) return;
  var sh = getMasterSheet(PBM.SHEETS.AUDIT);
  var ts = nowIso();
  entries.forEach(function (e) {
    sh.appendRow([
      ts,
      safeCellText(String(e.user || '')),
      safeCellText(String(e.action || '')),
      String(e.customerId || ''),
      String(e.transactionId || ''),
      safeCellText(String(e.summary || '').substring(0, 500))
    ]);
  });
}

/** Audit write that never breaks the calling request (used for logins). */
function writeAuditSafe(user, action, customerId, transactionId, summary) {
  try {
    writeAudit([{ user: user, action: action, customerId: customerId, transactionId: transactionId, summary: summary }]);
  } catch (e) {
    console.warn('Audit write failed: ' + e);
  }
}

function actionGetAuditLog(payload, user) {
  requireOwner(user);
  var limit = Math.min(parseInteger(payload.limit, 'limit', 'Limit', { defaultValue: 100, max: 1000 }), 1000);
  var sh = getMasterSheet(PBM.SHEETS.AUDIT);
  var last = sh.getLastRow();
  if (last < 2) return { rows: [] };
  var start = Math.max(2, last - limit + 1);
  var values = sh.getRange(start, 1, last - start + 1, PBM.AUDIT_HEADERS.length).getValues();
  var rows = values.map(function (r) {
    return {
      timestamp: normalizeTimestampCell(r[0]),
      user: String(r[1]),
      action: String(r[2]),
      customerId: String(r[3]),
      transactionId: String(r[4]),
      summary: String(r[5])
    };
  }).reverse();
  return { rows: rows };
}
