/**
 * End-to-end tests of the Apps Script backend against an in-memory
 * spreadsheet. Numbers in comments refer to the test plan in README §Testing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap, createBackend, ok, type Backend } from './harness';

const TODAY = '2026-10-24'; // a Saturday

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}
(globalThis as any).__vi_advance = () => vi.setSystemTime(new Date(Date.now() + 1));

function newCustomer(b: Backend, name: string, extra: Record<string, unknown> = {}) {
  return ok(b.call('createCustomer', { customerName: name, phone: '98765' + String(Math.floor(Math.random() * 1e5)).padStart(5, '0'), ...extra })).customer;
}

function bill(b: Backend, customerId: string, date: string, birds: number | string, kg: number | string, rate: number | string, extra: Record<string, unknown> = {}) {
  return b.call('createBill', { customerId, transactionDate: date, birdCount: birds, weightKg: kg, ratePerKg: rate, ...extra });
}

function pay(b: Backend, customerId: string, date: string, amount: number | string, extra: Record<string, unknown> = {}) {
  return b.call('createPayment', { customerId, transactionDate: date, amount, paymentMethod: 'CASH', ...extra });
}

function balanceOf(b: Backend, customerId: string) {
  return ok(b.call('getCustomer', { customerId })).summary.balance;
}

describe.each([
  ['SpreadsheetApp reads', false],
  ['Advanced Sheets batchGet reads', true],
])('backend (%s)', (_label, advancedSheets) => {
  let b: Backend;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setNow('2026-10-24T10:00:00+05:30');
    b = bootstrap({ advancedSheets });
  });
  afterEach(() => vi.useRealTimers());

  it('setup creates master sheets once and removes the bootstrap password', () => {
    expect(b.ss.getSheets().map((s) => s.name)).toEqual(['Clients', 'Settings', 'AuditLog', 'Dashboard']);
    expect(b.props.has('BOOTSTRAP_PASSWORD')).toBe(false);
    b.ctx.setup();
    expect(b.ss.getSheets().length).toBe(4);
    expect(b.ss.getSheetByName('Clients')!.grid.filter((r) => r[0] === 'customerId').length).toBe(1);
    const users = JSON.parse(b.props.get('PBM_USERS')!);
    expect(users.owner.hash).toBeTruthy();
    expect(JSON.stringify(users)).not.toContain('Owner#Pass123');
  });

  it('healthCheck works without auth and does not leak the spreadsheet ID', () => {
    const r = b.call('healthCheck', {}, { token: null });
    expect(r.success).toBe(true);
    expect(r.data.spreadsheetReachable).toBe(true);
    expect(r.data.setupComplete).toBe(true);
    expect(JSON.stringify(r)).not.toContain(b.ss.id);
  });

  it('(1,2,11) creates a customer with a dedicated tab and zero balance', () => {
    const c = newCustomer(b, 'Rahul Traders');
    expect(c.customerId).toBe('C0001');
    expect(c.sheetName).toBe('C0001 Rahul Traders');
    const tab = b.ss.getSheetByName('C0001 Rahul Traders')!;
    expect(tab).toBeTruthy();
    expect(tab.grid[0].slice(0, 3)).toEqual(['transactionId', 'transactionDate', 'transactionType']);
    const d = ok(b.call('getCustomer', { customerId: 'C0001' }));
    expect(d.summary.balance).toBe(0);
    expect(d.transactions).toEqual([]);
    expect(c.phone).toMatch(/^\+9198765\d{5}$/);
  });

  it('(3) bill amount = weight × rate with exact paise', () => {
    const c = newCustomer(b, 'Luis');
    const r = ok(bill(b, c.customerId, TODAY, 100, 135.8, 114));
    expect(r.transaction.billAmount).toBe(15481.2);
    expect(r.customerBalance).toBe(15481.2);
    // floating point trap: 0.1 kg × ₹0.3 would be 0.030000000000000002 in floats
    expect(ok(bill(b, c.customerId, TODAY, 1, '0.1', '0.3')).transaction.billAmount).toBe(0.03);
    // half-up rounding: 1.005 kg × ₹1 = ₹1.005 → ₹1.01
    expect(ok(bill(b, c.customerId, TODAY, 1, '1.005', '1')).transaction.billAmount).toBe(1.01);
    const row = b.ss.getSheetByName(c.sheetName)!.objects()[0];
    expect(row).toMatchObject({ transactionType: 'BILL', birdCount: 100, weightKg: 135.8, ratePerKg: 114, billAmount: 15481.2, paymentAmount: '' });
  });

  it('(4,5,6,7) partial and same-day payments, multiple same-day bills', () => {
    const c = newCustomer(b, 'Same Day Co');
    ok(bill(b, c.customerId, TODAY, 50, 70, 110));   // 7700
    ok(bill(b, c.customerId, TODAY, 20, 30.5, 112)); // 3416
    ok(pay(b, c.customerId, TODAY, 5000));
    ok(pay(b, c.customerId, TODAY, 2000.5, { paymentMethod: 'UPI', referenceNumber: 'UPI123' }));
    const d = ok(b.call('getCustomer', { customerId: c.customerId }));
    expect(d.summary.totalBilling).toBe(11116);
    expect(d.summary.totalPayments).toBe(7000.5);
    expect(d.summary.balance).toBe(4115.5);
    expect(d.transactions.length).toBe(4);
    expect(new Set(d.transactions.map((t: any) => t.transactionId)).size).toBe(4);
    expect(d.transactions[3].runningBalance).toBe(4115.5);
    const payRow = b.ss.getSheetByName(c.sheetName)!.objects()[2];
    expect(payRow).toMatchObject({ transactionType: 'PAYMENT', birdCount: '', weightKg: '', billAmount: '', paymentAmount: 5000 });
  });

  it('(8) editing an old bill recalculates the balance; stale edits are rejected', () => {
    const c = newCustomer(b, 'Edit Me');
    const t = ok(bill(b, c.customerId, '2026-09-01', 10, 20, 100)).transaction; // 2000
    ok(pay(b, c.customerId, '2026-09-05', 1500));
    expect(balanceOf(b, c.customerId)).toBe(500);
    const u = ok(b.call('updateTransaction', { customerId: c.customerId, transactionId: t.transactionId, expectedVersion: 1, weightKg: 25 }));
    expect(u.transaction.billAmount).toBe(2500);
    expect(u.transaction.version).toBe(2);
    expect(balanceOf(b, c.customerId)).toBe(1000);
    const stale = b.call('updateTransaction', { customerId: c.customerId, transactionId: t.transactionId, expectedVersion: 1, ratePerKg: 90 });
    expect(stale.error.code).toBe('CONFLICT');
    expect(balanceOf(b, c.customerId)).toBe(1000);
  });

  it('(9) voiding excludes the transaction but keeps the row', () => {
    const c = newCustomer(b, 'Void Test');
    ok(bill(b, c.customerId, TODAY, 10, 10, 100)); // 1000
    const p = ok(pay(b, c.customerId, TODAY, 400)).transaction;
    expect(b.call('voidTransaction', { customerId: c.customerId, transactionId: p.transactionId, expectedVersion: 1 }).error.field).toBe('reason');
    const v = ok(b.call('voidTransaction', { customerId: c.customerId, transactionId: p.transactionId, expectedVersion: 1, reason: 'Entered twice' }));
    expect(v.transaction.status).toBe('VOID');
    expect(v.customerBalance).toBe(1000);
    const dash = ok(b.call('getDashboard', { period: 'DAY' }));
    expect(dash.totals.payments).toBe(0);
    expect(dash.totals.voidCount).toBe(1);
    expect(b.ss.getSheetByName(c.sheetName)!.objects().length).toBe(2);
    const edit = b.call('updateTransaction', { customerId: c.customerId, transactionId: p.transactionId, expectedVersion: 2, amount: 1 });
    expect(edit.error.code).toBe('VALIDATION_ERROR');
  });

  it('(10) opening balance is included in balances and statements', () => {
    const c = newCustomer(b, 'Old Account', { openingBalance: '25000.50' });
    ok(bill(b, c.customerId, TODAY, 10, 10, 100));
    expect(balanceOf(b, c.customerId)).toBe(26000.5);
    const st = ok(b.call('getCustomerStatement', { customerId: c.customerId, period: 'DAY' }));
    expect(st.openingBalance).toBe(25000.5);
    expect(st.closingBalance).toBe(26000.5);
  });

  it('(12) duplicate names need confirmation and get distinct tabs', () => {
    newCustomer(b, 'Rahul');
    const dup = b.call('createCustomer', { customerName: '  rahul ', phone: '9000000001' });
    expect(dup.error.code).toBe('DUPLICATE_CUSTOMER');
    expect(dup.error.details.matches[0].customerId).toBe('C0001');
    const c2 = ok(b.call('createCustomer', { customerName: 'Rahul', phone: '9000000001', allowDuplicate: true })).customer;
    expect(c2.customerId).toBe('C0002');
    expect(c2.sheetName).toBe('C0002 Rahul');
  });

  it('sanitises tab names with forbidden characters and long names', () => {
    const c = ok(b.call('createCustomer', { customerName: "Sharma's [Chicken]: Shop/Depot *?", phone: '9111111111' })).customer;
    expect(c.sheetName).toBe('C0001 Sharmas Chicken Shop Depot');
    const long = ok(b.call('createCustomer', { customerName: 'A'.repeat(80), phone: '9111111112' })).customer;
    expect(long.sheetName.length).toBeLessThanOrEqual(90);
    expect(b.ss.getSheetByName(long.sheetName)).toBeTruthy();
  });

  it('(13) duplicate submissions with the same requestId create one record', () => {
    const r1 = b.call('createCustomer', { customerName: 'Retry', phone: '9222222222' }, { requestId: 'cust-req-0001' });
    const r2 = b.call('createCustomer', { customerName: 'Retry', phone: '9222222222' }, { requestId: 'cust-req-0001' });
    expect(r2.data.customer.customerId).toBe(r1.data.customer.customerId);
    expect(r2.data.duplicateRequest).toBe(true);
    expect(ok(b.call('listCustomers')).customers.length).toBe(1);
    const id = r1.data.customer.customerId;
    const p1 = ok(bill(b, id, TODAY, 1, 10, 100));
    expect(p1.duplicateRequest).toBe(false);
    const a = b.call('createBill', { customerId: id, transactionDate: TODAY, birdCount: 5, weightKg: 7, ratePerKg: 100 }, { requestId: 'bill-req-0001' });
    const a2 = b.call('createBill', { customerId: id, transactionDate: TODAY, birdCount: 5, weightKg: 7, ratePerKg: 100 }, { requestId: 'bill-req-0001' });
    expect(a2.data.transaction.transactionId).toBe(a.data.transaction.transactionId);
    expect(a2.data.duplicateRequest).toBe(true);
    expect(ok(b.call('getCustomer', { customerId: id })).transactions.length).toBe(2);
  });

  it('recovers when the customer tab was deleted (no duplicate customer)', () => {
    const c = newCustomer(b, 'Lost Tab');
    b.ss.deleteSheet(b.ss.getSheetByName(c.sheetName)!);
    b.ctx.clearDataCache();
    const d = ok(b.call('getCustomer', { customerId: c.customerId, fresh: true }));
    expect(d.sheetMissing).toBe(true);
    expect(ok(b.call('createCustomerSheet', { customerId: c.customerId })).created).toBe(true);
    ok(bill(b, c.customerId, TODAY, 1, 1, 100));
    expect(balanceOf(b, c.customerId)).toBe(100);
    expect(ok(b.call('listCustomers')).customers.length).toBe(1);
  });

  it('(14,15) period filters resolve to the documented inclusive ranges', () => {
    const r = (period: string, extra = {}) => ok(b.call('getDashboard', { period, ...extra })).range;
    expect(r('DAY')).toMatchObject({ start: '2026-10-24', end: '2026-10-24' });
    expect(r('WEEK')).toMatchObject({ start: '2026-10-19', end: '2026-10-24' }); // Monday
    expect(r('MONTH')).toMatchObject({ start: '2026-10-01', end: '2026-10-24' });
    expect(r('QUARTER')).toMatchObject({ start: '2026-07-01', end: '2026-10-24' });
    expect(r('HALF_YEAR')).toMatchObject({ start: '2026-04-01', end: '2026-10-24' });
    expect(r('YEAR')).toMatchObject({ start: '2025-10-01', end: '2026-10-24', granularity: 'month' });
    expect(r('CUSTOM', { start: '2026-01-01', end: '2026-01-31' })).toMatchObject({ start: '2026-01-01', end: '2026-01-31', granularity: 'day', days: 31 });
    expect(b.call('getDashboard', { period: 'CUSTOM', start: '2026-02-01', end: '2026-01-01' }).error.code).toBe('VALIDATION_ERROR');
    expect(b.call('getDashboard', { period: 'CUSTOM', start: '2026-02-30', end: '2026-03-01' }).error.code).toBe('VALIDATION_ERROR');

    // Sunday: week starts on the previous Monday
    setNow('2026-10-25T23:59:00+05:30');
    (b as any).token = b.login('owner', 'Owner#Pass123'); // sessions expire after 6 h
    expect(r('WEEK')).toMatchObject({ start: '2026-10-19', end: '2026-10-25' });
    // 00:30 IST on Monday is still Sunday in UTC — business date must be Monday
    setNow('2026-10-26T00:30:00+05:30');
    (b as any).token = b.login('owner', 'Owner#Pass123');
    expect(r('DAY')).toMatchObject({ start: '2026-10-26' });
    expect(r('WEEK')).toMatchObject({ start: '2026-10-26' });
  });

  it('(15) custom range boundaries are inclusive on both ends', () => {
    const c = newCustomer(b, 'Boundary');
    ok(bill(b, c.customerId, '2026-09-30', 1, 1, 100));
    ok(bill(b, c.customerId, '2026-10-01', 1, 2, 100));
    ok(bill(b, c.customerId, '2026-10-10', 1, 4, 100));
    ok(bill(b, c.customerId, '2026-10-11', 1, 8, 100));
    const d = ok(b.call('getDashboard', { period: 'CUSTOM', start: '2026-10-01', end: '2026-10-10' }));
    expect(d.totals.billing).toBe(600);
    expect(d.totals.billCount).toBe(2);
    expect(d.chart.length).toBe(10);
    expect(d.chart[0]).toMatchObject({ key: '2026-10-01', billing: 200 });
    expect(d.chart[9]).toMatchObject({ key: '2026-10-10', billing: 400 });
  });

  it('dashboard keeps billing, payments and current outstanding separate', () => {
    const a = newCustomer(b, 'Alpha', { openingBalance: 1000 });
    const z = newCustomer(b, 'Zeta');
    newCustomer(b, 'Idle');
    ok(bill(b, a.customerId, '2026-10-01', 100, 135.8, 114)); // 15481.20 (this month, not today)
    ok(bill(b, z.customerId, TODAY, 10, 12.5, 120));          // 1500 today
    ok(pay(b, a.customerId, TODAY, 3000));                    // payment against old balance, today
    const day = ok(b.call('getDashboard', { period: 'DAY' }));
    expect(day.totals.billing).toBe(1500);
    expect(day.totals.payments).toBe(3000);
    expect(day.totals.outstanding).toBe(1000 + 15481.2 + 1500 - 3000);
    expect(day.totals.activeCustomers).toBe(3);
    expect(day.totals.customersWithActivity).toBe(2);
    expect(day.totals.birds).toBe(10);
    expect(day.totals.weightKg).toBe(12.5);
    expect(day.totals.avgRatePerKg).toBe(120);
    const month = ok(b.call('getDashboard', { period: 'MONTH' }));
    expect(month.totals.billing).toBe(16981.2);
    expect(month.totals.outstanding).toBe(day.totals.outstanding);
    // weighted average: (15481.20 + 1500) / (135.8 + 12.5) = 114.506...
    expect(month.totals.avgRatePerKg).toBe(114.51);
    expect(month.topCustomersByBilling[0].customerName).toBe('Alpha');
    expect(month.topOutstanding[0]).toMatchObject({ customerName: 'Alpha', balance: 13481.2 });
    expect(month.recentTransactions.length).toBe(3);
  });

  it('(16,17) historical closing balance ignores later transactions', () => {
    const a = newCustomer(b, 'History A', { openingBalance: 500 });
    const z = newCustomer(b, 'History B');
    ok(bill(b, a.customerId, '2026-08-10', 1, 10, 100));  // 1000
    ok(pay(b, a.customerId, '2026-09-15', 700));
    ok(bill(b, z.customerId, '2026-09-20', 1, 20, 100));  // 2000
    ok(bill(b, a.customerId, '2026-10-05', 1, 5, 100));   // 500 (after period)
    const aug = ok(b.call('getReports', { reportType: 'SUMMARY', period: 'CUSTOM', start: '2026-08-01', end: '2026-08-31' }));
    expect(aug.totals.billing).toBe(1000);
    expect(aug.totals.closingOutstanding).toBe(1500);
    expect(aug.totals.currentOutstanding).toBe(500 + 1000 - 700 + 2000 + 500);
    const sep = ok(b.call('getReports', { reportType: 'SUMMARY', period: 'CUSTOM', start: '2026-09-01', end: '2026-09-30' }));
    expect(sep.totals.closingOutstanding).toBe(800 + 2000);
    const sepA = sep.byCustomer.find((x: any) => x.customerId === a.customerId);
    expect(sepA).toMatchObject({ openingBalance: 1500, payments: 700, closingBalance: 800, currentBalance: 1300 });
    const out = ok(b.call('getOutstandingReport', { asOf: '2026-09-30' }));
    expect(out.totals.receivable).toBe(2800);
    expect(out.isHistorical).toBe(true);
    const outNow = ok(b.call('getOutstandingReport', {}));
    expect(outNow.totals.receivable).toBe(3300);
    expect(outNow.rows[0].customerName).toBe('History B');
  });

  it('(18) customer statement has opening, running and closing balances', () => {
    const c = newCustomer(b, 'Statement', { openingBalance: 100 });
    ok(bill(b, c.customerId, '2026-09-28', 1, 1, 50));    // 50, before period
    ok(bill(b, c.customerId, '2026-10-02', 5, 10, 100));  // 1000
    ok(pay(b, c.customerId, '2026-10-03', 300));
    ok(bill(b, c.customerId, '2026-10-03', 2, 2, 100));   // 200
    const st = ok(b.call('getCustomerStatement', { customerId: c.customerId, period: 'MONTH' }));
    expect(st.openingBalance).toBe(150);
    expect(st.rows.map((r: any) => r.runningBalance)).toEqual([1150, 850, 1050]);
    expect(st.closingBalance).toBe(1050);
    expect(st.totals).toMatchObject({ billing: 1200, payments: 300, billCount: 2, paymentCount: 1, birds: 7, weightKg: 12 });
  });

  it('overpayment needs confirmation and the advance setting', () => {
    const c = newCustomer(b, 'Payer');
    ok(bill(b, c.customerId, TODAY, 1, 10, 100)); // 1000
    expect(pay(b, c.customerId, TODAY, 1500).error.code).toBe('OVERPAYMENT_NOT_ALLOWED');
    ok(b.call('updateSettings', { allowAdvancePayments: true }));
    const r = pay(b, c.customerId, TODAY, 1500);
    expect(r.error.code).toBe('OVERPAYMENT_CONFIRMATION_REQUIRED');
    expect(r.error.details).toMatchObject({ outstanding: 1000, excess: 500 });
    expect(ok(pay(b, c.customerId, TODAY, 1500, { confirmOverpayment: true })).customerBalance).toBe(-500);
    const dash = ok(b.call('getDashboard', { period: 'DAY' }));
    expect(dash.totals.outstanding).toBe(0);
    expect(dash.totals.advances).toBe(500);
  });

  it('validates numeric inputs strictly', () => {
    const c = newCustomer(b, 'Validator');
    const cases: [Record<string, unknown>, string][] = [
      [{ birdCount: -1 }, 'birdCount'],
      [{ birdCount: 1.5 }, 'birdCount'],
      [{ weightKg: 0 }, 'weightKg'],
      [{ weightKg: '12.3456' }, 'weightKg'],
      [{ weightKg: 'abc' }, 'weightKg'],
      [{ ratePerKg: '1e3' }, 'ratePerKg'],
      [{ ratePerKg: 0 }, 'ratePerKg'],
      [{ ratePerKg: -5 }, 'ratePerKg'],
      [{ transactionDate: '2026-10-25' }, 'transactionDate'],
      [{ transactionDate: '24/10/2026' }, 'transactionDate'],
    ];
    for (const [patch, field] of cases) {
      const r = b.call('createBill', { customerId: c.customerId, transactionDate: TODAY, birdCount: 1, weightKg: 1, ratePerKg: 100, ...patch });
      expect(r.success, JSON.stringify(patch)).toBe(false);
      expect(r.error.field, JSON.stringify(patch)).toBe(field);
    }
    expect(pay(b, c.customerId, TODAY, 0).error.field).toBe('amount');
    expect(b.call('createPayment', { customerId: c.customerId, transactionDate: TODAY, amount: 10, paymentMethod: 'CHEQUE' }).error.field).toBe('paymentMethod');
    expect(b.call('createBill', { customerId: 'X1', transactionDate: TODAY, birdCount: 1, weightKg: 1, ratePerKg: 1 }).error.field).toBe('customerId');
    expect(b.call('createBill', { customerId: 'C9999', transactionDate: TODAY, birdCount: 1, weightKg: 1, ratePerKg: 1 }).error.code).toBe('NOT_FOUND');
    ok(b.call('updateSettings', { allowZeroRate: true }));
    expect(ok(bill(b, c.customerId, TODAY, 1, 1, 0)).transaction.billAmount).toBe(0);
  });

  it('stores formula-like text safely', () => {
    const c = ok(b.call('createCustomer', { customerName: '=HYPERLINK("x")', phone: '9333333333', notes: '+cmd' })).customer;
    const row = b.ss.getSheetByName('Clients')!.objects()[0];
    expect(row.customerName).toBe('=HYPERLINK("x")'); // stored as literal text, not a formula
    expect(String(row.customerName)).not.toContain('#FORMULA');
    expect(c.customerName).toBe('=HYPERLINK("x")');
  });

  it('archives instead of deleting customers with history', () => {
    const c = newCustomer(b, 'Archive Me');
    ok(bill(b, c.customerId, TODAY, 1, 1, 100));
    expect(b.call('deleteCustomer', { customerId: c.customerId, confirmName: 'Archive Me' }).error.code).toBe('HAS_HISTORY');
    ok(b.call('archiveCustomer', { customerId: c.customerId, status: 'INACTIVE' }));
    expect(bill(b, c.customerId, TODAY, 1, 1, 100).error.code).toBe('CUSTOMER_INACTIVE');
    ok(pay(b, c.customerId, TODAY, 50)); // payments still allowed on archived accounts
    const dash = ok(b.call('getDashboard', { period: 'DAY' }));
    expect(dash.totals.activeCustomers).toBe(0);
    expect(dash.totals.outstanding).toBe(50); // archived balances still count
    const empty = newCustomer(b, 'Mistake');
    expect(b.call('deleteCustomer', { customerId: empty.customerId, confirmName: 'mistake' }).error.code).toBe('VALIDATION_ERROR');
    ok(b.call('deleteCustomer', { customerId: empty.customerId, confirmName: 'Mistake' }));
    expect(b.ss.getSheetByName(empty.sheetName)).toBeNull();
  });

  it('renaming a customer keeps the ID and renames the tab', () => {
    const c = newCustomer(b, 'Old Name');
    ok(bill(b, c.customerId, TODAY, 1, 1, 100));
    const u = ok(b.call('updateCustomer', { customerId: c.customerId, expectedVersion: 1, customerName: 'New Name' })).customer;
    expect(u.customerId).toBe(c.customerId);
    expect(u.sheetName).toBe('C0001 New Name');
    expect(balanceOf(b, c.customerId)).toBe(100);
    expect(b.call('updateCustomer', { customerId: c.customerId, expectedVersion: 1, notes: 'x' }).error.code).toBe('CONFLICT');
  });

  it('adjustments are owner-only, need a reason and affect balance', () => {
    const c = newCustomer(b, 'Adjust');
    ok(bill(b, c.customerId, TODAY, 1, 10, 100));
    expect(b.call('createAdjustment', { customerId: c.customerId, transactionDate: TODAY, direction: 'CREDIT', amount: 100 }).error.field).toBe('notes');
    ok(b.call('createAdjustment', { customerId: c.customerId, transactionDate: TODAY, direction: 'CREDIT', amount: 100, notes: 'Weight dispute' }));
    ok(b.call('createAdjustment', { customerId: c.customerId, transactionDate: TODAY, direction: 'DEBIT', amount: 25.5, notes: 'Crate charge' }));
    expect(balanceOf(b, c.customerId)).toBe(925.5);
  });

  it('(21) rejects unauthenticated, forged and unknown requests', () => {
    expect(b.call('listCustomers', {}, { token: null }).error.code).toBe('UNAUTHENTICATED');
    expect(b.call('listCustomers', {}, { token: 'A'.repeat(48) }).error.code).toBe('UNAUTHENTICATED');
    expect(b.call('deleteEverything', {}).error.code).toBe('UNKNOWN_ACTION');
    expect(b.call('__proto__', {}).error.code).toBe('UNKNOWN_ACTION');
    expect(b.ctx.handleRequest('not json').error.code).toBe('BAD_REQUEST');
    expect(b.ctx.handleRequest('x'.repeat(300000)).error.code).toBe('BAD_REQUEST');
    expect(b.call('login', { username: 'owner', password: 'wrong' }, { token: null }).error.code).toBe('INVALID_CREDENTIALS');
    ok(b.call('logout'));
    expect(b.call('listCustomers').error.code).toBe('UNAUTHENTICATED');
  });

  it('locks a username after repeated failed logins', () => {
    for (let i = 0; i < 5; i++) b.call('login', { username: 'owner', password: 'bad' + i }, { token: null });
    expect(b.call('login', { username: 'owner', password: 'Owner#Pass123' }, { token: null }).error.code).toBe('RATE_LIMITED');
  });

  it('enforces staff permissions', () => {
    ok(b.call('createUser', { username: 'staff1', password: 'Staff#Pass1', role: 'STAFF', displayName: 'Raju' }));
    const ownerToken = (b as any).token;
    const c = newCustomer(b, 'Perm Cust');
    const ownerBill = ok(bill(b, c.customerId, TODAY, 1, 10, 100)).transaction;
    (b as any).token = b.login('staff1', 'Staff#Pass1');
    const staffBill = ok(bill(b, c.customerId, TODAY, 1, 5, 100)).transaction;
    expect(b.call('updateTransaction', { customerId: c.customerId, transactionId: staffBill.transactionId, expectedVersion: 1, weightKg: 6 }).success).toBe(true);
    expect(b.call('updateTransaction', { customerId: c.customerId, transactionId: ownerBill.transactionId, expectedVersion: 1, weightKg: 6 }).error.code).toBe('FORBIDDEN');
    expect(b.call('voidTransaction', { customerId: c.customerId, transactionId: staffBill.transactionId, expectedVersion: 2, reason: 'test' }).error.code).toBe('FORBIDDEN');
    expect(b.call('updateSettings', { businessName: 'Hack' }).error.code).toBe('FORBIDDEN');
    expect(b.call('archiveCustomer', { customerId: c.customerId }).error.code).toBe('FORBIDDEN');
    expect(b.call('listUsers').error.code).toBe('FORBIDDEN');
    expect(b.call('getSettings').success).toBe(true);
    // next day the staff member can no longer edit yesterday's entry
    setNow('2026-10-25T09:00:00+05:30');
    expect(b.call('listCustomers').error.code).toBe('UNAUTHENTICATED'); // 6 h session expired overnight
    (b as any).token = b.login('staff1', 'Staff#Pass1');
    expect(b.call('updateTransaction', { customerId: c.customerId, transactionId: staffBill.transactionId, expectedVersion: 2, weightKg: 7 }).error.code).toBe('FORBIDDEN');
    // disabling the user kills their session immediately
    (b as any).token = b.login('owner', 'Owner#Pass123');
    void ownerToken;
    const staffToken = b.login('staff1', 'Staff#Pass1');
    ok(b.call('updateUser', { username: 'staff1', active: false }));
    expect(b.call('listCustomers', {}, { token: staffToken }).error.code).toBe('UNAUTHENTICATED');
    expect(b.call('updateUser', { username: 'owner', role: 'STAFF' }).error.code).toBe('VALIDATION_ERROR');
  });

  it('writes an audit trail without secrets', () => {
    const c = newCustomer(b, 'Audited');
    const t = ok(bill(b, c.customerId, TODAY, 1, 10, 100)).transaction;
    ok(b.call('voidTransaction', { customerId: c.customerId, transactionId: t.transactionId, expectedVersion: 1, reason: 'mistake' }));
    const log = ok(b.call('getAuditLog', { limit: 10 })).rows;
    expect(log.map((r: any) => r.action)).toEqual(expect.arrayContaining(['CUSTOMER_CREATE', 'BILL_CREATE', 'BILL_VOID', 'LOGIN']));
    const all = JSON.stringify(b.ss.getSheetByName('AuditLog')!.grid);
    expect(all).not.toContain('Owner#Pass123');
    expect(all).not.toContain((b as any).token);
  });

  it('cache is invalidated by writes and bypassed with fresh', () => {
    const c = newCustomer(b, 'Cache');
    ok(b.call('getDashboard', { period: 'DAY' }));
    ok(bill(b, c.customerId, TODAY, 1, 10, 100));
    expect(ok(b.call('getDashboard', { period: 'DAY' })).totals.billing).toBe(1000);
    // manual edit in the sheet (bypassing the API): visible with fresh=true
    const tab = b.ss.getSheetByName(c.sheetName)!;
    const h = tab.grid[0] as string[];
    tab.grid[1][h.indexOf('billAmount')] = 1234;
    expect(ok(b.call('getDashboard', { period: 'DAY' })).totals.billing).toBe(1000);
    expect(ok(b.call('getDashboard', { period: 'DAY', fresh: true })).totals.billing).toBe(1234);
  });

  it('reads manually typed dates and repairs manual rows', () => {
    const c = newCustomer(b, 'Manual');
    const tab = b.ss.getSheetByName(c.sheetName)!;
    const h = tab.grid[0] as string[];
    const row: any[] = h.map(() => '');
    row[h.indexOf('transactionDate')] = '20/10/2026';
    row[h.indexOf('transactionType')] = 'BILL';
    row[h.indexOf('birdCount')] = 3;
    row[h.indexOf('weightKg')] = 4;
    row[h.indexOf('ratePerKg')] = 100;
    tab.grid.push(row);
    b.ctx.clearDataCache();
    expect(ok(b.call('getCustomer', { customerId: c.customerId })).unidentifiedRows).toBe(1);
    b.ctx.repairManualRows();
    const d = ok(b.call('getCustomer', { customerId: c.customerId }));
    expect(d.unidentifiedRows).toBe(0);
    expect(d.transactions[0]).toMatchObject({ transactionDate: '2026-10-20', billAmount: 400 });
  });

  it('listTransactions filters by type, method and customer', () => {
    const a = newCustomer(b, 'List A');
    const z = newCustomer(b, 'List B');
    ok(bill(b, a.customerId, TODAY, 1, 1, 100));
    ok(pay(b, a.customerId, TODAY, 50, { paymentMethod: 'UPI' }));
    ok(bill(b, z.customerId, TODAY, 1, 1, 200));
    ok(pay(b, z.customerId, TODAY, 20, { paymentMethod: 'CASH' }));
    const all = ok(b.call('listTransactions', { period: 'DAY' }));
    expect(all.total).toBeGreaterThanOrEqual(4);
    const upi = ok(b.call('listTransactions', { period: 'DAY', paymentMethod: 'UPI' }));
    expect(upi.rows.map((r: any) => r.customerName)).toEqual(['List A']);
    const bills = ok(b.call('listTransactions', { period: 'DAY', transactionType: 'BILL', customerId: z.customerId }));
    expect(bills.totals.billing).toBe(200);
    const payRep = ok(b.call('getReports', { reportType: 'PAYMENTS', period: 'DAY' }));
    expect(payRep.rows.every((r: any) => r.transactionType === 'PAYMENT')).toBe(true);
    expect(payRep.paymentsByMethod.find((m: any) => m.paymentMethod === 'UPI').amount).toBe(50);
  });
});

describe('configuration errors', () => {
  it('(22) reports a clear error when the spreadsheet cannot be opened', () => {
    const b = createBackend({ spreadsheetId: 'WRONG_ID' });
    const h = b.call('healthCheck', {}, { token: null });
    expect(h.success).toBe(true);
    expect(h.data.spreadsheetReachable).toBe(false);
    expect(h.data.problem).toMatch(/SPREADSHEET_ID/);
  });

  it('reports setup incomplete before any user exists', () => {
    const b = createBackend();
    expect(b.call('healthCheck', {}, { token: null }).data.setupComplete).toBe(false);
    expect(b.call('login', { username: 'owner', password: 'whatever1' }, { token: null }).error.code).toBe('INVALID_CREDENTIALS');
  });
});
