import { Db, freshDb, today } from './harness';

export interface World {
  db: Db;
  biz: string;
  owner: string;
  staff: string;      // no extra permissions
  staffSup: string;   // suppliers + expenses + verify_payments
  driverUser: string;
  driverId: string;
  otherDriverUser: string;
  otherDriverId: string;
  vehicle: string;
  large: string;
  medium: string;
  small: string;
  // second tenant
  biz2: string;
  owner2: string;
}

let n = 0;
export const key = (p = 'k') => `${p}-${Date.now()}-${++n}`;

export async function world(): Promise<World> {
  const db = await freshDb();
  const owner = await db.createUser('Owner One');
  const staff = await db.createUser('Staff Plain');
  const staffSup = await db.createUser('Staff Accounts');
  const driverUser = await db.createUser('Driver Raju');
  const otherDriverUser = await db.createUser('Driver Sham');
  const owner2 = await db.createUser('Other Owner');

  const sa = await db.createUser('Super Admin');
  await db.asAdmin();
  await db.pg.query(`insert into public.platform_admins (user_id) values ($1)`, [sa]);
  await db.asUser(sa);
  const biz = (await db.rpc('admin_create_business', { p_owner: owner, p: { name: 'Shinde Poultry', owner_name: 'Owner One', plan_id: 'pro', months: 12 } })).id;
  const biz2 = (await db.rpc('admin_create_business', { p_owner: owner2, p: { name: 'Other Farm', owner_name: 'Owner Two', plan_id: 'pro', months: 12 } })).id;
  await db.asUser(owner);
  await db.rpc('upsert_member', { p_business_id: biz, p_user_id: staff, p_role: 'staff', p_display_name: 'Staff Plain', p_permissions: {} });
  await db.rpc('upsert_member', { p_business_id: biz, p_user_id: staffSup, p_role: 'staff', p_display_name: 'Staff Accounts',
    p_permissions: { suppliers: true, expenses: true, verify_payments: true } });
  await db.rpc('upsert_member', { p_business_id: biz, p_user_id: driverUser, p_role: 'driver', p_display_name: 'Raju' });
  await db.rpc('upsert_member', { p_business_id: biz, p_user_id: otherDriverUser, p_role: 'driver', p_display_name: 'Sham' });
  const vehicle = (await db.rpc('upsert_vehicle', { p_business_id: biz, p_id: null, p_registration_no: 'mh12ab1234', p_ownership: 'OWNED', p_description: 'Tempo' })).id;
  const sizes = await db.rows<{ id: string; name: string }>(`select id, name from public.bird_sizes where business_id = $1`, [biz]);
  const id = (nm: string) => sizes.find((s) => s.name === nm)!.id;
  const drivers = await db.rows<{ id: string; user_id: string }>(`select id, user_id from public.drivers where business_id = $1`, [biz]);


  return {
    db, sa, biz, owner, staff, staffSup, driverUser, otherDriverUser, owner2, biz2, vehicle,
    driverId: drivers.find((d) => d.user_id === driverUser)!.id,
    otherDriverId: drivers.find((d) => d.user_id === otherDriverUser)!.id,
    large: id('Large'), medium: id('Medium'), small: id('Small'),
  };
}

export async function customer(w: World, name: string, extra: Record<string, unknown> = {}) {
  return (await w.db.rpc('create_party', { p_business_id: w.biz, p: { name, phone: String(9000000000 + Math.floor(Math.random() * 99999999)), is_customer: true, ...extra }, p_idempotency_key: key('c') })).id as string;
}

export async function supplier(w: World, name: string, extra: Record<string, unknown> = {}) {
  return (await w.db.rpc('create_party', { p_business_id: w.biz, p: { name, phone: String(8000000000 + Math.floor(Math.random() * 99999999)), is_supplier: true, ...extra }, p_idempotency_key: key('s') })).id as string;
}

export async function balance(w: World, party: string, ledger: 'RECEIVABLE' | 'PAYABLE') {
  await w.db.asAdmin();
  const r = await w.db.one<{ b: string }>(`select private.party_balance($1, $2)::text b`, [party, ledger]);
  return Number(r.b);
}

export async function purchase(w: World, supplierId: string, items: { size: string; qty: number; kg: string; rate: string }[], extra: Record<string, unknown> = {}) {
  return w.db.rpc('create_purchase', {
    p_business_id: w.biz,
    p: { supplier_id: supplierId, purchase_date: today(), items: items.map((i) => ({ bird_size_id: i.size, qty: i.qty, weight_kg: i.kg, rate: i.rate })), ...extra },
    p_idempotency_key: key('pur'),
  });
}

export { today };
