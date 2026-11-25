import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Phone, Plus, Receipt, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, fmtDateTime, inr, num } from '@/lib/format';
import { fleet, one, partyOptions, rpc } from '@/lib/data/queries';
import { loadTrip } from '@/lib/data/trip';
import { TRIP_TONE } from '@/lib/status';
import { Badge, PageHeader, btnClass } from '@/components/ui/core';
import {
  AllocateButton, CustomerCard, LoadingButton, TripLossButton, WeightLossCard, RemoveAllocation, ReopenTrip, SettlementPanel,
  TripEditButton, TripStatusButtons, type OpenLine,
} from '@/components/trip/trip-office';
import { QuickOrderButton } from '@/components/trip/quick-order';

export const dynamic = 'force-dynamic';
const PRE = ['DRAFT', 'ASSIGNED', 'LOADING'];
const RUNNING = ['LOADING', 'DISPATCHED', 'IN_PROGRESS'];

/** One step of the day, in the order the work happens. */
function Step({ n, title, done, active, children, right }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode; right?: ReactNode }) {
  return (
    <section className={`card p-4 sm:p-5 ${active ? 'ring-2 ring-aqua/60' : ''}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${done ? 'bg-good text-white' : active ? 'bg-ink text-white' : 'bg-mint text-ink-muted'}`}>
          {done ? <Check className="h-5 w-5" /> : n}
        </span>
        <h2 className="min-w-0 flex-1 text-[18px] font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ order?: string; party?: string }> }) {
  const ctx = await requireCtx({ office: true, module: 'trips' });
  const [{ t, locale }, { id }, sp] = await Promise.all([getT(), params, searchParams]);
  const data = await loadTrip(ctx, id, locale);
  if (!data) notFound();
  const { trip, customers, loadRows, sizes, totals, weight, tripSizes } = data;
  const supabase = await createClient();
  const pre = PRE.includes(trip.status);
  const showSettle = ['IN_PROGRESS', 'COMPLETED', 'SETTLED'].includes(trip.status);
  const canSup = ctx.can('suppliers');

  // everything else this screen needs, in parallel
  const [openRows, pv, fl, exps, purchases, custOpts] = await Promise.all([
    pre ? supabase.from('order_items')
      .select('id, ordered_qty, allocated_qty, delivered_qty, rate, bird_size_id, bird_sizes(name, name_mr, name_hi, sort_order), orders!inner(order_no, status, order_date, parties(name))')
      .eq('business_id', ctx.businessId).in('orders.status', ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED']).limit(500).then((r) => r.data ?? []) : Promise.resolve([] as any[]),
    showSettle ? rpc<any>('trip_settlement_preview', ctx, { p_trip_id: id }) : Promise.resolve(null),
    pre ? fleet(ctx) : Promise.resolve({ drivers: [], vehicles: [] }),
    ctx.can('expenses') ? supabase.from('expenses').select('id, amount, note, expense_categories(name, name_mr, name_hi)').eq('trip_id', id).eq('status', 'ACTIVE').then((r) => r.data ?? []) : Promise.resolve([] as any[]),
    canSup ? supabase.from('purchases').select('id, purchase_no, final_amount, supplier_id, parties(name), purchase_items(qty, weight_kg)').eq('trip_id', id).eq('status', 'POSTED').then((r) => r.data ?? []) : Promise.resolve([] as any[]),
    pre ? partyOptions(ctx, 'CUSTOMER') : Promise.resolve([]),
  ]);
  const openLines: OpenLine[] = (openRows as any[]).map((x) => ({ x, o: one(x.orders) as any }))
    .filter(({ x }) => x.ordered_qty - x.allocated_qty - x.delivered_qty > 0)
    .map(({ x, o }) => ({ order_item_id: x.id, order_no: o.order_no, customer: (one(o.parties) as any)?.name ?? '—', size: localName(one(x.bird_sizes) as any, locale),
      open: x.ordered_qty - x.allocated_qty - x.delivered_qty, rate: x.rate != null ? String(x.rate) : null }))
    .sort((a, b) => a.customer.localeCompare(b.customer));
  if (pv) pv.sizes = (pv.sizes as any[]).map((s) => ({ ...s, name: localName(s, locale) }));
  const { drivers, vehicles } = fl;

  // farm purchases on this trip
  const farms = (purchases as any[]).map((p) => ({
    id: p.id, supplier: p.supplier_id, name: (one(p.parties) as any)?.name ?? '—', amount: Number(p.final_amount),
    birds: (p.purchase_items ?? []).reduce((s: number, i: any) => s + i.qty, 0), kg: (p.purchase_items ?? []).reduce((s: number, i: any) => s + Number(i.weight_kg), 0),
  }));
  const loadedBirds = loadRows.reduce((s, r) => s + (r.loaded ?? 0), 0);
  const delivered = customers.filter((c) => c.delivery).length;

  const s1 = !!trip.driver && !!trip.vehicle;
  const s2 = customers.length > 0;
  const s3 = farms.length > 0;
  const s4 = loadedBirds > 0;
  const s5 = customers.length > 0 && delivered === customers.length;
  const s6 = trip.status === 'SETTLED';
  const current = !s1 ? 1 : !s2 ? 2 : !s4 ? (s3 ? 4 : 3) : !s5 ? 5 : 6;
  const bySize = new Map<string, number>();
  for (const c of customers) for (const l of c.lines) bySize.set(l.size, (bySize.get(l.size) ?? 0) + l.allocated_qty);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader back="/app" title={trip.trip_no} sub={fmtDate(trip.trip_date, locale)}
        right={<Badge tone={TRIP_TONE[trip.status]}>{t(`t.s.${trip.status}` as any)}</Badge>} />

      {/* 1 · vehicle + driver */}
      <Step n={1} title={t('day.s1')} done={s1} active={current === 1}
        right={pre ? <TripEditButton trip={trip} drivers={drivers.filter((d) => d.active)} vehicles={vehicles.filter((v) => v.active)} /> : undefined}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[16px]">
          <p><span className="text-ink-muted">{t('c.vehicle')}: </span><b className="tracking-wide">{trip.vehicle?.registration_no ?? '—'}</b></p>
          <p><span className="text-ink-muted">{t('c.driver')}: </span><b>{trip.driver?.name ?? '—'}</b></p>
          {trip.driver?.phone && <a href={`tel:${trip.driver.phone}`} className={btnClass('outline', 'sm')}><Phone className="h-4 w-4" /> {t('p.call')}</a>}
        </div>
        {trip.status === 'DRAFT' && <div className="mt-3"><TripStatusButtons tripId={trip.id} status={trip.status} /></div>}
      </Step>

      {/* 2 · orders */}
      <Step n={2} title={t('day.s2')} done={s2 && !pre} active={current === 2}>
        {customers.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {[...bySize.entries()].map(([size, q]) => <span key={size} className="tabular rounded-full bg-mint px-3 py-1.5 text-[15px]"><b>{q}</b> {size}</span>)}
            </div>
            <ul className="mb-3 divide-y divide-line rounded-[14px] border border-line px-3">
              {customers.map((c) => (
                <li key={c.id} className="py-2.5">
                  <p className="font-semibold">{c.name}</p>
                  {pre ? (
                    <ul>{(c as any).allocIds.map((a: any) => (
                      <li key={a.id} className="tabular flex items-center justify-between text-[15px] text-ink-soft"><span>{a.size} · <b className="text-ink">{a.qty}</b></span><RemoveAllocation id={a.id} /></li>
                    ))}</ul>
                  ) : <p className="text-[15px] text-ink-soft">{c.lines.map((l) => `${l.size} ${l.allocated_qty}`).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
        {pre && (
          <div className="space-y-2">
            <QuickOrderButton tripId={trip.id} parties={custOpts} sizes={sizes} initialParty={sp.order ? sp.party ?? '' : ''} />
            {openLines.length > 0 && <AllocateButton tripId={trip.id} lines={openLines} canOverride={ctx.can('rate_override')} />}
          </div>
        )}
      </Step>

      {/* 3 · birds from farms */}
      {canSup && (
        <Step n={3} title={t('day.s3')} done={s3} active={current === 3}>
          {farms.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-[14px] border border-line px-3">
              {farms.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{f.name}</p><p className="tabular text-[14px] text-ink-muted">{f.birds} {t('c.birds')} · {num(f.kg)} kg</p></div>
                  <span className="tabular font-semibold">{inr(f.amount, { decimals: false })}</span>
                </li>
              ))}
            </ul>
          )}
          {trip.status !== 'SETTLED' && <Link href={`/app/purchases/new?trip=${trip.id}`} className={btnClass(s3 ? 'outline' : 'ink', 'lg', 'w-full')}><Plus className="h-5 w-5" /> {t('day.addFarm')}</Link>}
        </Step>
      )}

      {/* 4 · load the vehicle */}
      <Step n={canSup ? 4 : 3} title={t('day.s4')} done={s4} active={current === 4}>
        {loadRows.length === 0 ? <p className="text-[15px] text-ink-muted">{t('day.ordersFirst')}</p> : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {loadRows.map((r) => (
                <div key={r.bird_size_id} className="rounded-[14px] bg-mint p-3">
                  <p className="text-[14px] text-ink-muted">{r.size}</p>
                  <p className="tabular text-[20px] font-semibold">{r.loaded ?? '—'} <span className="text-[14px] font-normal text-ink-muted">/ {r.allocated}</span></p>
                </div>
              ))}
              {trip.loaded_weight != null && <div className="rounded-[14px] bg-mint p-3"><p className="text-[14px] text-ink-muted">{t('t.loadWeight')}</p><p className="tabular text-[20px] font-semibold">{num(trip.loaded_weight)} kg</p></div>}
            </div>
            {['ASSIGNED', 'LOADING', 'DISPATCHED'].includes(trip.status) && <LoadingButton tripId={trip.id} rows={loadRows} totalWeight={trip.loaded_weight != null ? String(trip.loaded_weight) : null} />}
          </>
        )}
      </Step>

      {/* 5 · deliveries */}
      <Step n={canSup ? 5 : 4} title={t('day.s5')} done={s5} active={current === 5}
        right={customers.length ? <span className="tabular text-[15px] text-ink-muted">{delivered}/{customers.length}</span> : undefined}>
        {!s4 ? <p className="text-[15px] text-ink-muted">{t('day.loadFirst')}</p> : (
          <div className="space-y-3">
            {customers.map((c) => (
              <CustomerCard key={c.id} tripId={trip.id} c={c} canDeliver={RUNNING.includes(trip.status)} canCollect={!['SETTLED', 'CANCELLED'].includes(trip.status)} canOverride={ctx.can('rate_override')} />
            ))}
            {totals.collected > 0 && <p className="tabular text-right text-[15px]">{t('d.collect')}: <b>{inr(totals.collected)}</b></p>}
          </div>
        )}
      </Step>

      {/* 6 · weight loss, expenses, pay farms, close */}
      <Step n={canSup ? 6 : 5} title={t('day.s6')} done={s6} active={current === 6}>
        <div className="space-y-4">
          {weight.loadedWeight ? <WeightLossCard {...weight} /> : null}
          {[...RUNNING, 'COMPLETED'].includes(trip.status) && <TripLossButton tripId={trip.id} sizes={tripSizes} />}

          {ctx.can('expenses') && trip.status !== 'CANCELLED' && (
            <div>
              <div className="mb-2 flex items-center justify-between"><p className="font-semibold">{t('s.expenses')}</p>
                {trip.status !== 'SETTLED' && <Link href={`/app/expenses?new=1&trip=${trip.id}`} className="press rounded-full px-3 py-1.5 text-[15px] font-semibold text-aqua-deep">+ {t('e.add')}</Link>}</div>
              {(exps as any[]).length === 0 ? <p className="text-[15px] text-ink-muted">{t('c.none')}</p> : (
                <ul className="divide-y divide-line rounded-[14px] border border-line px-3">
                  {(exps as any[]).map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2.5"><Receipt className="h-5 w-5 text-ink-muted" />
                      <span className="flex-1">{localName(one(e.expense_categories) as any, locale)}{e.note ? <span className="text-sm text-ink-muted"> · {e.note}</span> : null}</span>
                      <span className="tabular font-medium">{inr(e.amount)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canSup && farms.length > 0 && (
            <div>
              <p className="mb-2 font-semibold">{t('day.payFarms')}</p>
              <div className="flex flex-wrap gap-2">
                {[...new Map(farms.map((f) => [f.supplier, f])).values()].map((f) => (
                  <Link key={f.supplier} href={`/app/payments/new?dir=OUT&party=${f.supplier}`} className={btnClass('outline', 'md')}><Wallet className="h-4 w-4" /> {f.name}</Link>
                ))}
              </div>
            </div>
          )}

          {trip.status === 'IN_PROGRESS' && <TripStatusButtons tripId={trip.id} status={trip.status} />}

          {pv && (trip.status === 'SETTLED' ? (
            <div className="space-y-3 rounded-[14px] bg-mint p-4">
              <p className="font-medium">{t('s.closedBy', { date: fmtDateTime(pv.settlement?.closed_at, locale) })}</p>
              <div className="tabular grid grid-cols-2 gap-2 text-sm">
                <p>{t('s.sales')}: <b>{inr(pv.settlement?.sales_amount)}</b></p><p>{t('s.verified')}: <b>{inr(pv.settlement?.collections_verified)}</b></p>
                <p>{t('s.cashExpected')}: <b>{inr(pv.settlement?.cash_expected)}</b></p><p>{t('s.cashHandover')}: <b>{inr(pv.settlement?.cash_handover)}</b></p>
                {ctx.role === 'owner' && pv.cogs != null && <p>{t('pnl.cogs')}: <b>{inr(pv.cogs)}</b></p>}
                <p>{t('s.expenses')}: <b>{inr(pv.settlement?.expenses_amount)}</b></p>
              </div>
              {ctx.role === 'owner' && <ReopenTrip tripId={trip.id} />}
            </div>
          ) : ctx.role === 'owner' && trip.status === 'COMPLETED' ? (
            <SettlementPanel tripId={trip.id} pv={pv} sizes={sizes} />
          ) : null)}
        </div>
      </Step>
    </div>
  );
}
