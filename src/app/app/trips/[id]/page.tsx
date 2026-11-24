import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone, Receipt } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, fmtDateTime, inr } from '@/lib/format';
import { fleet, one, rpc } from '@/lib/data/queries';
import { loadTrip } from '@/lib/data/trip';
import { TRIP_TONE } from '@/lib/status';
import { Badge, PageHeader, SectionTitle, Empty, btnClass } from '@/components/ui/core';
import { AllocateButton, CustomerCard, LoadingButton, RemoveAllocation, ReopenTrip, SettlementPanel, TripEditButton, TripStatusButtons, type OpenLine } from '@/components/trip/trip-office';

export const dynamic = 'force-dynamic';
const PRE = ['DRAFT', 'ASSIGNED', 'LOADING'];
const RUNNING = ['LOADING', 'DISPATCHED', 'IN_PROGRESS'];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx({ office: true, module: 'trips' });
  const { t, locale } = await getT();
  const { id } = await params;
  const data = await loadTrip(ctx, id, locale);
  if (!data) notFound();
  const { trip, customers, loadRows, sizes, totals } = data;
  const supabase = await createClient();
  const pre = PRE.includes(trip.status);

  let openLines: OpenLine[] = [];
  if (pre) {
    const { data: oi } = await supabase.from('order_items')
      .select('id, ordered_qty, allocated_qty, delivered_qty, rate, bird_size_id, bird_sizes(name, name_mr, name_hi, sort_order), orders!inner(order_no, status, order_date, parties(name))')
      .eq('business_id', ctx.businessId).in('orders.status', ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED']).limit(500);
    openLines = (oi ?? []).map((x: any) => ({ x, o: one(x.orders) as any }))
      .filter(({ x }) => x.ordered_qty - x.allocated_qty - x.delivered_qty > 0)
      .map(({ x, o }) => ({ order_item_id: x.id, order_no: o.order_no, customer: (one(o.parties) as any)?.name ?? '—', size: localName(one(x.bird_sizes) as any, locale),
        open: x.ordered_qty - x.allocated_qty - x.delivered_qty, rate: x.rate != null ? String(x.rate) : null }))
      .sort((a, b) => a.customer.localeCompare(b.customer));
  }
  const showSettle = ['IN_PROGRESS', 'COMPLETED', 'SETTLED'].includes(trip.status);
  const pv = showSettle ? await rpc<any>('trip_settlement_preview', ctx, { p_trip_id: id }) : null;
  if (pv) pv.sizes = (pv.sizes as any[]).map((s) => ({ ...s, name: localName(s, locale) }));
  const { drivers, vehicles } = pre ? await fleet(ctx) : { drivers: [], vehicles: [] };
  const { data: exps } = ctx.can('expenses')
    ? await supabase.from('expenses').select('id, amount, note, expense_categories(name, name_mr, name_hi)').eq('trip_id', id).eq('status', 'ACTIVE')
    : { data: [] as any[] };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader back="/app/trips" title={trip.trip_no} sub={fmtDate(trip.trip_date, locale)}
        right={pre ? <TripEditButton trip={trip} drivers={drivers.filter((d) => d.active)} vehicles={vehicles.filter((v) => v.active)} /> : undefined} />

      {/* trip card (reference: dark striped card) */}
      <section className="stripe-card rounded-[28px] p-6 text-white shadow-float">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-white/70">{t('c.driver')}</p>
            <p className="text-xl font-semibold">{trip.driver?.name ?? '—'}</p>
            <p className="mt-2 text-white/70">{t('c.vehicle')}</p>
            <p className="font-medium tracking-wider">{trip.vehicle?.registration_no ?? '—'}</p>
          </div>
          <Badge tone={TRIP_TONE[trip.status]}>{t(`t.s.${trip.status}` as any)}</Badge>
        </div>
        <div className="tabular mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('c.birds')}</p><p className="text-lg font-semibold">{totals.birds}</p></div>
          <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('dash.delivered')}</p><p className="text-lg font-semibold">{totals.delivered}/{customers.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('d.collect')}</p><p className="text-lg font-semibold">{inr(totals.collected, { decimals: false })}</p></div>
        </div>
        {trip.driver?.phone && <a href={`tel:${trip.driver.phone}`} className={btnClass('light', 'sm', 'mt-4')}><Phone className="h-4 w-4" /> {t('p.call')}</a>}
      </section>
      {trip.notes && <p className="rounded-2xl bg-white/70 p-4 text-sm text-ink-soft">{trip.notes}</p>}

      <TripStatusButtons tripId={trip.id} status={trip.status} />

      {/* orders on trip */}
      {pre && (
        <section>
          <SectionTitle action={<AllocateButton tripId={trip.id} lines={openLines} canOverride={ctx.can('rate_override')} />}>{t('t.customers')}</SectionTitle>
          {customers.length === 0 ? <Empty title={t('t.noOrders')} /> : (
            <div className="card divide-y divide-line px-4">
              {customers.map((c) => (
                <div key={c.id} className="py-3">
                  <p className="font-semibold">{c.name}</p>
                  <ul className="mt-1 space-y-1">
                    {c.allocIds.map((a) => (
                      <li key={a.id} className="tabular flex items-center justify-between text-sm text-ink-soft">
                        <span>{a.size} · {a.qty} · {inr(a.rate)}/kg <span className="text-ink-faint">({a.order_no})</span></span>
                        <RemoveAllocation id={a.id} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* loading */}
      {loadRows.length > 0 && (
        <section>
          <SectionTitle>{t('t.loadingSummary')}</SectionTitle>
          <div className="card mb-3 grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3">
            {loadRows.map((r) => (
              <div key={r.bird_size_id} className="bg-white p-3">
                <p className="text-sm text-ink-muted">{r.size}</p>
                <p className="tabular text-lg font-semibold">{r.loaded ?? '—'} <span className="text-sm font-normal text-ink-muted">/ {r.allocated}</span></p>
                {r.loaded_weight && <p className="text-xs text-ink-muted">{r.loaded_weight} kg</p>}
              </div>
            ))}
          </div>
          {['ASSIGNED', 'LOADING', 'DISPATCHED'].includes(trip.status) && <LoadingButton tripId={trip.id} rows={loadRows} />}
        </section>
      )}

      {/* deliveries */}
      {!pre && customers.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>{t('t.customers')}</SectionTitle>
          {customers.map((c) => (
            <CustomerCard key={c.id} tripId={trip.id} c={c} canDeliver={RUNNING.includes(trip.status)} canCollect={!['SETTLED', 'CANCELLED'].includes(trip.status)} canOverride={ctx.can('rate_override')} />
          ))}
        </section>
      )}

      {/* trip expenses */}
      {ctx.can('expenses') && trip.status !== 'CANCELLED' && (
        <section>
          <SectionTitle action={<Link href={`/app/expenses?new=1&trip=${trip.id}`}>{t('e.add')}</Link>}>{t('s.expenses')}</SectionTitle>
          {(exps ?? []).length === 0 ? <p className="text-sm text-ink-muted">{t('c.none')}</p> : (
            <div className="card divide-y divide-line px-4">
              {(exps ?? []).map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 py-3"><Receipt className="h-5 w-5 text-ink-muted" />
                  <span className="flex-1">{localName(one(e.expense_categories) as any, locale)}{e.note ? <span className="text-sm text-ink-muted"> · {e.note}</span> : null}</span>
                  <span className="tabular font-medium">{inr(e.amount)}</span></div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* settlement */}
      {pv && (
        <section>
          <SectionTitle>{t('s.title')}</SectionTitle>
          {trip.status === 'SETTLED' ? (
            <div className="card space-y-3 p-5">
              <p className="font-medium">{t('s.closedBy', { date: fmtDateTime(pv.settlement?.closed_at, locale) })}</p>
              <div className="tabular grid grid-cols-2 gap-2 text-sm">
                <p>{t('s.sales')}: <b>{inr(pv.settlement?.sales_amount)}</b></p><p>{t('s.verified')}: <b>{inr(pv.settlement?.collections_verified)}</b></p>
                <p>{t('s.cashExpected')}: <b>{inr(pv.settlement?.cash_expected)}</b></p><p>{t('s.cashHandover')}: <b>{inr(pv.settlement?.cash_handover)}</b></p>
                {ctx.role === 'owner' && pv.cogs != null && <p>{t('pnl.cogs')}: <b>{inr(pv.cogs)}</b></p>}
                <p>{t('s.expenses')}: <b>{inr(pv.settlement?.expenses_amount)}</b></p>
              </div>
              {pv.settlement?.differences_note && <p className="rounded-xl bg-mint p-3 text-sm">{pv.settlement.differences_note}</p>}
              {ctx.role === 'owner' && <ReopenTrip tripId={trip.id} />}
            </div>
          ) : ctx.role === 'owner' ? (
            <SettlementPanel tripId={trip.id} pv={pv} sizes={sizes} />
          ) : (
            <p className="text-sm text-ink-muted">{t('err.FORBIDDEN')}</p>
          )}
        </section>
      )}
    </div>
  );
}
