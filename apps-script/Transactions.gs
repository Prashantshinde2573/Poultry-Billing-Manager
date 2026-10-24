/**
 * Bills, payments and adjustments.
 *
 * - Every transaction has a unique, stable ID (T20261024-3F9A1C2B7D).
 * - Create requests carry a client-generated requestId; a retried or
 *   double-clicked request returns the original record instead of adding a
 *   second one.
 * - Updates carry expectedVersion; if the record changed since the user
 *   loaded it, the update is rejected with CONFLICT instead of overwriting.
 * - Deletion is a soft "void": the row stays in the sheet with status VOID
 *   and is excluded from every calculation.
 */

function loadCustomerForWrite(customerId) {
  var ss = getSpreadsheet();
  var c = findCustomerOrFail(readCustomers().rows, customerId);
  var sh = ensureCustomerSheet(ss, c);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), Math.max(lastCol, 1)).getValues();
  var parsed = parseTxnValues(values, customerId);
  var header = parsed.header.filter(function (h) { return h; }).length ? parsed.header : PBM.TXN_HEADERS;
  return { ss: ss, customer: c, sheet: sh, header: header, txns: parsed.txns };
}

function findTxnOrFail(txns, transactionId) {
  for (var i = 0; i < txns.length; i++) if (txns[i].transactionId === transactionId) return txns[i];
  fail('NOT_FOUND', 'Transaction not found. It may have been changed — please refresh.');
}

function validateBillFields(p, settings) {
  var birds = parseInteger(p.birdCount, 'birdCount', 'Number of birds', { max: PBM.LIMITS.MAX_BIRDS });
  var grams = parseScaled(p.weightKg, 3, 'weightKg', 'Weight (kg)', { positive: true, max: PBM.LIMITS.MAX_WEIGHT_GRAMS });
  var ratePaise = parseScaled(p.ratePerKg, 2, 'ratePerKg', 'Rate per kg', { max: PBM.LIMITS.MAX_RATE_PAISE });
  if (ratePaise === 0 && !settings.allowZeroRate) {
    validationError('Rate must be greater than zero. (The owner can allow zero-rate entries in Settings.)', 'ratePerKg');
  }
  return { birdCount: birds, grams: grams, ratePaise: ratePaise, billPaise: computeBillPaise(grams, ratePaise) };
}

function validatePaymentFields(p) {
  return {
    paymentPaise: parseScaled(p.amount, 2, 'amount', 'Amount received', { positive: true, max: PBM.LIMITS.MAX_AMOUNT_PAISE }),
    paymentMethod: reqEnum(p.paymentMethod, 'paymentMethod', 'Payment method', PBM.PAYMENT_METHODS),
    referenceNumber: optString(p.referenceNumber, 'referenceNumber', 'Reference number', { max: PBM.LIMITS.MAX_REF })
  };
}

/**
 * Overpayment rule: if a payment is larger than what the customer currently
 * owes, the user must confirm, and the owner must have enabled advance
 * payments in Settings. Returns nothing; throws when not allowed.
 */
function checkOverpayment(balanceBeforePaise, paymentPaise, settings, confirmed) {
  var owed = Math.max(balanceBeforePaise, 0);
  if (paymentPaise <= owed) return;
  var details = {
    outstanding: paiseToRupees(balanceBeforePaise),
    amount: paiseToRupees(paymentPaise),
    excess: paiseToRupees(paymentPaise - owed)
  };
  if (!settings.allowAdvancePayments) {
    fail('OVERPAYMENT_NOT_ALLOWED', 'This payment is more than the outstanding balance. Advance payments are turned off in Settings.', details);
  }
  if (!confirmed) {
    fail('OVERPAYMENT_CONFIRMATION_REQUIRED', 'This payment is more than the outstanding balance. Confirm to record the extra as an advance.', details);
  }
}

function newTxnBase(type, date, user, requestId, notes) {
  var ts = nowIso();
  return {
    transactionId: newTransactionId(date),
    transactionDate: date,
    transactionType: type,
    birdCount: 0, grams: 0, ratePaise: 0, billPaise: 0, paymentPaise: 0,
    paymentMethod: '', referenceNumber: '', notes: notes || '',
    createdAt: ts, updatedAt: ts, createdBy: user.username,
    status: 'ACTIVE', version: 1, requestId: requestId, updatedBy: user.username,
    voidedAt: '', voidedBy: '', voidReason: ''
  };
}

function insertTxn(ctxData, txn, user, auditSummary) {
  // Guarantee ID uniqueness within the customer's sheet.
  var ids = {};
  ctxData.txns.forEach(function (t) { ids[t.transactionId] = true; });
  while (ids[txn.transactionId]) txn.transactionId = newTransactionId(txn.transactionDate);
  appendObjects(ctxData.sheet, ctxData.header, [txnToRowObject(txn)], PBM.TXN_FORMATS);
  bumpDataVersion();
  writeAudit([{
    user: user.username, action: txn.transactionType + '_CREATE', customerId: ctxData.customer.customerId,
    transactionId: txn.transactionId, summary: auditSummary
  }]);
  var all = ctxData.txns.concat([txn]);
  return {
    transaction: txnToApi(txn),
    customerBalance: paiseToRupees(balanceAsOf(ctxData.customer.openingPaise, all, null)),
    duplicateRequest: false
  };
}

function duplicateResult(ctxData, requestId) {
  var prior = ctxData.txns.filter(function (t) { return t.requestId === requestId; })[0];
  if (!prior) return null;
  return {
    transaction: txnToApi(prior),
    customerBalance: paiseToRupees(balanceAsOf(ctxData.customer.openingPaise, ctxData.txns, null)),
    duplicateRequest: true
  };
}

// ------------------------------------------------------------- actions -----

function actionCreateBill(payload, user, ctx) {
  var requestId = reqRequestId(ctx.requestId);
  var customerId = reqCustomerId(payload.customerId);
  var date = reqDate(payload.transactionDate, 'transactionDate', 'Date', { notFuture: true });
  var settings = readSettings();
  var b = validateBillFields(payload, settings);
  var notes = optString(payload.notes, 'notes', 'Notes', { max: PBM.LIMITS.MAX_NOTES });
  return withLock(function () {
    var d = loadCustomerForWrite(customerId);
    var dup = duplicateResult(d, requestId);
    if (dup) return dup;
    if (d.customer.status !== 'ACTIVE') fail('CUSTOMER_INACTIVE', 'This customer is archived. Reactivate the customer before adding bills.');
    var t = newTxnBase('BILL', date, user, requestId, notes);
    t.birdCount = b.birdCount; t.grams = b.grams; t.ratePaise = b.ratePaise; t.billPaise = b.billPaise;
    return insertTxn(d, t, user, 'Bill ' + date + ': ' + b.birdCount + ' birds, ' + (b.grams / 1000) + ' kg × ' + paiseToRupees(b.ratePaise) + ' = ' + paiseToRupees(b.billPaise));
  });
}

function actionCreatePayment(payload, user, ctx) {
  var requestId = reqRequestId(ctx.requestId);
  var customerId = reqCustomerId(payload.customerId);
  var date = reqDate(payload.transactionDate, 'transactionDate', 'Date', { notFuture: true });
  var p = validatePaymentFields(payload);
  var notes = optString(payload.notes, 'notes', 'Notes', { max: PBM.LIMITS.MAX_NOTES });
  var settings = readSettings();
  return withLock(function () {
    var d = loadCustomerForWrite(customerId);
    var dup = duplicateResult(d, requestId);
    if (dup) return dup;
    var current = balanceAsOf(d.customer.openingPaise, d.txns, null);
    checkOverpayment(current, p.paymentPaise, settings, optBool(payload.confirmOverpayment));
    var t = newTxnBase('PAYMENT', date, user, requestId, notes);
    t.paymentPaise = p.paymentPaise; t.paymentMethod = p.paymentMethod; t.referenceNumber = p.referenceNumber;
    return insertTxn(d, t, user, 'Payment ' + date + ': ' + paiseToRupees(p.paymentPaise) + ' via ' + p.paymentMethod);
  });
}

/** Owner-only correction entry. DEBIT increases what the customer owes; CREDIT reduces it. */
function actionCreateAdjustment(payload, user, ctx) {
  requireOwner(user);
  var requestId = reqRequestId(ctx.requestId);
  var customerId = reqCustomerId(payload.customerId);
  var date = reqDate(payload.transactionDate, 'transactionDate', 'Date', { notFuture: true });
  var direction = reqEnum(payload.direction, 'direction', 'Adjustment type', ['DEBIT', 'CREDIT']);
  var amount = parseScaled(payload.amount, 2, 'amount', 'Amount', { positive: true, max: PBM.LIMITS.MAX_AMOUNT_PAISE });
  var notes = reqString(payload.notes, 'notes', 'Reason', { min: 3, max: PBM.LIMITS.MAX_NOTES });
  return withLock(function () {
    var d = loadCustomerForWrite(customerId);
    var dup = duplicateResult(d, requestId);
    if (dup) return dup;
    var t = newTxnBase('ADJUSTMENT', date, user, requestId, notes);
    if (direction === 'DEBIT') t.billPaise = amount; else t.paymentPaise = amount;
    return insertTxn(d, t, user, 'Adjustment ' + direction + ' ' + paiseToRupees(amount) + ': ' + notes);
  });
}

function canEditTxn(user, t) {
  if (user.role === 'OWNER') return true;
  // Staff may correct only their own entries, on the day they made them.
  return t.transactionType !== 'ADJUSTMENT' && t.createdBy === user.username && isoToBusinessDate(t.createdAt) === todayStr();
}

function describeTxn(t) {
  if (t.transactionType === 'BILL') return t.transactionDate + ' ' + t.birdCount + ' birds ' + (t.grams / 1000) + 'kg @' + paiseToRupees(t.ratePaise) + ' = ' + paiseToRupees(t.billPaise);
  if (t.transactionType === 'PAYMENT') return t.transactionDate + ' ' + paiseToRupees(t.paymentPaise) + ' ' + t.paymentMethod + (t.referenceNumber ? ' ref ' + t.referenceNumber : '');
  return t.transactionDate + ' ' + (t.billPaise ? 'DEBIT ' + paiseToRupees(t.billPaise) : 'CREDIT ' + paiseToRupees(t.paymentPaise));
}

function actionUpdateTransaction(payload, user) {
  var customerId = reqCustomerId(payload.customerId);
  var txnId = reqTransactionId(payload.transactionId);
  var expected = reqVersion(payload.expectedVersion);
  var settings = readSettings();
  return withLock(function () {
    var d = loadCustomerForWrite(customerId);
    var t = findTxnOrFail(d.txns, txnId);
    if (!canEditTxn(user, t)) fail('FORBIDDEN', 'You can only edit your own entries on the day they were made. Ask the owner to correct this one.');
    if (t.status === 'VOID') fail('VALIDATION_ERROR', 'A voided transaction cannot be edited.');
    if (t.version !== expected) fail('CONFLICT', 'This transaction was changed by someone else. Refresh to see the latest version.', { currentVersion: t.version });

    var before = describeTxn(t);
    if (payload.transactionDate !== undefined) t.transactionDate = reqDate(payload.transactionDate, 'transactionDate', 'Date', { notFuture: true });
    if (payload.notes !== undefined) t.notes = optString(payload.notes, 'notes', 'Notes', { max: PBM.LIMITS.MAX_NOTES });

    if (t.transactionType === 'BILL') {
      var b = validateBillFields({
        birdCount: payload.birdCount !== undefined ? payload.birdCount : t.birdCount,
        weightKg: payload.weightKg !== undefined ? payload.weightKg : String(t.grams / 1000),
        ratePerKg: payload.ratePerKg !== undefined ? payload.ratePerKg : String(paiseToRupees(t.ratePaise))
      }, settings);
      t.birdCount = b.birdCount; t.grams = b.grams; t.ratePaise = b.ratePaise; t.billPaise = b.billPaise;
    } else if (t.transactionType === 'PAYMENT') {
      var p = validatePaymentFields({
        amount: payload.amount !== undefined ? payload.amount : String(paiseToRupees(t.paymentPaise)),
        paymentMethod: payload.paymentMethod !== undefined ? payload.paymentMethod : t.paymentMethod,
        referenceNumber: payload.referenceNumber !== undefined ? payload.referenceNumber : t.referenceNumber
      });
      var others = d.txns.filter(function (x) { return x.transactionId !== t.transactionId; });
      var balWithout = balanceAsOf(d.customer.openingPaise, others, null);
      if (p.paymentPaise > t.paymentPaise) checkOverpayment(balWithout, p.paymentPaise, settings, optBool(payload.confirmOverpayment));
      t.paymentPaise = p.paymentPaise; t.paymentMethod = p.paymentMethod; t.referenceNumber = p.referenceNumber;
    } else {
      requireOwner(user);
      if (payload.amount !== undefined || payload.direction !== undefined) {
        var dir = reqEnum(payload.direction !== undefined ? payload.direction : (t.billPaise ? 'DEBIT' : 'CREDIT'), 'direction', 'Adjustment type', ['DEBIT', 'CREDIT']);
        var amt = parseScaled(payload.amount !== undefined ? payload.amount : String(paiseToRupees(t.billPaise || t.paymentPaise)), 2, 'amount', 'Amount', { positive: true, max: PBM.LIMITS.MAX_AMOUNT_PAISE });
        t.billPaise = dir === 'DEBIT' ? amt : 0;
        t.paymentPaise = dir === 'CREDIT' ? amt : 0;
      }
      if (!t.notes || t.notes.length < 3) validationError('A reason is required for adjustments', 'notes');
    }

    t.version += 1;
    t.updatedAt = nowIso();
    t.updatedBy = user.username;
    writeObjectAt(d.sheet, d.header, t._row, txnToRowObject(t), PBM.TXN_FORMATS);
    bumpDataVersion();
    writeAudit([{ user: user.username, action: t.transactionType + '_UPDATE', customerId: customerId, transactionId: txnId, summary: 'Before: ' + before + ' → After: ' + describeTxn(t) }]);
    return {
      transaction: txnToApi(t),
      customerBalance: paiseToRupees(balanceAsOf(d.customer.openingPaise, d.txns, null))
    };
  });
}

function actionVoidTransaction(payload, user) {
  requireOwner(user);
  var customerId = reqCustomerId(payload.customerId);
  var txnId = reqTransactionId(payload.transactionId);
  var expected = reqVersion(payload.expectedVersion);
  var reason = reqString(payload.reason, 'reason', 'Reason', { min: 3, max: 200 });
  return withLock(function () {
    var d = loadCustomerForWrite(customerId);
    var t = findTxnOrFail(d.txns, txnId);
    if (t.status === 'VOID') return { transaction: txnToApi(t), customerBalance: paiseToRupees(balanceAsOf(d.customer.openingPaise, d.txns, null)), alreadyVoid: true };
    if (t.version !== expected) fail('CONFLICT', 'This transaction was changed by someone else. Refresh and try again.', { currentVersion: t.version });
    t.status = 'VOID';
    t.voidedAt = nowIso();
    t.voidedBy = user.username;
    t.voidReason = reason;
    t.version += 1;
    t.updatedAt = t.voidedAt;
    t.updatedBy = user.username;
    writeObjectAt(d.sheet, d.header, t._row, txnToRowObject(t), PBM.TXN_FORMATS);
    bumpDataVersion();
    writeAudit([{ user: user.username, action: t.transactionType + '_VOID', customerId: customerId, transactionId: txnId, summary: describeTxn(t) + ' — reason: ' + reason }]);
    return { transaction: txnToApi(t), customerBalance: paiseToRupees(balanceAsOf(d.customer.openingPaise, d.txns, null)) };
  });
}

function actionGetTransaction(payload) {
  var customerId = reqCustomerId(payload.customerId);
  var txnId = reqTransactionId(payload.transactionId);
  var ds = loadDataset(true);
  var c = findCustomerOrFail(ds.customers, customerId);
  var t = findTxnOrFail(ds.txnsByCustomer[customerId] || [], txnId);
  var out = txnToApi(t);
  out.customerName = c.customerName;
  return out;
}

/** Filtered, paginated transaction list across all customers. */
function actionListTransactions(payload) {
  var ds = loadDataset(optBool(payload.fresh));
  var range = resolvePeriod(payload.period || (payload.start || payload.end ? 'CUSTOM' : 'MONTH'), payload.start, payload.end);
  var customerId = isBlank(payload.customerId) ? '' : reqCustomerId(payload.customerId);
  var type = isBlank(payload.transactionType) ? '' : reqEnum(payload.transactionType, 'transactionType', 'Type', PBM.TXN_TYPES);
  var method = isBlank(payload.paymentMethod) ? '' : reqEnum(payload.paymentMethod, 'paymentMethod', 'Payment method', PBM.PAYMENT_METHODS);
  var includeVoid = optBool(payload.includeVoid);
  var limit = parseInteger(payload.limit, 'limit', 'Limit', { defaultValue: 200, max: 5000 });
  var offset = parseInteger(payload.offset, 'offset', 'Offset', { defaultValue: 0, max: 1000000 });
  var names = {};
  ds.customers.forEach(function (c) { names[c.customerId] = c.customerName; });

  var rows = [];
  var acc = emptyTotals();
  ds.customers.forEach(function (c) {
    if (customerId && c.customerId !== customerId) return;
    (ds.txnsByCustomer[c.customerId] || []).forEach(function (t) {
      if (!inRange(t, range)) return;
      if (type && t.transactionType !== type) return;
      if (method && t.paymentMethod !== method) return;
      if (t.status === 'VOID' && !includeVoid) return;
      addToTotals(acc, t);
      rows.push(t);
    });
  });
  rows.sort(function (a, b) { return -compareTxns(a, b); }); // newest first
  return {
    range: range,
    total: rows.length,
    totals: totalsToApi(acc),
    rows: rows.slice(offset, offset + limit).map(function (t) {
      var a = txnToApi(t);
      a.customerName = names[t.customerId] || '';
      return a;
    })
  };
}
