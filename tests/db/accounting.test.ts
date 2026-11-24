/**
 * PRD v2.0 acceptance tests against the real migrations (PGlite).
 * Numbers in test names refer to PRD §16 checklist items.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { balance, customer, key, purchase, supplier, today, world, type World } from './setup';
import { daysAgo } from './harness';

let w: World;
beforeEach(async () => {
  w = await world();
});

async function orderFor(cust: string, items: { size: string; qty: number; rate?: string }[]) {
  return w.db.rpc('create_order', {
    p_business_id: w.biz,
    p: { customer_id: cust, order_date: today(), items: items.map((i) => ({ bird_size_id: i.size, qty: i.qty, rate: i.rate ?? null })) },
    p_idempotency_key: key('ord'),
  });
}

async function orderItems(orderId: string) {
  await w.db.asAdmin();
  const r = await w.db.rows<{ id: string; bird_size_id: string; ordered_qty: number; allocated_qty: number; delivered_qty: number }>(
    `select id, bird_size_id, ordered_qty, allocated_qty, delivered_qty from public.order_items where order_id = $1`, [orderId]);
  await w.db.asUser(w.owner);
  return r;
}

async function newTrip(driverId = w.driverId) {
  return (await w.db.rpc('create_trip', { p_business_id: w.biz, p: { trip_date: today(), vehicle_id: w.vehicle, driver_id: driverId }, p_idempotency_key: key('trip') })).id as string;
}

async function allocations(tripId: string) {
  await w.db.asAdmin();
  const r = await w.db.rows<{ id: string; customer_id: string; bird_size_id: string; allocated_qty: number; rate: string }>(
    `select id, customer_id, bird_size_id, allocated_qty, rate::text from public.trip_allocations where trip_id = $1`, [tripId]);
  return r;
}

describe('customers, suppliers and separate ledgers', () => {
  it('(1,2) creates customers and suppliers; receivable and payable stay separate for one party', async () => {
    const c = await customer(w, 'Rahul Traders', { opening_receivable: '17500' });
    const s = await supplier(w, 'Shinde Poultry Farm', { opening_payable: '20000' });
    expect(await balance(w, c, 'RECEIVABLE')).toBe(17500);
    expect(await balance(w, s, 'PAYABLE')).toBe(20000);

    // one identity that both buys and sells
    await w.db.asUser(w.owner);
    const both = (await w.db.rpc('create_party', { p_business_id: w.biz, p: { name: 'Patil Trader', phone: '9876500001', is_customer: true, is_supplier: true, opening_receivable: '1000', opening_payable: '3000' }, p_idempotency_key: key() })).id;
    expect(await balance(w, both, 'RECEIVABLE')).toBe(1000);
    expect(await balance(w, both, 'PAYABLE')).toBe(3000);
  });

  it('warns about duplicate names/mobiles and is idempotent on retry', async () => {
    await customer(w, 'Sai Hotel', { phone: '9822001122' });
    await w.db.asUser(w.owner);
    const err = await w.db.rpcError('create_party', { p_business_id: w.biz, p: { name: 'sai hotel', phone: '9000000001', is_customer: true }, p_idempotency_key: key() });
    expect(err).toMatch(/^DUPLICATE_PARTY/);
    const k = key();
    const a = await w.db.rpc('create_party', { p_business_id: w.biz, p: { name: 'Retry Shop', phone: '9111111111', is_customer: true }, p_idempotency_key: k });
    const b = await w.db.rpc('create_party', { p_business_id: w.biz, p: { name: 'Retry Shop', phone: '9111111111', is_customer: true }, p_idempotency_key: k });
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
  });

  it('rejects stale edits (optimistic concurrency) and restricts opening-balance changes to the owner', async () => {
    const c = await customer(w, 'Edit Me', { opening_receivable: '500' });
    await w.db.rpc('update_party', { p_business_id: w.biz, p_party_id: c, p_expected_version: 1, p: { address: 'Pune' } });
    expect(await w.db.rpcError('update_party', { p_business_id: w.biz, p_party_id: c, p_expected_version: 1, p: { notes: 'x' } })).toMatch(/^CONFLICT/);
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('update_party', { p_business_id: w.biz, p_party_id: c, p_expected_version: 2, p: { opening_receivable: '900' } })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    await w.db.rpc('update_party', { p_business_id: w.biz, p_party_id: c, p_expected_version: 2, p: { opening_receivable: '900' } });
    expect(await balance(w, c, 'RECEIVABLE')).toBe(900);
  });
});

describe('direct bills and customer payments (v1 features kept)', () => {
  it('bill = weight × rate rounded half-up; partial payment; overpayment rules', async () => {
    const c = await customer(w, 'Luis Hotel');
    await w.db.asUser(w.staff);
    const b = await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ bird_size_id: w.large, qty: 100, weight_kg: '135.8', rate: '114' }] }, p_idempotency_key: key('bill') });
    expect(Number(b.final_amount)).toBe(15481.2);
    const half = await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ qty: 1, weight_kg: '1.005', rate: '1' }] }, p_idempotency_key: key('bill') });
    expect(Number(half.final_amount)).toBe(1.01);

    const p1 = await w.db.rpc('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '5000', method: 'UPI', reference: 'UPI-1' }, p_idempotency_key: key('pay') });
    expect(Number(p1.balance)).toBe(10482.21);
    const over = await w.db.rpcError('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '20000', method: 'CASH' }, p_idempotency_key: key('pay') });
    expect(over).toMatch(/^OVERPAYMENT_NOT_ALLOWED/);

    await w.db.asUser(w.owner);
    await w.db.rpc('update_business', { p_business_id: w.biz, p_patch: { settings: { allow_customer_advance: true } } });
    expect(await w.db.rpcError('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '20000', method: 'CASH' }, p_idempotency_key: key('pay') })).toMatch(/^OVERPAYMENT_CONFIRMATION_REQUIRED/);
    const adv = await w.db.rpc('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '20000', method: 'CASH', confirm_overpayment: true }, p_idempotency_key: key('pay') });
    expect(Number(adv.balance)).toBe(-9517.79);
  });

  it('a final amount different from the calculation needs permission and a reason', async () => {
    const c = await customer(w, 'Discount Shop');
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, final_amount: '1000', adjustment_reason: 'round off', items: [{ qty: 10, weight_kg: '10', rate: '101' }] }, p_idempotency_key: key() })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    expect(await w.db.rpcError('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, final_amount: '1000', items: [{ qty: 10, weight_kg: '10', rate: '101' }] }, p_idempotency_key: key() })).toMatch(/reason/);
    const b = await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, final_amount: '1000', adjustment_reason: 'round off', items: [{ qty: 10, weight_kg: '10', rate: '101' }] }, p_idempotency_key: key() });
    expect(Number(b.calculated_amount)).toBe(1010);
    expect(Number(b.final_amount)).toBe(1000);
  });

  it('void creates a reversal; ledger history can never be edited or deleted', async () => {
    const c = await customer(w, 'Void Co');
    const b = await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ qty: 1, weight_kg: '10', rate: '100' }] }, p_idempotency_key: key() });
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('void_bill', { p_business_id: w.biz, p_bill_id: b.id, p_reason: 'wrong customer' })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    const v = await w.db.rpc('void_bill', { p_business_id: w.biz, p_bill_id: b.id, p_reason: 'wrong customer' });
    expect(Number(v.balance)).toBe(0);
    await w.db.asAdmin();
    const rows = await w.db.rows(`select entry_type, debit::text, credit::text from public.ledger_transactions where party_id = $1 order by created_at`, [c]);
    expect(rows.map((r: any) => r.entry_type)).toEqual(['BILL', 'REVERSAL']);
    await expect(w.db.pg.exec(`update public.ledger_transactions set debit = 1`)).rejects.toThrow(/IMMUTABLE/);
    await expect(w.db.pg.exec(`delete from public.ledger_transactions`)).rejects.toThrow(/IMMUTABLE/);
  });
});

describe('purchases and supplier payables', () => {
  it('(3,4,13) multi-size purchase, partial payment, payable balance and the PRD supplier summary', async () => {
    const s = await supplier(w, 'Shinde Poultry Farm', { opening_payable: '20000', opening_as_of: daysAgo(3) });
    const p = await purchase(w, s, [
      { size: w.large, qty: 400, kg: '1000.2', rate: '90' },
      { size: w.medium, qty: 200, kg: '486', rate: '90' },
    ]);
    expect(Number(p.final_amount)).toBe(133758);
    await w.db.rpc('record_payment', { p_business_id: w.biz, p: { party_id: s, direction: 'OUT', amount: '80000', method: 'BANK_TRANSFER' }, p_idempotency_key: key() });
    expect(await balance(w, s, 'PAYABLE')).toBe(73758);

    await w.db.asUser(w.owner);
    const sum = await w.db.rpc('party_daily_summary', { p_business_id: w.biz, p_party_id: s, p_ledger: 'PAYABLE', p_date: today() });
    expect(Number(sum.total_weight)).toBe(1486.2);
    expect(Number(sum.bill_amount)).toBe(133758);
    expect(Number(sum.paid_amount)).toBe(80000);
    expect(Number(sum.day_change)).toBe(53758);
    expect(Number(sum.previous_balance)).toBe(20000);
    expect(Number(sum.total_balance)).toBe(73758);
    expect(sum.lines.every((l: any) => Number(l.rate) === 90)).toBe(true);
  });

  it('staff without the suppliers permission cannot see or create purchases or payables', async () => {
    const s = await supplier(w, 'Hidden Farm', { opening_payable: '100' });
    await purchase(w, s, [{ size: w.large, qty: 10, kg: '20', rate: '90' }]);
    await w.db.asUser(w.staff);
    expect(await w.db.rows(`select * from public.purchases`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.ledger_transactions where ledger = 'PAYABLE'`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.parties where is_supplier`)).toHaveLength(0);
    expect(await w.db.rpcError('create_purchase', { p_business_id: w.biz, p: { supplier_id: s, items: [{ bird_size_id: w.large, qty: 1, weight_kg: '1', rate: '1' }] }, p_idempotency_key: key() })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.staffSup);
    expect(await w.db.rows(`select * from public.purchases`)).toHaveLength(1);
  });

  it('a purchase can only be voided while its birds are still in stock', async () => {
    const s = await supplier(w, 'Void Farm');
    const c = await customer(w, 'Buyer');
    const p = await purchase(w, s, [{ size: w.large, qty: 10, kg: '20', rate: '100' }]);
    await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ bird_size_id: w.large, qty: 5, weight_kg: '10', rate: '130' }] }, p_idempotency_key: key() });
    expect(await w.db.rpcError('void_purchase', { p_business_id: w.biz, p_purchase_id: p.id, p_reason: 'test' })).toMatch(/^STOCK_CONSUMED/);
  });
});

describe('orders, trips and the driver workflow', () => {
  it('(5,6) multi-size orders split across trips without over-allocation', async () => {
    const c = await customer(w, 'Rahul Traders', { default_rate: '125' });
    const o = await orderFor(c, [{ size: w.large, qty: 200 }, { size: w.medium, qty: 100 }]);
    const items = await orderItems(o.id);
    const large = items.find((i) => i.bird_size_id === w.large)!;
    const t1 = await newTrip();
    const t2 = await newTrip(w.otherDriverId);
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: t1, p_allocations: [{ order_item_id: large.id, qty: 150 }] });
    expect(await w.db.rpcError('allocate_to_trip', { p_business_id: w.biz, p_trip_id: t2, p_allocations: [{ order_item_id: large.id, qty: 60 }] })).toMatch(/^OVER_ALLOCATION/);
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: t2, p_allocations: [{ order_item_id: large.id, qty: 50 }] });
    const after = await orderItems(o.id);
    expect(after.find((i) => i.bird_size_id === w.large)!.allocated_qty).toBe(200);
    await w.db.asAdmin();
    expect((await w.db.one(`select status from public.orders where id = $1`, [o.id])).status).toBe('PARTIALLY_ALLOCATED');
  });

  it('allocation needs a rate; drivers cannot override it', async () => {
    const c = await customer(w, 'No Rate');
    const o = await orderFor(c, [{ size: w.small, qty: 10 }]);
    const t = await newTrip();
    const [it] = await orderItems(o.id);
    expect(await w.db.rpcError('allocate_to_trip', { p_business_id: w.biz, p_trip_id: t, p_allocations: [{ order_item_id: it.id, qty: 10 }] })).toMatch(/^RATE_MISSING/);
    await w.db.rpc('set_bird_size_rate', { p_business_id: w.biz, p_bird_size_id: w.small, p_kind: 'SALE', p_rate: '110', p_effective_from: daysAgo(1) });
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: t, p_allocations: [{ order_item_id: it.id, qty: 10 }] });
    expect((await allocations(t))[0].rate).toBe('110.00');
  });

  it('(7,8,9,10,11) driver sees only own trip, records a partial delivery → exactly one bill, remaining released, collection pending', async () => {
    const c = await customer(w, 'Rahul Traders', { address: 'Hadapsar, Pune' });
    const other = await customer(w, 'Not On Trip');
    const o = await orderFor(c, [{ size: w.large, qty: 200, rate: '130' }, { size: w.medium, qty: 100, rate: '120' }]);
    const items = await orderItems(o.id);
    const trip = await newTrip();
    const otherTrip = await newTrip(w.otherDriverId);
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: trip, p_allocations: items.map((i) => ({ order_item_id: i.id, qty: i.ordered_qty })) });

    // Driver can see own trip + this customer, nothing else
    await w.db.asUser(w.driverUser);
    expect((await w.db.rows(`select id from public.trips`)).map((r: any) => r.id)).toEqual([trip]);
    expect((await w.db.rows(`select name, address from public.parties`))).toEqual([{ name: 'Rahul Traders', address: 'Hadapsar, Pune' }]);
    expect(await w.db.rows(`select * from public.bills`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.ledger_transactions`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.purchases`)).toHaveLength(0);
    expect(await w.db.rpcError('get_dashboard', { p_business_id: w.biz })).toMatch(/^FORBIDDEN/);
    expect(await w.db.rpcError('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() })).toMatch(/^FORBIDDEN/);
    expect(await w.db.rpcError('record_loading', { p_business_id: w.biz, p_trip_id: otherTrip, p_entries: [] })).toMatch(/^FORBIDDEN/);
    const mine = await w.db.rpc('driver_trips', { p_business_id: w.biz });
    expect(mine).toHaveLength(1);
    expect(mine[0].birds).toBe(300);

    // loading + start
    await w.db.rpc('record_loading', { p_business_id: w.biz, p_trip_id: trip, p_entries: [{ bird_size_id: w.large, loaded_qty: 200 }, { bird_size_id: w.medium, loaded_qty: 100 }] });
    await w.db.rpc('set_trip_status', { p_business_id: w.biz, p_trip_id: trip, p_status: 'IN_PROGRESS' });

    const al = await allocations(trip);
    const aL = al.find((a) => a.bird_size_id === w.large)!;
    const aM = al.find((a) => a.bird_size_id === w.medium)!;
    await w.db.asUser(w.driverUser);
    const deliveryKey = key('del');
    const payload = {
      items: [
        { allocation_id: aL.id, delivered_qty: 200, weight_kg: '64.5' },
        { allocation_id: aM.id, delivered_qty: 80, weight_kg: '30.5', returned_qty: 20 },
      ],
      reason: 'Customer needed only 80 medium',
      collection: { amount: '5000', method: 'CASH' },
    };
    // driver cannot raise the rate
    expect(await w.db.rpcError('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c,
      p: { ...payload, items: [{ ...payload.items[0], rate: '140' }, payload.items[1]] }, p_idempotency_key: key() })).toMatch(/^FORBIDDEN/);
    // partial without reason is rejected
    expect(await w.db.rpcError('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c, p: { ...payload, reason: '' }, p_idempotency_key: key() })).toMatch(/reason/);
    // weight is required for delivered birds
    expect(await w.db.rpcError('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c,
      p: { ...payload, items: [{ allocation_id: aL.id, delivered_qty: 200 }, payload.items[1]] }, p_idempotency_key: key() })).toMatch(/weight/);

    const r1 = await w.db.rpc('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c, p: payload, p_idempotency_key: deliveryKey });
    expect(r1.status).toBe('PARTIAL');
    expect(Number(r1.bill_amount)).toBe(64.5 * 130 + 30.5 * 120); // 8385 + 3660 = 12045
    expect(r1.payment_status).toBe('PENDING_VERIFICATION');
    expect(r1.balance).toBeNull(); // drivers are not shown account balances
    // retry (network) returns the same result; a second delivery for the customer is refused
    const r2 = await w.db.rpc('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c, p: payload, p_idempotency_key: deliveryKey });
    expect(r2.duplicate).toBe(true);
    expect(r2.bill_id).toBe(r1.bill_id);
    expect(await w.db.rpcError('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c, p: payload, p_idempotency_key: key() })).toMatch(/^DUPLICATE/);
    expect(await w.db.rpcError('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: other, p: payload, p_idempotency_key: key() })).toMatch(/NOT_FOUND/);

    await w.db.asAdmin();
    expect((await w.db.one(`select count(*)::int n from public.bills where customer_id = $1`, [c])).n).toBe(1);
    // pending collection is NOT in the ledger yet
    expect(await balance(w, c, 'RECEIVABLE')).toBe(12045);
    // undelivered 20 medium are back on the order for another trip
    const oi = await orderItems(o.id);
    const med = oi.find((i) => i.bird_size_id === w.medium)!;
    expect(med).toMatchObject({ allocated_qty: 0, delivered_qty: 80 });
    await w.db.asAdmin();
    expect((await w.db.one(`select status from public.orders where id = $1`, [o.id])).status).toBe('PARTIALLY_ALLOCATED');

    // (11) verification posts the collection to the ledger exactly once
    const pay = await w.db.one(`select id from public.payments where trip_id = $1`, [trip]);
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: true })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.staffSup);
    await w.db.rpc('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: true });
    const again = await w.db.rpc('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: true });
    expect(again.unchanged).toBe(true);
    expect(await balance(w, c, 'RECEIVABLE')).toBe(7045);

    // (12) customer daily summary
    await w.db.asUser(w.owner);
    const s = await w.db.rpc('party_daily_summary', { p_business_id: w.biz, p_party_id: c, p_ledger: 'RECEIVABLE', p_date: today() });
    expect(s.total_qty).toBe(280);
    expect(Number(s.total_weight)).toBe(95);
    expect(Number(s.bill_amount)).toBe(12045);
    expect(Number(s.paid_amount)).toBe(5000);
    expect(Number(s.day_change)).toBe(7045);
    expect(Number(s.previous_balance)).toBe(0);
    expect(Number(s.total_balance)).toBe(7045);
  });

  it('failed delivery creates no bill and releases all birds; rejected collection never posts', async () => {
    const c = await customer(w, 'Closed Shop');
    const o = await orderFor(c, [{ size: w.large, qty: 50, rate: '130' }]);
    const [it] = await orderItems(o.id);
    const trip = await newTrip();
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: trip, p_allocations: [{ order_item_id: it.id, qty: 50 }] });
    await w.db.rpc('set_trip_status', { p_business_id: w.biz, p_trip_id: trip, p_status: 'DISPATCHED' });
    const [a] = await allocations(trip);
    await w.db.asUser(w.driverUser);
    const r = await w.db.rpc('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c,
      p: { items: [{ allocation_id: a.id, delivered_qty: 0, returned_qty: 50 }], reason: 'Shop closed' }, p_idempotency_key: key() });
    expect(r.status).toBe('FAILED');
    expect(r.bill_id).toBeNull();
    const pay = await w.db.rpc('record_collection', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c, p: { amount: '1000', method: 'UPI', reference: 'X1' }, p_idempotency_key: key() });
    expect(pay.status).toBe('PENDING_VERIFICATION');
    await w.db.asUser(w.owner);
    expect(await w.db.rpcError('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: false })).toMatch(/reason/);
    await w.db.rpc('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: false, p_reason: 'Not received in bank' });
    expect(await balance(w, c, 'RECEIVABLE')).toBe(0);
    const oi = await orderItems(o.id);
    expect(oi[0]).toMatchObject({ allocated_qty: 0, delivered_qty: 0 });
  });
});

describe('stock, COGS and profit & loss', () => {
  it('(17,18) weighted-average COGS charges only what was sold; unsold stock stays on hand', async () => {
    const s = await supplier(w, 'Farm A');
    const c = await customer(w, 'Hotel A');
    await purchase(w, s, [{ size: w.large, qty: 100, kg: '100', rate: '90' }]);   // 9,000
    await purchase(w, s, [{ size: w.large, qty: 100, kg: '100', rate: '100' }]);  // 10,000 → avg 95/kg
    await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ bird_size_id: w.large, qty: 60, weight_kg: '60', rate: '120' }] }, p_idempotency_key: key() });
    await w.db.rpc('create_expense', { p_business_id: w.biz, p: { category_id: (await w.db.one(`select id from public.expense_categories where business_id = $1 and name like 'Diesel%'`, [w.biz])).id, amount: '500' }, p_idempotency_key: key() });

    const pnl = await w.db.rpc('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() });
    expect(Number(pnl.sales)).toBe(7200);
    expect(Number(pnl.cogs)).toBe(5700);        // 60 kg × ₹95, not the full ₹19,000 purchased
    expect(Number(pnl.gross_profit)).toBe(1500);
    expect(Number(pnl.expenses)).toBe(500);
    expect(Number(pnl.net_profit)).toBe(1000);
    expect(Number(pnl.purchases)).toBe(19000);  // shown separately, not as cost
    expect(pnl.provisional).toBe(false);
    expect(Number(pnl.payable_total)).toBe(19000);
    expect(Number(pnl.receivable_total)).toBe(7200);
    const st = pnl.stock.find((x: any) => x.size === 'Large');
    expect(Number(st.weight_kg)).toBe(140);
    expect(Number(st.cost)).toBe(13300);

    // voiding the sale returns the kg and its cost to stock
    const bill = await w.db.one(`select id from public.bills where customer_id = $1`, [c]);
    await w.db.rpc('void_bill', { p_business_id: w.biz, p_bill_id: bill.id, p_reason: 'test void' });
    const pnl2 = await w.db.rpc('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() });
    expect(Number(pnl2.sales)).toBe(0);
    expect(Number(pnl2.cogs)).toBe(0);
    expect(Number(pnl2.stock.find((x: any) => x.size === 'Large').cost)).toBe(19000);
  });

  it('sales without recorded purchases mark the P&L provisional', async () => {
    const c = await customer(w, 'Early Buyer');
    await w.db.rpc('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ bird_size_id: w.small, qty: 10, weight_kg: '12', rate: '100' }] }, p_idempotency_key: key() });
    const pnl = await w.db.rpc('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() });
    expect(pnl.provisional).toBe(true);
    expect(pnl.provisional_reasons[0]).toMatchObject({ code: 'UNCOSTED_STOCK' });
  });

  it('P&L is owner-only and every view is audited', async () => {
    await w.db.asUser(w.staffSup);
    expect(await w.db.rpcError('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    await w.db.rpc('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() });
    expect((await w.db.rows(`select * from public.audit_logs where action = 'PNL_VIEW'`)).length).toBe(1);
    const d = await w.db.rpc('get_dashboard', { p_business_id: w.biz });
    expect(d.profit).toBeDefined();
    await w.db.asUser(w.staff);
    const ds = await w.db.rpc('get_dashboard', { p_business_id: w.biz });
    expect(ds.profit).toBeUndefined();
    expect(ds.payable_total).toBeUndefined();
  });
});

describe('expenses and trip settlement', () => {
  async function runTrip() {
    const s = await supplier(w, 'Farm S');
    const c = await customer(w, 'Cust S');
    await purchase(w, s, [{ size: w.large, qty: 100, kg: '200', rate: '90' }]);
    const o = await orderFor(c, [{ size: w.large, qty: 100, rate: '120' }]);
    const [it] = await orderItems(o.id);
    const trip = await newTrip();
    await w.db.rpc('allocate_to_trip', { p_business_id: w.biz, p_trip_id: trip, p_allocations: [{ order_item_id: it.id, qty: 100 }] });
    await w.db.rpc('record_loading', { p_business_id: w.biz, p_trip_id: trip, p_entries: [{ bird_size_id: w.large, loaded_qty: 100 }] });
    await w.db.rpc('set_trip_status', { p_business_id: w.biz, p_trip_id: trip, p_status: 'DISPATCHED' });
    const [a] = await allocations(trip);
    await w.db.asUser(w.driverUser);
    await w.db.rpc('record_delivery', { p_business_id: w.biz, p_trip_id: trip, p_customer_id: c,
      p: { items: [{ allocation_id: a.id, delivered_qty: 95, weight_kg: '190', damaged_qty: 2 }], reason: '3 short, 2 dead', collection: { amount: '10000', method: 'CASH' } }, p_idempotency_key: key() });
    await w.db.rpc('set_trip_status', { p_business_id: w.biz, p_trip_id: trip, p_status: 'COMPLETED' });
    await w.db.asUser(w.owner);
    return { trip, c };
  }

  it('(15,16) reconciles quantities, cash and expenses before the owner can close a trip', async () => {
    const { trip } = await runTrip();
    const cat = (await w.db.one(`select id from public.expense_categories where business_id = $1 and name like 'Diesel%'`, [w.biz])).id;
    await w.db.rpc('create_expense', { p_business_id: w.biz, p: { category_id: cat, amount: '1500', trip_id: trip }, p_idempotency_key: key() });
    expect(await w.db.rpcError('create_expense', { p_business_id: w.biz, p: { category_id: cat, amount: '1500' }, p_idempotency_key: key() })).toMatch(/^POSSIBLE_DUPLICATE/);

    let pv = await w.db.rpc('trip_settlement_preview', { p_business_id: w.biz, p_trip_id: trip });
    expect(pv.sizes[0]).toMatchObject({ loaded: 100, delivered: 95, damaged: 2, unexplained: 3 });
    expect(Number(pv.collections_pending)).toBe(10000);
    expect(Number(pv.expenses_amount)).toBe(1500);

    expect(await w.db.rpcError('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '10000' } })).toMatch(/pending driver collections/);
    const pay = await w.db.one(`select id from public.payments where trip_id = $1`, [trip]);
    await w.db.rpc('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: true });
    expect(await w.db.rpcError('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '10000' } })).toMatch(/explain the quantity or cash difference/);

    // record the 2 dead + 3 short as stock losses → nothing unexplained left
    await w.db.rpc('record_stock_loss', { p_business_id: w.biz, p_trip_id: trip, p_bird_size_id: w.large, p_qty: 2, p_kind: 'DEATH', p_note: 'died in transit' });
    await w.db.rpc('record_stock_loss', { p_business_id: w.biz, p_trip_id: trip, p_bird_size_id: w.large, p_qty: 3, p_kind: 'SHORTAGE', p_note: 'count short at farm' });
    pv = await w.db.rpc('trip_settlement_preview', { p_business_id: w.biz, p_trip_id: trip });
    expect(pv.sizes[0]).toMatchObject({ losses_recorded: 5, unaccounted: 0 });

    await w.db.asUser(w.staffSup);
    expect(await w.db.rpcError('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '10000' } })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    const done = await w.db.rpc('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '10000' } });
    expect(done.status).toBe('SETTLED');

    // driver no longer sees a settled trip
    await w.db.asUser(w.driverUser);
    expect(await w.db.rows(`select * from public.trips`)).toHaveLength(0);

    await w.db.asUser(w.owner);
    const pnl = await w.db.rpc('get_pnl', { p_business_id: w.biz, p_from: today(), p_to: today() });
    expect(Number(pnl.sales)).toBe(22800);         // 190 kg × 120
    expect(Number(pnl.cogs_goods)).toBe(17100);    // 190 kg × 90
    expect(Number(pnl.stock_loss)).toBe(900);      // the 5 lost birds = the last 10 kg in stock × ₹90
    expect(Number(pnl.net_profit)).toBe(22800 - 17100 - 900 - 1500);
    expect(pnl.trips[0]).toMatchObject({ trip_no: 'TRP-0001' });

    await w.db.rpc('reopen_trip', { p_business_id: w.biz, p_trip_id: trip, p_reason: 'recount' });
    expect((await w.db.one(`select status from public.trips where id = $1`, [trip])).status).toBe('COMPLETED');
    expect((await w.db.rows(`select action from public.audit_logs where action in ('TRIP_SETTLE','TRIP_REOPEN','STOCK_LOSS','PAYMENT_VERIFY')`)).length).toBe(5);
  });

  it('cash handover different from driver cash needs a note', async () => {
    const { trip } = await runTrip();
    const pay = await w.db.one(`select id from public.payments where trip_id = $1`, [trip]);
    await w.db.rpc('verify_payment', { p_business_id: w.biz, p_payment_id: pay.id, p_approve: true });
    await w.db.rpc('record_stock_loss', { p_business_id: w.biz, p_trip_id: trip, p_bird_size_id: w.large, p_qty: 5, p_kind: 'SHORTAGE', p_note: 'short' });
    expect(await w.db.rpcError('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '9500' } })).toMatch(/difference/);
    const ok = await w.db.rpc('settle_trip', { p_business_id: w.biz, p_trip_id: trip, p: { cash_handover: '9500', differences_note: 'Driver kept 500 for diesel' } });
    expect(ok.status).toBe('SETTLED');
  });
});

describe('security: tenants, roles and direct table access (19)', () => {
  it('another business cannot read or change this business', async () => {
    const c = await customer(w, 'Private Customer', { opening_receivable: '999' });
    await w.db.asUser(w.owner2);
    expect(await w.db.rows(`select * from public.parties`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.ledger_transactions`)).toHaveLength(0);
    expect(await w.db.rows(`select * from public.businesses`)).toHaveLength(1); // only their own
    expect(await w.db.rpcError('create_direct_bill', { p_business_id: w.biz, p: { customer_id: c, items: [{ qty: 1, weight_kg: '1', rate: '1' }] }, p_idempotency_key: key() })).toMatch(/^FORBIDDEN/);
    expect(await w.db.rpcError('get_dashboard', { p_business_id: w.biz })).toMatch(/^FORBIDDEN/);
    // cannot use this business's party inside their own business either
    expect(await w.db.rpcError('create_direct_bill', { p_business_id: w.biz2, p: { customer_id: c, items: [{ qty: 1, weight_kg: '1', rate: '1' }] }, p_idempotency_key: key() })).toMatch(/NOT_FOUND/);
  });

  it('clients cannot write tables directly, and anonymous users get nothing', async () => {
    await w.db.asUser(w.owner);
    await expect(w.db.pg.query(`insert into public.ledger_transactions (business_id, party_id, ledger, txn_date, entry_type, debit) values ($1, $1, 'RECEIVABLE', now(), 'BILL', 1)`, [w.biz])).rejects.toThrow(/permission denied/);
    await expect(w.db.pg.query(`update public.businesses set name = 'x'`)).rejects.toThrow(/permission denied/);
    await w.db.asUser(null);
    await expect(w.db.pg.query(`select * from public.parties`)).rejects.toThrow(/permission denied/);
    await expect(w.db.rpc('get_dashboard', { p_business_id: w.biz })).rejects.toThrow(/permission denied/);
  });

  it('only owners manage members; a disabled member loses access immediately', async () => {
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('upsert_member', { p_business_id: w.biz, p_user_id: w.staff, p_role: 'owner', p_display_name: 'me' })).toMatch(/^FORBIDDEN/);
    await w.db.asUser(w.owner);
    await w.db.rpc('upsert_member', { p_business_id: w.biz, p_user_id: w.staff, p_role: 'staff', p_display_name: 'Staff Plain', p_active: false });
    await w.db.asUser(w.staff);
    expect(await w.db.rows(`select * from public.parties`)).toHaveLength(0);
    expect(await w.db.rpcError('get_dashboard', { p_business_id: w.biz })).toMatch(/^FORBIDDEN/);
  });
});
