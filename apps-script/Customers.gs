/**
 * Customer management. Every customer has a stable ID (C0001, C0002 …) that
 * never changes, plus a dedicated transaction tab created automatically.
 */

function findCustomerOrFail(customers, customerId) {
  for (var i = 0; i < customers.length; i++) if (customers[i].customerId === customerId) return customers[i];
  fail('NOT_FOUND', 'Customer not found. It may have been deleted — please refresh.');
}

function nextCustomerNumber(customers) {
  var props = PropertiesService.getScriptProperties();
  var stored = parseInt(props.getProperty(PBM.PROP.NEXT_CUSTOMER) || '1', 10);
  var maxExisting = 0;
  customers.forEach(function (c) {
    var n = parseInt(c.customerId.substring(1), 10);
    if (n > maxExisting) maxExisting = n;
  });
  var next = Math.max(stored, maxExisting + 1);
  props.setProperty(PBM.PROP.NEXT_CUSTOMER, String(next + 1));
  return next;
}

function validateCustomerFields(payload, partial) {
  var out = {};
  if (!partial || payload.customerName !== undefined) {
    out.customerName = reqString(payload.customerName, 'customerName', 'Customer name', { min: 2, max: PBM.LIMITS.MAX_NAME });
  }
  if (!partial || payload.phone !== undefined) out.phone = normalizePhone(payload.phone, true);
  if (!partial || payload.address !== undefined) out.address = optString(payload.address, 'address', 'Address', { max: PBM.LIMITS.MAX_ADDRESS });
  if (!partial || payload.notes !== undefined) out.notes = optString(payload.notes, 'notes', 'Notes', { max: PBM.LIMITS.MAX_NOTES });
  if (!partial || payload.openingBalance !== undefined) {
    out.openingPaise = isBlank(payload.openingBalance) ? 0 :
      parseScaled(payload.openingBalance, 2, 'openingBalance', 'Opening balance', { allowNegative: true, max: PBM.LIMITS.MAX_AMOUNT_PAISE });
  }
  return out;
}

function findPossibleDuplicates(customers, name, phone, exceptId) {
  var n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return customers.filter(function (c) {
    if (c.customerId === exceptId) return false;
    return (n && c.customerName.toLowerCase().replace(/\s+/g, ' ').trim() === n) || (phone && c.phone === phone);
  }).map(function (c) {
    return { customerId: c.customerId, customerName: c.customerName, phone: c.phone, status: c.status };
  });
}

function customerRowObject(c) {
  return {
    customerId: c.customerId,
    customerName: c.customerName,
    phone: c.phone,
    address: c.address,
    notes: c.notes,
    createdAt: c.createdAt,
    status: c.status,
    openingBalance: paiseToRupees(c.openingPaise),
    sheetName: c.sheetName,
    updatedAt: c.updatedAt,
    version: c.version,
    requestId: c.requestId,
    createdBy: c.createdBy
  };
}

/** Makes sure the customer's tab exists (re-creating it if it was deleted). */
function ensureCustomerSheet(ss, customer) {
  var sh = customer.sheetName ? ss.getSheetByName(customer.sheetName) : null;
  if (sh) return sh;
  if (!customer.sheetName) customer.sheetName = uniqueSheetName(ss, customer.customerId, customer.customerName);
  return createTransactionSheet(ss, customer.sheetName);
}

// ------------------------------------------------------------- actions -----

function actionListCustomers(payload) {
  var ds = loadDataset(optBool(payload.fresh));
  var status = String(payload.status || 'ALL').toUpperCase();
  var q = String(payload.search || '').toLowerCase().trim();
  var qDigits = q.replace(/\D/g, '');
  var rows = ds.customers.filter(function (c) {
    if (status !== 'ALL' && c.status !== status) return false;
    if (!q) return true;
    return c.customerName.toLowerCase().indexOf(q) !== -1 ||
      c.customerId.toLowerCase() === q ||
      (qDigits.length >= 3 && c.phone.replace(/\D/g, '').indexOf(qDigits) !== -1);
  }).map(function (c) {
    return customerToApi(c, customerSummary(c, ds.txnsByCustomer[c.customerId] || []));
  });
  rows.sort(function (a, b) { return a.customerName.localeCompare(b.customerName); });
  return { customers: rows, missingSheets: ds.missingSheets, loadedAt: ds.loadedAt };
}

function actionGetCustomer(payload) {
  var id = reqCustomerId(payload.customerId);
  var ds = loadDataset(optBool(payload.fresh));
  var c = findCustomerOrFail(ds.customers, id);
  var txns = sortTxns(ds.txnsByCustomer[id] || []);
  var out = customerToApi(c, customerSummary(c, txns));
  out.sheetMissing = ds.missingSheets.indexOf(id) !== -1;
  out.unidentifiedRows = ds.unidentified[id] || 0;
  if (payload.includeTransactions !== false) {
    var running = c.openingPaise;
    out.transactions = txns.map(function (t) {
      running += signedPaise(t);
      var a = txnToApi(t);
      a.runningBalance = paiseToRupees(running);
      return a;
    });
  }
  return out;
}

function actionCreateCustomer(payload, user, ctx) {
  var requestId = reqRequestId(ctx.requestId);
  var f = validateCustomerFields(payload, false);
  if (f.openingPaise !== 0 && user.role !== 'OWNER' && f.openingPaise < 0) {
    fail('FORBIDDEN', 'Only the owner can record an opening advance/credit.');
  }
  var ss = getSpreadsheet();
  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.CLIENTS);
    var all = readCustomers();
    var header = all.header.length ? all.header : PBM.CLIENT_HEADERS;

    // Idempotency: a retried request returns the customer created the first time.
    var prior = all.rows.filter(function (c) { return c.requestId === requestId; })[0];
    if (prior) {
      ensureCustomerSheet(ss, prior);
      return { customer: customerToApi(prior), duplicateRequest: true };
    }

    var dups = findPossibleDuplicates(all.rows, f.customerName, f.phone, null);
    if (dups.length && !optBool(payload.allowDuplicate)) {
      fail('DUPLICATE_CUSTOMER', 'A customer with the same name or mobile number already exists.', { matches: dups });
    }

    var id = formatCustomerId(nextCustomerNumber(all.rows));
    var ts = nowIso();
    var c = {
      customerId: id,
      customerName: f.customerName,
      phone: f.phone,
      address: f.address,
      notes: f.notes,
      createdAt: ts,
      status: 'ACTIVE',
      openingPaise: f.openingPaise,
      sheetName: uniqueSheetName(ss, id, f.customerName),
      updatedAt: ts,
      version: 1,
      requestId: requestId,
      createdBy: user.username
    };
    // Write the Clients row first, then the tab. If tab creation fails the
    // retry (same requestId) or any later access re-creates it — never a
    // duplicate customer.
    appendObjects(sh, header, [customerRowObject(c)], PBM.CLIENT_FORMATS);
    ensureCustomerSheet(ss, c);
    bumpDataVersion();
    writeAudit([{
      user: user.username, action: 'CUSTOMER_CREATE', customerId: id,
      summary: 'Created ' + c.customerName + (c.openingPaise ? ' with opening balance ' + paiseToRupees(c.openingPaise) : '')
    }]);
    return { customer: customerToApi(c), duplicateRequest: false };
  });
}

function actionUpdateCustomer(payload, user) {
  var id = reqCustomerId(payload.customerId);
  var expected = reqVersion(payload.expectedVersion);
  var f = validateCustomerFields(payload, true);
  var ss = getSpreadsheet();
  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.CLIENTS);
    var all = readCustomers();
    var c = findCustomerOrFail(all.rows, id);
    if (c.version !== expected) {
      fail('CONFLICT', 'This customer was changed by someone else. Refresh to see the latest details.', { currentVersion: c.version });
    }
    if (f.openingPaise !== undefined && f.openingPaise !== c.openingPaise) {
      requireOwner(user);
    }
    if (f.customerName !== undefined || f.phone !== undefined) {
      var dups = findPossibleDuplicates(all.rows, f.customerName !== undefined ? f.customerName : c.customerName, f.phone !== undefined ? f.phone : c.phone, id);
      if (dups.length && !optBool(payload.allowDuplicate)) {
        fail('DUPLICATE_CUSTOMER', 'Another customer has the same name or mobile number.', { matches: dups });
      }
    }
    var before = c.customerName + ' / ' + c.phone + ' / opening ' + paiseToRupees(c.openingPaise);
    ['customerName', 'phone', 'address', 'notes', 'openingPaise'].forEach(function (k) {
      if (f[k] !== undefined) c[k] = f[k];
    });
    // Keep the tab name in step with the customer name (ID prefix keeps it unique).
    var tab = c.sheetName ? ss.getSheetByName(c.sheetName) : null;
    var desired = buildSheetName(c.customerId, c.customerName);
    if (tab && desired !== c.sheetName) {
      var newName = uniqueSheetName(ss, c.customerId, c.customerName, c.sheetName);
      tab.setName(newName);
      c.sheetName = newName;
    }
    c.updatedAt = nowIso();
    c.version += 1;
    writeObjectAt(sh, all.header, c._row, customerRowObject(c), PBM.CLIENT_FORMATS);
    bumpDataVersion();
    writeAudit([{
      user: user.username, action: 'CUSTOMER_UPDATE', customerId: id,
      summary: 'Before: ' + before + ' → After: ' + c.customerName + ' / ' + c.phone + ' / opening ' + paiseToRupees(c.openingPaise)
    }]);
    return { customer: customerToApi(c) };
  });
}

/** Archive (status INACTIVE) or reactivate (ACTIVE). History is always kept. */
function actionArchiveCustomer(payload, user) {
  requireOwner(user);
  var id = reqCustomerId(payload.customerId);
  var status = reqEnum(payload.status || 'INACTIVE', 'status', 'Status', PBM.CUSTOMER_STATUS);
  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.CLIENTS);
    var all = readCustomers();
    var c = findCustomerOrFail(all.rows, id);
    if (c.status === status) return { customer: customerToApi(c) };
    c.status = status;
    c.updatedAt = nowIso();
    c.version += 1;
    writeObjectAt(sh, all.header, c._row, customerRowObject(c), PBM.CLIENT_FORMATS);
    bumpDataVersion();
    writeAudit([{ user: user.username, action: status === 'INACTIVE' ? 'CUSTOMER_ARCHIVE' : 'CUSTOMER_REACTIVATE', customerId: id, summary: c.customerName }]);
    return { customer: customerToApi(c) };
  });
}

/**
 * Permanent deletion is only allowed for a customer with NO transaction rows
 * at all (not even voided ones) and a zero opening balance — i.e. a record
 * created by mistake. Anything with financial history must be archived.
 */
function actionDeleteCustomer(payload, user) {
  requireOwner(user);
  var id = reqCustomerId(payload.customerId);
  var confirmName = String(payload.confirmName || '').trim();
  var ss = getSpreadsheet();
  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.CLIENTS);
    var all = readCustomers();
    var c = findCustomerOrFail(all.rows, id);
    if (confirmName !== c.customerName) {
      validationError('Type the customer name exactly to confirm deletion', 'confirmName');
    }
    var data = readCustomerSheet(ss, c);
    if (data.txns.length || data.unidentified || c.openingPaise !== 0) {
      fail('HAS_HISTORY', 'This customer has financial history or an opening balance and cannot be deleted. Archive the customer instead — their history will be kept.');
    }
    if (data.sheet) ss.deleteSheet(data.sheet);
    sh.deleteRow(c._row);
    bumpDataVersion();
    writeAudit([{ user: user.username, action: 'CUSTOMER_DELETE', customerId: id, summary: 'Permanently deleted ' + c.customerName + ' (no transactions)' }]);
    return { deleted: true, customerId: id };
  });
}

/** Repairs a missing customer tab (e.g. deleted by hand in Google Sheets). */
function actionCreateCustomerSheet(payload, user) {
  var id = reqCustomerId(payload.customerId);
  var ss = getSpreadsheet();
  return withLock(function () {
    var sh = getMasterSheet(PBM.SHEETS.CLIENTS);
    var all = readCustomers();
    var c = findCustomerOrFail(all.rows, id);
    var existed = !!(c.sheetName && ss.getSheetByName(c.sheetName));
    var oldName = c.sheetName;
    ensureCustomerSheet(ss, c);
    if (c.sheetName !== oldName) {
      c.updatedAt = nowIso();
      c.version += 1;
      writeObjectAt(sh, all.header, c._row, customerRowObject(c), PBM.CLIENT_FORMATS);
    }
    bumpDataVersion();
    if (!existed) writeAudit([{ user: user.username, action: 'CUSTOMER_SHEET_CREATE', customerId: id, summary: 'Created tab ' + c.sheetName }]);
    return { customerId: id, sheetName: c.sheetName, created: !existed };
  });
}
