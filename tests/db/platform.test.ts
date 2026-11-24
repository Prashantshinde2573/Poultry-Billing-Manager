/**
 * Platform rules: super admin only, plan modules, limits, expiry lock, suspension, leads.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { customer, key, supplier, world, type World } from './setup';

let w: World;
beforeEach(async () => {
  w = await world();
});

const setBiz = async (patch: Record<string, unknown>) => {
  await w.db.asUser(w.sa);
  await w.db.rpc('admin_update_business', { p_business_id: w.biz, p: patch });
  await w.db.asUser(w.owner);
};

describe('super admin', () => {
  it('only a super admin can use admin functions', async () => {
    expect(await w.db.rpcError('admin_businesses')).toMatch(/FORBIDDEN/);
    expect(await w.db.rpcError('admin_update_business', { p_business_id: w.biz, p: { renews_at: '2099-01-01' } })).toMatch(/FORBIDDEN/);
    expect(await w.db.rpcError('admin_renew', { p_business_id: w.biz, p: { months: 12, amount: 0 } })).toMatch(/FORBIDDEN/);
    await w.db.asUser(w.sa);
    const list = await w.db.rpc('admin_businesses');
    expect(list.map((b: any) => b.name).sort()).toEqual(['Other Farm', 'Shinde Poultry']);
  });

  it('owners cannot create their own business any more', async () => {
    const u = await w.db.createUser('Walk In');
    await w.db.asUser(u);
    expect(await w.db.rpcError('create_business', { p_name: 'Sneaky' })).toMatch(/permission denied/);
  });

  it('renewal extends from the current end date and records the payment', async () => {
    await w.db.asUser(w.sa);
    const before = (await w.db.rpc('admin_business', { p_business_id: w.biz })).business.renews_at as string;
    const r = await w.db.rpc('admin_renew', { p_business_id: w.biz, p: { plan_id: 'business', months: 6, amount: '4995', method: 'UPI', reference: 'UTR1' } });
    const d = new Date(before); d.setMonth(d.getMonth() + 6);
    expect(r.renews_at).toBe(d.toISOString().slice(0, 10));
    const ov = await w.db.rpc('admin_overview');
    expect(Number(ov.revenue_month)).toBe(4995);
    expect(Number(ov.mrr)).toBeGreaterThan(0);
  });
});

describe('plans', () => {
  it('basic plan cannot add suppliers, trips or expenses; pnl is pro-only', async () => {
    await setBiz({ plan_id: 'basic' });
    await customer(w, 'Allowed Customer');
    expect(await w.db.rpcError('create_party', { p_business_id: w.biz, p: { name: 'Farm X', is_supplier: true }, p_idempotency_key: key('s') })).toMatch(/PLAN_FEATURE/);
    expect(await w.db.rpcError('create_trip', { p_business_id: w.biz, p: {}, p_idempotency_key: key('t') })).toMatch(/PLAN_FEATURE/);
    expect(await w.db.rpcError('get_pnl', { p_business_id: w.biz, p_from: '2026-01-01', p_to: '2026-01-31' })).toMatch(/PLAN_FEATURE/);
    const dash = await w.db.rpc('get_dashboard', { p_business_id: w.biz });
    expect(dash.profit).toBeUndefined();
    await setBiz({ plan_id: 'business' });
    await supplier(w, 'Farm Y');
    expect(await w.db.rpcError('get_pnl', { p_business_id: w.biz, p_from: '2026-01-01', p_to: '2026-01-31' })).toMatch(/PLAN_FEATURE/);
  });

  it('plan limits stop extra drivers and vehicles', async () => {
    await setBiz({ plan_id: 'business' }); // 3 drivers, 3 vehicles; world has 2 drivers + 1 vehicle
    const d3 = await w.db.createUser('Driver Three');
    const d4 = await w.db.createUser('Driver Four');
    await w.db.asUser(w.owner);
    await w.db.rpc('upsert_member', { p_business_id: w.biz, p_user_id: d3, p_role: 'driver', p_display_name: 'D3' });
    expect(await w.db.rpcError('upsert_member', { p_business_id: w.biz, p_user_id: d4, p_role: 'driver', p_display_name: 'D4' })).toMatch(/PLAN_LIMIT/);
    await w.db.rpc('upsert_vehicle', { p_business_id: w.biz, p_id: null, p_registration_no: 'MH01A1', p_ownership: 'OWNED', p_description: '' });
    await w.db.rpc('upsert_vehicle', { p_business_id: w.biz, p_id: null, p_registration_no: 'MH01A2', p_ownership: 'OWNED', p_description: '' });
    expect(await w.db.rpcError('upsert_vehicle', { p_business_id: w.biz, p_id: null, p_registration_no: 'MH01A3', p_ownership: 'OWNED', p_description: '' })).toMatch(/PLAN_LIMIT/);
  });
});

describe('expiry and suspension', () => {
  it('an expired plan is read-only; grace keeps it open', async () => {
    const c = await customer(w, 'Ramesh', { opening_receivable: '500' });
    await setBiz({ renews_at: '2026-01-01', grace_until: '' });
    expect(await w.db.rpcError('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '100', method: 'CASH' }, p_idempotency_key: key('p') })).toMatch(/PLAN_LOCKED/);
    const list = await w.db.rows(`select * from public.list_parties($1, 'CUSTOMER')`, [w.biz]);
    expect(list.length).toBe(1); // still readable
    const acc = await w.db.rpc('my_account');
    expect(acc.state).toBe('EXPIRED');
    await setBiz({ grace_until: '2099-01-01' });
    expect((await w.db.rpc('my_account')).state).toBe('GRACE');
    await customer(w, 'Works In Grace');
  });

  it('a suspended business disappears for its team but my_account still explains why', async () => {
    await setBiz({ status: 'suspended' });
    expect(await w.db.rpcError('list_parties', { p_business_id: w.biz, p_kind: 'CUSTOMER' })).toMatch(/FORBIDDEN/);
    expect(await w.db.rows('select id from public.parties')).toEqual([]);
    const acc = await w.db.rpc('my_account');
    expect(acc.state).toBe('SUSPENDED');
    await setBiz({ status: 'active' });
    expect((await w.db.rpc('my_account')).state).toBe('ACTIVE');
  });
});

describe('website', () => {
  it('anyone can read plans and send an enquiry; enquiries are rate limited and private', async () => {
    await w.db.asUser(null);
    const plans = await w.db.rpc('public_plans');
    expect(plans.map((p: any) => p.id)).toEqual(['basic', 'business', 'pro']);
    await w.db.rpc('submit_lead', { p: { name: 'Sunil', phone: '98220 11111', city: 'Satara' } });
    await w.db.rpc('submit_lead', { p: { name: 'Sunil', phone: '9822011111' } });
    await w.db.rpc('submit_lead', { p: { name: 'Sunil', phone: '9822011111' } });
    expect(await w.db.rpcError('submit_lead', { p: { name: 'Sunil', phone: '9822011111' } })).toMatch(/RATE_LIMIT/);
    expect(await w.db.rpcError('admin_leads')).toMatch(/permission denied|FORBIDDEN/);
    await w.db.asUser(w.sa);
    expect((await w.db.rpc('admin_leads')).length).toBe(3);
  });

  it('owner can request a renewal; super admin sees it', async () => {
    await w.db.rpc('request_plan', { p_business_id: w.biz, p_plan_id: 'pro', p_months: 12, p_reference: 'UTR 778', p_note: '' });
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('request_plan', { p_business_id: w.biz, p_plan_id: 'pro', p_months: 12, p_reference: '', p_note: '' })).toMatch(/FORBIDDEN/);
    await w.db.asUser(w.sa);
    const reqs = await w.db.rpc('admin_requests');
    expect(reqs[0].business_name).toBe('Shinde Poultry');
    expect(Number(reqs[0].amount)).toBe(19990);
  });
});

describe('statements', () => {
  it('party statement returns a running balance', async () => {
    const c = await customer(w, 'Statement Shop', { opening_receivable: '1000', opening_as_of: '2026-01-01' });
    await w.db.rpc('record_payment', { p_business_id: w.biz, p: { party_id: c, direction: 'IN', amount: '400', method: 'CASH' }, p_idempotency_key: key('p') });
    const st = await w.db.rpc('party_statement', { p_business_id: w.biz, p_party_id: c, p_ledger: 'RECEIVABLE', p_from: '2026-01-01', p_to: '2099-01-01' });
    expect(st.rows.map((r: any) => Number(r.balance))).toEqual([1000, 600]);
    expect(Number(st.closing)).toBe(600);
  });
});
