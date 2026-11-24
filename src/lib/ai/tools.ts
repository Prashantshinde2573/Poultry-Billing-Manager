import 'server-only';
import type { Ctx } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { localName } from '@/lib/i18n';
import type { Locale } from '@/lib/format';

/**
 * Read-only tools the AI may call. Every tool runs as the signed-in owner through the
 * same secured reports the app uses (RPCs / row-level security), scoped to their
 * business. Nothing here can create, change or delete data.
 */

const DATE = { type: 'string', description: 'Date as YYYY-MM-DD (India time).' };

export const TOOL_DECLARATIONS = [
  {
    name: 'today_summary',
    description: "One day's overview: sales, money received, purchases, amounts owed by customers and to suppliers, birds ordered/loaded/delivered by size, open trips. Defaults to today.",
    parameters: { type: 'object', properties: { date: DATE } },
  },
  {
    name: 'balances',
    description: 'Every customer (kind=CUSTOMER, money they owe us) or supplier/farm (kind=SUPPLIER, money we owe them) with current balance and last activity date, highest first.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['CUSTOMER', 'SUPPLIER'] } }, required: ['kind'] },
  },
  {
    name: 'party_khata',
    description: "One party's khata (ledger) between two dates: opening, closing and current balance, every bill/purchase with birds, weight and rate per size, payments, and totals of birds and kg. Use a name or part of a name.",
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Party name or part of it' }, kind: { type: 'string', enum: ['CUSTOMER', 'SUPPLIER'] }, from: DATE, to: DATE },
      required: ['name'],
    },
  },
  {
    name: 'sales',
    description: 'Sales bills between two dates, grouped by customer and by day: amount, birds and kg. Optional customer name filter.',
    parameters: { type: 'object', properties: { from: DATE, to: DATE, name: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name: 'purchases',
    description: 'Bird purchases from farms/suppliers between two dates, grouped by supplier and by day: amount, birds and kg.',
    parameters: { type: 'object', properties: { from: DATE, to: DATE, name: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name: 'trips',
    description: 'Vehicle trips between two dates: trip number, date, vehicle, driver, status, customers delivered, load weight, delivered weight, dead birds and weight loss.',
    parameters: { type: 'object', properties: { from: DATE, to: DATE }, required: ['from', 'to'] },
  },
  {
    name: 'expenses',
    description: 'Expenses between two dates grouped by category, with trip number when linked to a trip.',
    parameters: { type: 'object', properties: { from: DATE, to: DATE }, required: ['from', 'to'] },
  },
  {
    name: 'profit',
    description: 'Profit and loss between two dates: sales, cost of birds sold, gross profit, expenses, net profit, by size. Owner only, needs the profit feature in the plan.',
    parameters: { type: 'object', properties: { from: DATE, to: DATE }, required: ['from', 'to'] },
  },
];

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const okDate = (d: unknown, fallback: string) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function runTool(name: string, args: Record<string, any>, ctx: Ctx, locale: Locale, today: string): Promise<unknown> {
  const supabase = await createClient();
  const biz = ctx.businessId;
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, { p_business_id: biz, ...a });
    if (error) throw new Error(error.message);
    return data as any;
  };
  const from = okDate(args.from, today.slice(0, 8) + '01');
  const to = okDate(args.to, today);
  const sizeName = (s: any) => (s ? localName(s, locale) : '');

  switch (name) {
    case 'today_summary': {
      const d = await rpc('get_dashboard', { p_date: okDate(args.date, today) });
      return {
        date: okDate(args.date, today), sales: n(d.sales_today), bills: d.bills_today, received: n(d.received_today), purchases: n(d.purchases_today),
        customers_owe_total: n(d.receivable_total), customers_with_dues: d.customers_with_dues, we_owe_suppliers: d.payable_total != null ? n(d.payable_total) : undefined,
        birds_by_size: (d.sizes ?? []).map((s: any) => ({ size: sizeName(s), ordered: s.ordered, loaded: s.loaded, delivered: s.delivered, remaining: s.remaining })),
        open_trips: (d.active_trips ?? []).map((t: any) => ({ trip: t.trip_no, vehicle: t.vehicle, driver: t.driver, status: t.status, delivered: `${t.delivered}/${t.customers}` })),
        collections_waiting_verification: d.pending_verification,
      };
    }
    case 'balances': {
      const kind = args.kind === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
      const rows = (await rpc('list_parties', { p_kind: kind })) as any[];
      const list = rows.map((r) => ({ name: r.name, balance: n(kind === 'CUSTOMER' ? r.receivable : r.payable), last_activity: r.last_activity, status: r.status }))
        .sort((a, b) => b.balance - a.balance);
      return { kind, total: n(list.reduce((s, r) => s + r.balance, 0)), count: list.length, parties: list.slice(0, 80) };
    }
    case 'party_khata': {
      const want = norm(String(args.name ?? ''));
      const kinds: ('CUSTOMER' | 'SUPPLIER')[] = args.kind === 'SUPPLIER' ? ['SUPPLIER'] : args.kind === 'CUSTOMER' ? ['CUSTOMER'] : ['CUSTOMER', 'SUPPLIER'];
      let match: { id: string; name: string; kind: 'CUSTOMER' | 'SUPPLIER' }[] = [];
      for (const k of kinds) {
        let rows: any[] = [];
        try { rows = await rpc('list_parties', { p_kind: k }); } catch { continue; }
        match.push(...rows.filter((r) => norm(r.name).includes(want) || want.includes(norm(r.name))).map((r) => ({ id: r.id, name: r.name, kind: k })));
      }
      const exact = match.filter((m) => norm(m.name) === want);
      if (exact.length) match = exact;
      if (match.length === 0) return { error: 'No party with that name', name: args.name };
      if (match.length > 1) return { error: 'More than one party matches — ask which one', options: match.map((m) => `${m.name} (${m.kind})`) };
      const p = match[0];
      const st = await rpc('party_statement', { p_party_id: p.id, p_ledger: p.kind === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE', p_from: okDate(args.from, '2000-01-01'), p_to: to });
      return {
        party: p.name, kind: p.kind, from: st.from, to: st.to, opening: n(st.opening), closing: n(st.closing), current_balance: n(st.current),
        total_birds: st.birds, total_kg: n(st.kg),
        entries: (st.rows as any[]).slice(-60).map((r) => ({
          date: r.date, type: r.type, debit: n(r.debit), credit: n(r.credit), balance: n(r.balance),
          lines: Array.isArray(r.items) ? r.items.map((i: any) => ({ size: sizeName({ name: i.size, name_mr: i.size_mr, name_hi: i.size_hi }), birds: i.qty, kg: n(i.kg), rate: n(i.rate) })) : undefined,
          note: r.items ? undefined : r.description,
        })),
      };
    }
    case 'sales':
    case 'purchases': {
      const isSale = name === 'sales';
      const q = isSale
        ? supabase.from('bills').select('bill_date, final_amount, parties(name), bill_items(qty, weight_kg)').eq('business_id', biz).eq('status', 'POSTED').gte('bill_date', from).lte('bill_date', to).limit(2000)
        : supabase.from('purchases').select('purchase_date, final_amount, parties(name), purchase_items(qty, weight_kg)').eq('business_id', biz).eq('status', 'POSTED').gte('purchase_date', from).lte('purchase_date', to).limit(2000);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const filter = args.name ? norm(String(args.name)) : '';
      const byParty = new Map<string, { amount: number; birds: number; kg: number; docs: number }>();
      const byDay = new Map<string, { amount: number; birds: number; kg: number }>();
      let tot = { amount: 0, birds: 0, kg: 0, docs: 0 };
      for (const r of (data ?? []) as any[]) {
        const party = (Array.isArray(r.parties) ? r.parties[0] : r.parties)?.name ?? '—';
        if (filter && !norm(party).includes(filter)) continue;
        const items = (isSale ? r.bill_items : r.purchase_items) ?? [];
        const birds = items.reduce((s: number, i: any) => s + Number(i.qty), 0);
        const kg = items.reduce((s: number, i: any) => s + Number(i.weight_kg), 0);
        const amt = Number(r.final_amount);
        const day = isSale ? r.bill_date : r.purchase_date;
        const p = byParty.get(party) ?? { amount: 0, birds: 0, kg: 0, docs: 0 };
        p.amount += amt; p.birds += birds; p.kg += kg; p.docs += 1; byParty.set(party, p);
        const d = byDay.get(day) ?? { amount: 0, birds: 0, kg: 0 };
        d.amount += amt; d.birds += birds; d.kg += kg; byDay.set(day, d);
        tot = { amount: tot.amount + amt, birds: tot.birds + birds, kg: tot.kg + kg, docs: tot.docs + 1 };
      }
      const fix = (o: any) => ({ ...o, amount: n(o.amount), kg: n(o.kg) });
      return {
        from, to, total: fix(tot),
        by_party: [...byParty.entries()].map(([party, v]) => ({ party, ...fix(v) })).sort((a, b) => b.amount - a.amount).slice(0, 60),
        by_day: [...byDay.entries()].sort().map(([date, v]) => ({ date, ...fix(v) })).slice(-62),
      };
    }
    case 'trips': {
      const { data, error } = await supabase.from('trips').select('id, trip_no, trip_date, status, loaded_weight, vehicles(registration_no), drivers(name)')
        .eq('business_id', biz).gte('trip_date', from).lte('trip_date', to).order('trip_date', { ascending: false }).limit(25);
      if (error) throw new Error(error.message);
      const out = [];
      for (const tr of (data ?? []) as any[]) {
        let w: any = null;
        try { w = await rpc('trip_weight_summary', { p_trip_id: tr.id }); } catch { /* ignore */ }
        const loadedKg = w?.loaded_weight != null ? Number(w.loaded_weight) : null;
        const avg = loadedKg && w?.loaded_birds ? loadedKg / Number(w.loaded_birds) : 0;
        const away = (Number(w?.lost_birds ?? 0) + Number(w?.returned_birds ?? 0)) * avg;
        out.push({
          trip: tr.trip_no, date: tr.trip_date, status: tr.status,
          vehicle: (Array.isArray(tr.vehicles) ? tr.vehicles[0] : tr.vehicles)?.registration_no, driver: (Array.isArray(tr.drivers) ? tr.drivers[0] : tr.drivers)?.name,
          loaded_birds: w?.loaded_birds, loaded_kg: loadedKg, delivered_birds: w?.delivered_birds, delivered_kg: n(w?.delivered_weight),
          dead_birds: w?.lost_birds, returned_birds: w?.returned_birds,
          weight_loss_kg: loadedKg ? n(Math.max(loadedKg - Number(w.delivered_weight) - away, 0)) : null,
        });
      }
      return { from, to, trips: out };
    }
    case 'expenses': {
      const { data, error } = await supabase.from('expenses').select('expense_date, amount, note, expense_categories(name, name_mr, name_hi), trips(trip_no)')
        .eq('business_id', biz).eq('status', 'ACTIVE').gte('expense_date', from).lte('expense_date', to).limit(1000);
      if (error) throw new Error(error.message);
      const byCat = new Map<string, number>();
      let total = 0;
      for (const e of (data ?? []) as any[]) {
        const c = sizeName(Array.isArray(e.expense_categories) ? e.expense_categories[0] : e.expense_categories) || '—';
        byCat.set(c, (byCat.get(c) ?? 0) + Number(e.amount)); total += Number(e.amount);
      }
      return {
        from, to, total: n(total), by_category: [...byCat.entries()].map(([category, amount]) => ({ category, amount: n(amount) })).sort((a, b) => b.amount - a.amount),
        latest: ((data ?? []) as any[]).slice(-20).map((e) => ({ date: e.expense_date, amount: n(e.amount), note: e.note, trip: (Array.isArray(e.trips) ? e.trips[0] : e.trips)?.trip_no })),
      };
    }
    case 'profit': {
      if (!ctx.has('pnl')) return { error: 'Profit report is not in this plan' };
      const p = await rpc('get_pnl', { p_from: from, p_to: to, p_log: false });
      const { daily, ...rest } = p ?? {};
      return { ...rest, days_with_sales: Array.isArray(daily) ? daily.filter((d: any) => Number(d.sales) > 0).slice(-31) : undefined };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
