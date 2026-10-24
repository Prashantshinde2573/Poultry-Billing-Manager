/**
 * Dashboard and reports. All figures are calculated on request from the
 * Clients sheet and the customer tabs — nothing is stored as a running total.
 *
 * Two kinds of numbers are kept strictly apart:
 *   1. ACTIVITY within the selected period (billing, payments, birds, kg)
 *   2. BALANCES at a point in time:
 *        - current outstanding = every valid transaction up to today
 *        - closing outstanding = only transactions on/before the period end
 */

function outstandingSnapshot(ds, asOf) {
  var receivable = 0, advances = 0, withBalance = 0, withAdvance = 0;
  var list = [];
  ds.customers.forEach(function (c) {
    var bal = balanceAsOf(c.openingPaise, ds.txnsByCustomer[c.customerId] || [], asOf);
    if (bal > 0) { receivable += bal; withBalance++; }
    if (bal < 0) { advances += -bal; withAdvance++; }
    list.push({ customer: c, balancePaise: bal });
  });
  return {
    receivablePaise: receivable,
    advancesPaise: advances,
    customersWithOutstanding: withBalance,
    customersWithAdvance: withAdvance,
    list: list
  };
}

function periodRangeFromPayload(payload, defaultPeriod) {
  var p = payload.period || ((payload.start || payload.end) ? 'CUSTOM' : defaultPeriod);
  return resolvePeriod(p, payload.start, payload.end);
}

function computeDashboard(ds, range) {
  var names = {};
  ds.customers.forEach(function (c) { names[c.customerId] = c.customerName; });
  var acc = emptyTotals();
  var all = [];
  var perCustomer = {};
  ds.customers.forEach(function (c) {
    (ds.txnsByCustomer[c.customerId] || []).forEach(function (t) {
      all.push(t);
      if (!inRange(t, range)) return;
      addToTotals(acc, t);
      if (t.status === 'VOID') return;
      var pc = perCustomer[c.customerId] || (perCustomer[c.customerId] = { billingPaise: 0, grams: 0, birds: 0, paymentsPaise: 0, count: 0 });
      pc.count++;
      if (t.transactionType === 'BILL') { pc.billingPaise += t.billPaise; pc.grams += t.grams; pc.birds += t.birdCount; }
      if (t.transactionType === 'PAYMENT') pc.paymentsPaise += t.paymentPaise;
    });
  });

  var now = outstandingSnapshot(ds, null);
  var atEnd = range.end >= range.today ? now : outstandingSnapshot(ds, range.end);

  var topBilling = Object.keys(perCustomer)
    .filter(function (id) { return perCustomer[id].billingPaise > 0; })
    .sort(function (a, b) { return perCustomer[b].billingPaise - perCustomer[a].billingPaise; })
    .slice(0, 5)
    .map(function (id) {
      var pc = perCustomer[id];
      return { customerId: id, customerName: names[id], billing: paiseToRupees(pc.billingPaise), weightKg: pc.grams / 1000, birds: pc.birds };
    });

  var topOutstanding = now.list
    .filter(function (x) { return x.balancePaise > 0; })
    .sort(function (a, b) { return b.balancePaise - a.balancePaise; })
    .slice(0, 5)
    .map(function (x) {
      return { customerId: x.customer.customerId, customerName: x.customer.customerName, phone: x.customer.phone, balance: paiseToRupees(x.balancePaise), status: x.customer.status };
    });

  var recent = all
    .filter(function (t) { return inRange(t, range); })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; })
    .slice(0, 10)
    .map(function (t) { var a = txnToApi(t); a.customerName = names[t.customerId]; return a; });

  var activeCustomers = ds.customers.filter(function (c) { return c.status === 'ACTIVE'; }).length;
  var totals = totalsToApi(acc);
  totals.activeCustomers = activeCustomers;
  totals.totalCustomers = ds.customers.length;
  totals.customersWithActivity = Object.keys(perCustomer).length;
  totals.outstanding = paiseToRupees(now.receivablePaise);
  totals.advances = paiseToRupees(now.advancesPaise);
  totals.netOutstanding = paiseToRupees(now.receivablePaise - now.advancesPaise);
  totals.customersWithOutstanding = now.customersWithOutstanding;
  totals.closingOutstanding = paiseToRupees(atEnd.receivablePaise);
  totals.closingNetOutstanding = paiseToRupees(atEnd.receivablePaise - atEnd.advancesPaise);

  return {
    range: range,
    totals: totals,
    chart: buildChart(all, range),
    topCustomersByBilling: topBilling,
    topOutstanding: topOutstanding,
    recentTransactions: recent,
    missingSheets: ds.missingSheets,
    loadedAt: ds.loadedAt
  };
}

function actionGetDashboard(payload) {
  var ds = loadDataset(optBool(payload.fresh));
  return computeDashboard(ds, periodRangeFromPayload(payload, 'DAY'));
}

function actionGetDashboardSummary(payload) {
  var d = actionGetDashboard(payload);
  return { range: d.range, totals: d.totals, loadedAt: d.loadedAt };
}

function actionGetDashboardChartData(payload) {
  var d = actionGetDashboard(payload);
  return { range: d.range, chart: d.chart };
}

function actionGetCustomerStatement(payload) {
  var id = reqCustomerId(payload.customerId);
  var ds = loadDataset(optBool(payload.fresh));
  var c = findCustomerOrFail(ds.customers, id);
  var range = periodRangeFromPayload(payload, 'MONTH');
  var st = buildStatement(c, ds.txnsByCustomer[id] || [], range);
  return {
    customer: customerToApi(c),
    range: range,
    openingBalance: st.openingBalance,
    closingBalance: st.closingBalance,
    currentBalance: st.currentBalance,
    totals: st.totals,
    rows: st.rows,
    generatedAt: nowIso()
  };
}

/**
 * Generic report. reportType:
 *   SUMMARY  – all activity in range (Daily/Weekly/Monthly/… reports)
 *   PAYMENTS – payments received only
 *   BILLING  – bills only, with birds/weight
 * Filters: customerId, transactionType, paymentMethod. Voided rows excluded.
 */
function actionGetReports(payload) {
  var ds = loadDataset(optBool(payload.fresh));
  var reportType = reqEnum(payload.reportType || 'SUMMARY', 'reportType', 'Report type', ['SUMMARY', 'PAYMENTS', 'BILLING']);
  var range = periodRangeFromPayload(payload, 'MONTH');
  var customerId = isBlank(payload.customerId) ? '' : reqCustomerId(payload.customerId);
  if (customerId) findCustomerOrFail(ds.customers, customerId);
  var type = reportType === 'PAYMENTS' ? 'PAYMENT' : reportType === 'BILLING' ? 'BILL' :
    (isBlank(payload.transactionType) ? '' : reqEnum(payload.transactionType, 'transactionType', 'Type', PBM.TXN_TYPES));
  var method = isBlank(payload.paymentMethod) ? '' : reqEnum(payload.paymentMethod, 'paymentMethod', 'Payment method', PBM.PAYMENT_METHODS);

  var acc = emptyTotals();
  var rows = [];
  var byCustomer = [];
  var byMethod = {};
  ds.customers.forEach(function (c) {
    if (customerId && c.customerId !== customerId) return;
    var txns = ds.txnsByCustomer[c.customerId] || [];
    var cAcc = emptyTotals();
    txns.forEach(function (t) {
      if (t.status === 'VOID' || !inRange(t, range)) return;
      if (type && t.transactionType !== type) return;
      if (method && t.paymentMethod !== method) return;
      addToTotals(acc, t);
      addToTotals(cAcc, t);
      if (t.transactionType === 'PAYMENT') byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] || 0) + t.paymentPaise;
      var a = txnToApi(t);
      a.customerName = c.customerName;
      rows.push(a);
    });
    var touched = cAcc.billCount + cAcc.paymentCount + cAcc.adjustmentCount > 0;
    var closing = balanceAsOf(c.openingPaise, txns, range.end);
    var current = balanceAsOf(c.openingPaise, txns, null);
    if (touched || (!type && !method && closing !== 0)) {
      var ct = totalsToApi(cAcc);
      byCustomer.push({
        customerId: c.customerId, customerName: c.customerName, phone: c.phone, status: c.status,
        billing: ct.billing, payments: ct.payments, adjustmentsDebit: ct.adjustmentsDebit, adjustmentsCredit: ct.adjustmentsCredit,
        birds: ct.birds, weightKg: ct.weightKg, billCount: ct.billCount, paymentCount: ct.paymentCount,
        openingBalance: paiseToRupees(balanceBefore(c.openingPaise, txns, range.start)),
        closingBalance: paiseToRupees(closing),
        currentBalance: paiseToRupees(current)
      });
    }
  });
  rows.sort(function (a, b) {
    if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
  byCustomer.sort(function (a, b) { return a.customerName.localeCompare(b.customerName); });

  var scoped = customerId ? { customers: ds.customers.filter(function (c) { return c.customerId === customerId; }), txnsByCustomer: ds.txnsByCustomer } : ds;
  var now = outstandingSnapshot(scoped, null);
  var atEnd = outstandingSnapshot(scoped, range.end);
  var totals = totalsToApi(acc);
  totals.currentOutstanding = paiseToRupees(now.receivablePaise);
  totals.currentNetOutstanding = paiseToRupees(now.receivablePaise - now.advancesPaise);
  totals.closingOutstanding = paiseToRupees(atEnd.receivablePaise);
  totals.closingNetOutstanding = paiseToRupees(atEnd.receivablePaise - atEnd.advancesPaise);

  return {
    reportType: reportType,
    range: range,
    filters: { customerId: customerId, transactionType: type, paymentMethod: method },
    totals: totals,
    paymentsByMethod: Object.keys(byMethod).map(function (m) { return { paymentMethod: m, amount: paiseToRupees(byMethod[m]) }; }),
    rows: rows,
    byCustomer: byCustomer,
    generatedAt: nowIso()
  };
}

/** Outstanding balances per customer, as of today or a past date. */
function actionGetOutstandingReport(payload) {
  var ds = loadDataset(optBool(payload.fresh));
  var today = todayStr();
  var asOf = isBlank(payload.asOf) ? today : reqDate(payload.asOf, 'asOf', 'As-of date');
  var includeZero = optBool(payload.includeZero);
  var snap = outstandingSnapshot(ds, asOf);
  var rows = snap.list
    .filter(function (x) { return includeZero || x.balancePaise !== 0; })
    .map(function (x) {
      var txns = (ds.txnsByCustomer[x.customer.customerId] || []).filter(function (t) { return t.status !== 'VOID' && t.transactionDate <= asOf; });
      var lastBill = '', lastPay = '';
      txns.forEach(function (t) {
        if (t.transactionType === 'BILL' && t.transactionDate > lastBill) lastBill = t.transactionDate;
        if (t.transactionType === 'PAYMENT' && t.transactionDate > lastPay) lastPay = t.transactionDate;
      });
      return {
        customerId: x.customer.customerId,
        customerName: x.customer.customerName,
        phone: x.customer.phone,
        status: x.customer.status,
        balance: paiseToRupees(x.balancePaise),
        lastBillDate: lastBill,
        lastPaymentDate: lastPay,
        daysSinceLastPayment: lastPay ? daysBetween(lastPay, asOf) : null
      };
    })
    .sort(function (a, b) { return b.balance - a.balance; });
  return {
    asOf: asOf,
    isHistorical: asOf < today,
    totals: {
      receivable: paiseToRupees(snap.receivablePaise),
      advances: paiseToRupees(snap.advancesPaise),
      net: paiseToRupees(snap.receivablePaise - snap.advancesPaise),
      customersWithOutstanding: snap.customersWithOutstanding,
      customersWithAdvance: snap.customersWithAdvance
    },
    rows: rows,
    generatedAt: nowIso()
  };
}
