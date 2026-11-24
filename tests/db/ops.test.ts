/**
 * Notifications, owner activity log, error log and online (Razorpay) plan payments.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { customer, world, type World } from './setup';

let w: World;
beforeEach(async () => {
  w = await world();
});

const asService = async () => {
  await w.db.asAdmin();
  await w.db.pg.exec('set role service_role');
};

describe('notifications', () => {
  it('owner hears about a plan renewal; staff does not; seen clears unread', async () => {
    await w.db.asUser(w.sa);
    await w.db.rpc('admin_renew', { p_business_id: w.biz, p: { plan_id: 'business', months: 1, amount: '999', method: 'UPI' } });
    await w.db.asUser(w.owner);
    const n = await w.db.rpc('my_notifications');
    expect(n.unread).toBe(1);
    expect(n.items[0].kind).toBe('PLAN_RENEWED');
    expect(n.items[0].link).toBe('/app/plan');
    await w.db.rpc('mark_notifications_seen');
    expect((await w.db.rpc('my_notifications')).unread).toBe(0);
    await w.db.asUser(w.staff);
    expect((await w.db.rpc('my_notifications')).items).toHaveLength(0);
    // the other business sees nothing
    await w.db.asUser(w.owner2);
    expect((await w.db.rpc('my_notifications')).items.some((x: any) => x.kind === 'PLAN_RENEWED')).toBe(false);
  });

  it('super admin hears about new leads and renewal requests; owners do not', async () => {
    await w.db.asUser(null);
    await w.db.rpc('submit_lead', { p: { name: 'Ramesh', phone: '9876543210', business_name: 'Ramesh Traders', city: 'Pune' } });
    await w.db.asUser(w.owner);
    await w.db.rpc('request_plan', { p_business_id: w.biz, p_plan_id: 'pro', p_months: 12, p_reference: 'UTR99', p_note: null });
    expect((await w.db.rpc('my_notifications')).items.some((x: any) => x.kind === 'LEAD_NEW')).toBe(false);
    await w.db.asUser(w.sa);
    const kinds = (await w.db.rpc('my_notifications')).items.map((x: any) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['LEAD_NEW', 'RENEWAL_REQUEST']));
  });
});

describe('activity log', () => {
  it('owner sees who did what; staff cannot open it', async () => {
    await customer(w, 'Patil Hotel');
    const a = await w.db.rpc('business_activity', { p_business_id: w.biz });
    const row = a.find((x: any) => x.action === 'PARTY_CREATE');
    expect(row).toBeTruthy();
    expect(row.actor_name).toBeTruthy();
    const mine = await w.db.rpc('business_activity', { p_business_id: w.biz, p_actor: w.staff });
    expect(mine).toHaveLength(0);
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('business_activity', { p_business_id: w.biz })).toMatch(/FORBIDDEN/);
    await w.db.asUser(w.owner2);
    expect(await w.db.rpcError('business_activity', { p_business_id: w.biz })).toMatch(/FORBIDDEN/);
  });
});

describe('error log', () => {
  it('anyone can report; repeats are counted; only super admin reads and resolves', async () => {
    await w.db.asUser(null);
    await w.db.rpc('log_error', { p: { source: 'client', message: 'boom', path: '/app' } });
    await w.db.rpc('log_error', { p: { source: 'client', message: 'boom', path: '/app' } });
    await w.db.asUser(w.owner);
    await w.db.rpc('log_error', { p: { source: 'action', message: 'save failed', code: 'UNKNOWN', path: '/app/orders' } });
    expect(await w.db.rpcError('admin_errors')).toMatch(/FORBIDDEN/);
    await w.db.asUser(w.sa);
    const e = await w.db.rpc('admin_errors');
    expect(e.open).toBe(2);
    const boom = e.items.find((x: any) => x.message === 'boom');
    expect(boom.meta.repeat).toBe(2);
    const save = e.items.find((x: any) => x.message === 'save failed');
    expect(save.business_name).toBe('Shinde Poultry');
    await w.db.rpc('admin_resolve_errors', { p_ids: `{${boom.id}}` });
    expect((await w.db.rpc('admin_errors')).open).toBe(1);
  });
});

describe('online plan payment', () => {
  it('owner gets a server price; only the server can mark it paid; applying twice is safe', async () => {
    await w.db.asUser(w.staff);
    expect(await w.db.rpcError('plan_quote', { p_business_id: w.biz, p_plan_id: 'pro', p_months: 12 })).toMatch(/FORBIDDEN/);
    await w.db.asUser(w.owner);
    const q = await w.db.rpc('plan_quote', { p_business_id: w.biz, p_plan_id: 'business', p_months: 6 });
    expect(Number(q.amount)).toBe(4995);
    expect(await w.db.rpcError('attach_plan_order', { p_business_id: w.biz, p_plan_id: 'business', p_months: 6, p_razorpay_order_id: 'bad id' })).toMatch(/VALIDATION/);
    await w.db.rpc('attach_plan_order', { p_business_id: w.biz, p_plan_id: 'business', p_months: 6, p_razorpay_order_id: 'order_TEST12345' });
    // a signed-in user cannot mark it paid
    expect(await w.db.rpcError('system_apply_plan_order', { p_razorpay_order_id: 'order_TEST12345', p_razorpay_payment_id: 'pay_X' })).toMatch(/permission denied/);

    await w.db.asUser(w.sa);
    const before = (await w.db.rpc('admin_business', { p_business_id: w.biz })).business.renews_at as string;
    await asService();
    const r = await w.db.rpc('system_apply_plan_order', { p_razorpay_order_id: 'order_TEST12345', p_razorpay_payment_id: 'pay_X' });
    const d = new Date(before); d.setMonth(d.getMonth() + 6);
    expect(r.renews_at).toBe(d.toISOString().slice(0, 10));
    const again = await w.db.rpc('system_apply_plan_order', { p_razorpay_order_id: 'order_TEST12345', p_razorpay_payment_id: 'pay_X' });
    expect(again.already).toBe(true);

    await w.db.asUser(w.sa);
    const biz = await w.db.rpc('admin_business', { p_business_id: w.biz });
    expect(biz.business.plan_id).toBe('business');
    expect(biz.business.renews_at).toBe(r.renews_at);
    expect((await w.db.rpc('my_notifications')).items.some((x: any) => x.kind === 'PAYMENT_ONLINE')).toBe(true);
  });
});
