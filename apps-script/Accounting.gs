/**
 * Accounting rules — pure functions with no spreadsheet access.
 *
 * SIGN CONVENTION (used everywhere in the app):
 *   balance > 0  → the customer owes the business (receivable / "baki")
 *   balance < 0  → the business owes the customer (advance / credit)
 *
 *   Current balance = opening balance
 *                   + Σ BILL amounts
 *                   + Σ ADJUSTMENT debits   (stored in billAmount)
 *                   − Σ PAYMENT amounts
 *                   − Σ ADJUSTMENT credits  (stored in paymentAmount)
 *   VOID transactions are ignored. Balances are always derived from the
 *   transactions; no running-balance column is ever trusted.
 *
 * DATE RULES (Asia/Kolkata business dates, start and end both inclusive):
 *   DAY       today … today
 *   WEEK      Monday of this week … today
 *   MONTH     1st of this month … today
 *   QUARTER   1st of the month 3 months back … today   (e.g. 24 Oct → 1 Jul)
 *   HALF_YEAR 1st of the month 6 months back … today   (e.g. 24 Oct → 1 Apr)
 *   YEAR      1st of the month 12 months back … today  (e.g. 24 Oct 2026 → 1 Oct 2025)
 *   CUSTOM    start … end as chosen
 */

function signedPaise(t) {
  if (t.status === 'VOID') return 0;
  switch (t.transactionType) {
    case 'BILL': return t.billPaise;
    case 'PAYMENT': return -t.paymentPaise;
    case 'ADJUSTMENT': return t.billPaise - t.paymentPaise;
    default: return 0;
  }
}

function compareTxns(a, b) {
  if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
}

function sortTxns(txns) {
  return txns.slice().sort(compareTxns);
}

/** Balance including all active transactions dated on or before asOf (inclusive). */
function balanceAsOf(openingPaise, txns, asOf) {
  var bal = openingPaise;
  for (var i = 0; i < txns.length; i++) {
    var t = txns[i];
    if (asOf && t.transactionDate > asOf) continue;
    bal += signedPaise(t);
  }
  return bal;
}

/** Balance from every transaction before the given date (exclusive). */
function balanceBefore(openingPaise, txns, date) {
  var bal = openingPaise;
  for (var i = 0; i < txns.length; i++) {
    if (txns[i].transactionDate < date) bal += signedPaise(txns[i]);
  }
  return bal;
}

function emptyTotals() {
  return {
    billingPaise: 0, paymentsPaise: 0, adjDebitPaise: 0, adjCreditPaise: 0,
    billCount: 0, paymentCount: 0, adjustmentCount: 0, voidCount: 0,
    birds: 0, grams: 0, billPaiseWithWeight: 0
  };
}

/** Adds one transaction's activity to a totals accumulator. */
function addToTotals(acc, t) {
  if (t.status === 'VOID') { acc.voidCount++; return acc; }
  if (t.transactionType === 'BILL') {
    acc.billingPaise += t.billPaise;
    acc.billCount++;
    acc.birds += t.birdCount;
    acc.grams += t.grams;
    if (t.grams > 0) acc.billPaiseWithWeight += t.billPaise;
  } else if (t.transactionType === 'PAYMENT') {
    acc.paymentsPaise += t.paymentPaise;
    acc.paymentCount++;
  } else if (t.transactionType === 'ADJUSTMENT') {
    acc.adjDebitPaise += t.billPaise;
    acc.adjCreditPaise += t.paymentPaise;
    acc.adjustmentCount++;
  }
  return acc;
}

function inRange(t, range) {
  return t.transactionDate >= range.start && t.transactionDate <= range.end;
}

/** Converts a paise/grams totals accumulator to the API shape (rupees/kg). */
function totalsToApi(acc) {
  var avgRatePaise = acc.grams > 0 ? Math.round(acc.billPaiseWithWeight * 1000 / acc.grams) : 0;
  return {
    billing: paiseToRupees(acc.billingPaise),
    payments: paiseToRupees(acc.paymentsPaise),
    adjustmentsDebit: paiseToRupees(acc.adjDebitPaise),
    adjustmentsCredit: paiseToRupees(acc.adjCreditPaise),
    netChange: paiseToRupees(acc.billingPaise + acc.adjDebitPaise - acc.paymentsPaise - acc.adjCreditPaise),
    billCount: acc.billCount,
    paymentCount: acc.paymentCount,
    adjustmentCount: acc.adjustmentCount,
    voidCount: acc.voidCount,
    birds: acc.birds,
    weightKg: acc.grams / 1000,
    avgRatePerKg: paiseToRupees(avgRatePaise)
  };
}

/** Resolves a named period (or custom start/end) into an inclusive date range. */
function resolvePeriod(period, start, end, today) {
  today = today || todayStr();
  var p = String(period || 'DAY').toUpperCase();
  if (PBM.PERIODS.indexOf(p) === -1) validationError('Unknown period: ' + period, 'period');
  var r;
  switch (p) {
    case 'DAY': r = { start: today, end: today, label: 'Today' }; break;
    case 'WEEK': r = { start: addDays(today, 1 - isoWeekday(today)), end: today, label: 'This week' }; break;
    case 'MONTH': r = { start: firstOfMonthOffset(today, 0), end: today, label: 'This month' }; break;
    case 'QUARTER': r = { start: firstOfMonthOffset(today, 3), end: today, label: 'Last 3 months' }; break;
    case 'HALF_YEAR': r = { start: firstOfMonthOffset(today, 6), end: today, label: 'Last 6 months' }; break;
    case 'YEAR': r = { start: firstOfMonthOffset(today, 12), end: today, label: 'Last 12 months' }; break;
    case 'CUSTOM':
      var s = reqDate(start, 'start', 'Start date');
      var e = reqDate(end, 'end', 'End date');
      if (s > e) validationError('Start date must be on or before the end date', 'start');
      if (daysBetween(s, e) > 3660) validationError('Custom range cannot exceed 10 years', 'end');
      r = { start: s, end: e, label: 'Custom range' };
      break;
  }
  r.period = p;
  r.days = daysBetween(r.start, r.end) + 1;
  r.granularity = r.days <= 62 ? 'day' : 'month';
  r.today = today;
  r.isHistorical = r.end < today;
  return r;
}

/** Builds empty chart buckets (daily or monthly) covering the range. */
function chartBuckets(range) {
  var buckets = [];
  if (range.granularity === 'day') {
    var d = range.start;
    while (d <= range.end) {
      buckets.push({ key: d, start: d, end: d, billingPaise: 0, paymentsPaise: 0, grams: 0, birds: 0 });
      d = addDays(d, 1);
    }
  } else {
    var m = range.start.substring(0, 7) + '-01';
    while (m <= range.end) {
      var next = firstOfMonthOffset(m, -1);
      buckets.push({ key: m.substring(0, 7), start: m, end: addDays(next, -1), billingPaise: 0, paymentsPaise: 0, grams: 0, birds: 0 });
      m = next;
    }
  }
  return buckets;
}

function buildChart(allTxns, range) {
  var buckets = chartBuckets(range);
  var index = {};
  buckets.forEach(function (b, i) { index[b.key] = i; });
  allTxns.forEach(function (t) {
    if (t.status === 'VOID' || !inRange(t, range)) return;
    var key = range.granularity === 'day' ? t.transactionDate : t.transactionDate.substring(0, 7);
    var b = buckets[index[key]];
    if (!b) return;
    if (t.transactionType === 'BILL') { b.billingPaise += t.billPaise; b.grams += t.grams; b.birds += t.birdCount; }
    if (t.transactionType === 'PAYMENT') b.paymentsPaise += t.paymentPaise;
  });
  return buckets.map(function (b) {
    return {
      key: b.key, start: b.start, end: b.end,
      billing: paiseToRupees(b.billingPaise),
      payments: paiseToRupees(b.paymentsPaise),
      weightKg: b.grams / 1000,
      birds: b.birds
    };
  });
}

/** Lifetime summary for one customer. */
function customerSummary(customer, txns) {
  var acc = emptyTotals();
  var last = '';
  var lastPayment = '';
  var active = 0;
  txns.forEach(function (t) {
    addToTotals(acc, t);
    if (t.status === 'VOID') return;
    active++;
    if (t.transactionDate > last) last = t.transactionDate;
    if (t.transactionType === 'PAYMENT' && t.transactionDate > lastPayment) lastPayment = t.transactionDate;
  });
  var balance = balanceAsOf(customer.openingPaise, txns, null);
  return {
    openingBalance: paiseToRupees(customer.openingPaise),
    totalBilling: paiseToRupees(acc.billingPaise),
    totalPayments: paiseToRupees(acc.paymentsPaise),
    totalAdjustmentsDebit: paiseToRupees(acc.adjDebitPaise),
    totalAdjustmentsCredit: paiseToRupees(acc.adjCreditPaise),
    balance: paiseToRupees(balance),
    balancePaise: balance,
    birds: acc.birds,
    weightKg: acc.grams / 1000,
    billCount: acc.billCount,
    paymentCount: acc.paymentCount,
    adjustmentCount: acc.adjustmentCount,
    transactionCount: active,
    lastTransactionDate: last,
    lastPaymentDate: lastPayment
  };
}

/** Statement rows with running balance for an inclusive range. */
function buildStatement(customer, txns, range) {
  var sorted = sortTxns(txns);
  var opening = balanceBefore(customer.openingPaise, sorted, range.start);
  var running = opening;
  var acc = emptyTotals();
  var rows = [];
  sorted.forEach(function (t) {
    if (!inRange(t, range)) return;
    addToTotals(acc, t);
    if (t.status === 'VOID') return;
    var s = signedPaise(t);
    running += s;
    rows.push({
      transaction: txnToApi(t),
      debit: paiseToRupees(s > 0 ? s : 0),
      credit: paiseToRupees(s < 0 ? -s : 0),
      runningBalance: paiseToRupees(running)
    });
  });
  return {
    openingBalance: paiseToRupees(opening),
    closingBalance: paiseToRupees(running),
    currentBalance: paiseToRupees(balanceAsOf(customer.openingPaise, sorted, null)),
    totals: totalsToApi(acc),
    rows: rows
  };
}

function txnToApi(t) {
  return {
    transactionId: t.transactionId,
    customerId: t.customerId,
    transactionDate: t.transactionDate,
    transactionType: t.transactionType,
    birdCount: t.transactionType === 'BILL' ? t.birdCount : null,
    weightKg: t.transactionType === 'BILL' ? t.grams / 1000 : null,
    ratePerKg: t.transactionType === 'BILL' ? paiseToRupees(t.ratePaise) : null,
    billAmount: paiseToRupees(t.billPaise),
    paymentAmount: paiseToRupees(t.paymentPaise),
    amount: paiseToRupees(Math.abs(t.billPaise - t.paymentPaise)),
    direction: signedPaiseIgnoringVoid(t) >= 0 ? 'DEBIT' : 'CREDIT',
    paymentMethod: t.transactionType === 'PAYMENT' ? t.paymentMethod : null,
    referenceNumber: t.referenceNumber,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy,
    updatedBy: t.updatedBy,
    status: t.status,
    version: t.version,
    voidedAt: t.voidedAt,
    voidedBy: t.voidedBy,
    voidReason: t.voidReason
  };
}

function signedPaiseIgnoringVoid(t) {
  return signedPaise({ status: 'ACTIVE', transactionType: t.transactionType, billPaise: t.billPaise, paymentPaise: t.paymentPaise });
}

function customerToApi(c, summary) {
  var out = {
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
    version: c.version
  };
  if (summary) {
    var s = {};
    for (var k in summary) if (k !== 'balancePaise') s[k] = summary[k];
    out.summary = s;
  }
  return out;
}
