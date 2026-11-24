import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localName } from '@/lib/i18n';
import type { Locale } from '@/lib/format';
import type { Ctx } from '@/lib/session';
import type { TripCustomer, LoadRow } from '@/components/trip/trip-office';
import { one } from './queries';

/** Everything the trip screens (office + driver) need, read under the caller's RLS. */
export async function loadTrip(ctx: Ctx, id: string, locale: Locale) {
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips')
    .select('id, trip_no, trip_date, status, version, notes, driver_id, vehicle_id, drivers(name, phone), vehicles(registration_no, ownership)')
    .eq('id', id).eq('business_id', ctx.businessId).maybeSingle();
  if (!trip) return null;
  const [{ data: allocs }, { data: loads }, { data: dels }, { data: pays }, { data: sizeRows }] = await Promise.all([
    supabase.from('trip_allocations').select('id, customer_id, bird_size_id, allocated_qty, rate, order_item_id, parties(name, phone), order_items(orders(order_no))').eq('trip_id', id),
    supabase.from('loading_entries').select('bird_size_id, loaded_qty, loaded_weight').eq('trip_id', id),
    supabase.from('deliveries').select('id, customer_id, status, reason, delivery_items(amount, delivered_qty, weight_kg, bird_size_id)').eq('trip_id', id),
    supabase.from('payments').select('party_id, amount, status').eq('trip_id', id).eq('direction', 'IN').in('status', ['PENDING_VERIFICATION', 'CONFIRMED']),
    supabase.from('bird_sizes').select('id, name, name_mr, name_hi, sort_order').eq('business_id', ctx.businessId).order('sort_order'),
  ]);
  const sizes = sizeRows ?? [];
  const sizeName = (sid: string) => { const s = sizes.find((x) => x.id === sid); return s ? localName(s, locale) : '—'; };
  const sortOf = (sid: string) => sizes.find((x) => x.id === sid)?.sort_order ?? 0;

  const custMap = new Map<string, TripCustomer & { allocIds: { id: string; order_no: string; size: string; qty: number; rate: string }[] }>();
  for (const a of (allocs ?? []).sort((x, y) => sortOf(x.bird_size_id) - sortOf(y.bird_size_id))) {
    const p = one(a.parties as any) as { name: string; phone: string | null } | null;
    let c = custMap.get(a.customer_id);
    if (!c) {
      c = { id: a.customer_id, name: p?.name ?? '—', phone: p?.phone ?? null, lines: [], delivery: null, bill: null, collected: 0, pending: 0, allocIds: [] };
      custMap.set(a.customer_id, c);
    }
    c.lines.push({ allocation_id: a.id, size: sizeName(a.bird_size_id), allocated_qty: a.allocated_qty, rate: String(a.rate) });
    c.allocIds.push({ id: a.id, order_no: (one((one(a.order_items as any) as any)?.orders) as any)?.order_no ?? '', size: sizeName(a.bird_size_id), qty: a.allocated_qty, rate: String(a.rate) });
  }
  for (const d of dels ?? []) {
    const c = custMap.get(d.customer_id);
    if (!c) continue;
    c.delivery = { status: d.status, reason: d.reason };
    c.bill = String(((d.delivery_items ?? []) as any[]).reduce((s, i) => s + Number(i.amount), 0));
  }
  for (const p of pays ?? []) {
    const c = custMap.get(p.party_id);
    if (!c) continue;
    c.collected += Number(p.amount);
    if (p.status === 'PENDING_VERIFICATION') c.pending += Number(p.amount);
  }

  const allocBySize = new Map<string, number>();
  for (const a of allocs ?? []) allocBySize.set(a.bird_size_id, (allocBySize.get(a.bird_size_id) ?? 0) + a.allocated_qty);
  const loadIds = new Set([...allocBySize.keys(), ...(loads ?? []).map((l) => l.bird_size_id)]);
  const loadRows: LoadRow[] = [...loadIds].sort((a, b) => sortOf(a) - sortOf(b)).map((sid) => {
    const l = (loads ?? []).find((x) => x.bird_size_id === sid);
    return { bird_size_id: sid, size: sizeName(sid), allocated: allocBySize.get(sid) ?? 0, loaded: l?.loaded_qty ?? null, loaded_weight: l?.loaded_weight != null ? String(l.loaded_weight) : null };
  });

  const customers = [...custMap.values()].sort((a, b) => Number(!!a.delivery) - Number(!!b.delivery) || a.name.localeCompare(b.name));
  return {
    trip: { ...trip, driver: one(trip.drivers as any) as { name: string; phone: string | null } | null, vehicle: one(trip.vehicles as any) as { registration_no: string; ownership: string } | null },
    customers, loadRows, sizes: sizes.map((s) => ({ id: s.id, name: localName(s, locale) })),
    totals: {
      birds: [...allocBySize.values()].reduce((a, b) => a + b, 0),
      delivered: customers.filter((c) => c.delivery).length,
      collected: customers.reduce((s, c) => s + c.collected, 0),
    },
  };
}
