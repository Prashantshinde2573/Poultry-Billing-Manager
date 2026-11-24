import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Plus, ArrowLeftRight, Truck, ChevronRight, AlertTriangle, ReceiptText } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { inrSmart, fmtDate, num, inr } from '@/lib/format';
import { rpc, listParties, recentLedger } from '@/lib/data/queries';
import { ActionSquare, Avatar, IconBubble, Row, SectionTitle, Badge } from '@/components/ui/core';
import { ICONS } from '@/components/shell/icons';
import { NEW_ENTRY, allowed } from '@/components/shell/nav-items';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const [d, customers, recent] = await Promise.all([rpc<any>('get_dashboard', ctx), listParties(ctx, 'CUSTOMER'), recentLedger(ctx, 8)]);
  const pending = d.pending_verification as { count: number; amount: string };
  const people = customers
    .filter((c) => c.status === 'ACTIVE' && Number(c.receivable) > 0)
    .sort((a, b) => Number(b.receivable) - Number(a.receivable))
    .slice(0, 10);
  const quick = allowed(NEW_ENTRY, ctx.role, ctx.perms, ctx.plan.modules).slice(0, 8);
  const trips = ctx.has('trips');
  const card = 'press relative flex h-[184px] w-[82%] max-w-[340px] shrink-0 snap-start flex-col justify-between rounded-[24px] p-5 text-white shadow-lift sm:w-[340px]';

  return (
    <div className="space-y-7">

      <div className="space-y-7 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="min-w-0 space-y-7">
          {/* balance (reference: Balance + square actions) */}
          <section>
            <p className="text-[15px] text-ink-muted">{t('dash.receivable')}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="tabular min-w-0 truncate text-[38px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]">{inr(d.receivable_total, { decimals: false })}</p>
              <div className="flex shrink-0 gap-2">
                <ActionSquare href="/app/payments/new" label={t('qa.payment')}><Plus className="h-6 w-6" /></ActionSquare>
                <ActionSquare href={trips ? '/app/trips' : '/app/payments'} label={trips ? t('nav.trips') : t('nav.payments')}><ArrowLeftRight className="h-5 w-5" /></ActionSquare>
              </div>
            </div>
            <p className="mt-2 text-[13.5px] text-ink-muted">{t('dash.customersWithDues', { n: d.customers_with_dues })}</p>
          </section>

          {/* swipeable cards (reference: debit cards) */}
          <section className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">
            <Link href="/app/reports?r=sales" className={`stripe-card ${card}`}>
              <div className="flex items-start justify-between"><p className="tabular text-[28px] font-semibold tracking-[-0.02em]">{inrSmart(d.sales_today)}</p><ArrowDownLeft className="h-5 w-5 text-aqua-light" /></div>
              <div><p className="text-[13.5px] text-white/65">{t('dash.salesToday')} · {d.bills_today} {t('l.BILL')}</p><p className="mt-0.5 text-[15px]">{t('dash.receivedToday')} {inrSmart(d.received_today)}</p></div>
            </Link>
            {d.payable_total !== undefined && (
              <Link href="/app/reports?r=payables" className={`stripe-card-2 ${card}`}>
                <div className="flex items-start justify-between"><p className="tabular text-[28px] font-semibold tracking-[-0.02em]">{inrSmart(d.payable_total)}</p><ArrowUpRight className="h-5 w-5" /></div>
                <div><p className="text-[13.5px] text-white/75">{t('dash.payable')}</p><p className="mt-0.5 text-[15px]">{t('dash.purchasesToday')} {inrSmart(d.purchases_today)}</p></div>
              </Link>
            )}
            {d.profit && (
              <Link href="/app/pnl" className={`stripe-card-3 ${card}`}>
                <div className="flex items-start justify-between">
                  <p className="tabular text-[28px] font-semibold tracking-[-0.02em]">{inrSmart(d.profit.net_profit)}</p>
                  {d.profit.provisional && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px]">{t('dash.provisional')}</span>}
                </div>
                <div><p className="text-[13.5px] text-white/75">{t('dash.profitToday')} · {t('dash.net')}</p><p className="mt-0.5 text-[15px]">{t('dash.gross')} {inrSmart(d.profit.gross_profit)}</p></div>
              </Link>
            )}
          </section>

          {pending.count > 0 && (
            <Link href="/app/payments?tab=pending" className="press flex items-center gap-3 rounded-[16px] border border-[#F0D29A] bg-[#FCF3E0] px-4 py-3 text-[#7A4A08]">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-[14.5px]">{t('dash.pendingVerification')}: <b>{pending.count}</b> · {inrSmart(pending.amount)}</span>
              <ChevronRight className="h-5 w-5" />
            </Link>
          )}

          {/* quick actions */}
          <section className="card px-2 py-4">
            <div className="grid grid-cols-4 gap-y-4">
              {quick.map((q) => {
                const Icon = ICONS[q.icon];
                return (
                  <Link key={q.href} href={q.href} className="press flex flex-col items-center gap-1.5 px-1 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-mint text-ink"><Icon className="h-[22px] w-[22px]" /></span>
                    <span className="line-clamp-2 text-[12.5px] font-medium leading-tight">{t(q.key)}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* customers with dues (reference: avatar row) */}
          {people.length > 0 && (
            <section>
              <SectionTitle action={<Link href="/app/customers">{t('c.viewAll')}</Link>}>{t('dash.recentCustomers')}</SectionTitle>
              <div className="no-scrollbar -mx-4 flex scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {people.map((c) => (
                  <Link key={c.id} href={`/app/customers/${c.id}`} className="press flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center">
                    <Avatar name={c.name} size={56} />
                    <span className="line-clamp-1 w-full text-[13px] font-medium">{c.name.split(' ')[0]}</span>
                    <span className="tabular -mt-1 text-[12px] text-bad">{inrSmart(c.receivable)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* today */}
          <section className="grid grid-cols-2 gap-3">
            <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.salesToday')}</p><p className="tabular mt-1 text-[20px] font-semibold">{inrSmart(d.sales_today)}</p><p className="text-[12.5px] text-ink-muted">{d.bills_today} {t('l.BILL')}</p></div>
            <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.receivedToday')}</p><p className="tabular mt-1 text-[20px] font-semibold text-good">{inrSmart(d.received_today)}</p></div>
            {d.purchases_today !== undefined && (
              <>
                <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.purchasesToday')}</p><p className="tabular mt-1 text-[20px] font-semibold">{inrSmart(d.purchases_today)}</p></div>
                <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.paidToday')}</p><p className="tabular mt-1 text-[20px] font-semibold">{inrSmart(d.supplier_paid_today)}</p></div>
              </>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-7">
          {/* birds by size */}
          {(ctx.has('orders') || ctx.has('trips')) && (
            <section className="card overflow-hidden">
              <p className="px-4 pb-1 pt-4 text-[16px] font-semibold">{t('dash.birdsToday')}</p>
              <table className="tabular w-full text-[14.5px]">
                <thead><tr className="text-left text-[12px] text-ink-muted">
                  <th className="px-4 py-2 font-medium">{t('c.size')}</th><th className="px-1.5 py-2 text-right font-medium">{t('dash.ordered')}</th>
                  <th className="px-1.5 py-2 text-right font-medium">{t('dash.loaded')}</th><th className="px-1.5 py-2 text-right font-medium">{t('dash.delivered')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('dash.remaining')}</th>
                </tr></thead>
                <tbody>
                  {(d.sizes as any[]).map((s) => (
                    <tr key={s.bird_size_id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-medium">{localName(s, locale)}</td>
                      <td className="px-1.5 py-2.5 text-right">{num(s.ordered)}</td>
                      <td className="px-1.5 py-2.5 text-right">{num(s.loaded)}</td>
                      <td className="px-1.5 py-2.5 text-right text-good">{num(s.delivered)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{num(s.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* trips */}
          {trips && (
            <section>
              <SectionTitle action={<Link href="/app/trips">{t('c.viewAll')}</Link>}>{t('dash.activeTrips')}</SectionTitle>
              {(d.active_trips as any[]).length === 0 ? <p className="card px-4 py-5 text-[14px] text-ink-muted">{t('dash.noTrips')}</p> : (
                <div className="space-y-2.5">
                  {(d.active_trips as any[]).map((tr) => (
                    <Link key={tr.id} href={`/app/trips/${tr.id}`} className="card press flex items-center gap-3 p-4">
                      <IconBubble tone="ink"><Truck className="h-5 w-5" /></IconBubble>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><p className="break-words font-medium">{tr.trip_no} · {tr.driver ?? '—'}</p><span className="tabular shrink-0 text-[13px] text-ink-muted">{tr.delivered}/{tr.customers}</span></div>
                        <p className="break-words text-[13px] text-ink-muted">{tr.vehicle ?? ''} · {t(`t.s.${tr.status}` as any)}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-ink/[0.07]"><div className="h-1.5 rounded-full bg-aqua" style={{ width: `${tr.customers ? (tr.delivered / tr.customers) * 100 : 0}%` }} /></div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {(d.pending_deliveries > 0 || d.unsettled_trips > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.pending_deliveries > 0 && <Badge tone="warn">{t('dash.pendingDeliveries')}: {d.pending_deliveries}</Badge>}
                  {d.unsettled_trips > 0 && <Badge tone="slate">{t('dash.unsettledTrips')}: {d.unsettled_trips}</Badge>}
                </div>
              )}
            </section>
          )}

          {/* recent activity (reference: transactions list) */}
          {recent.length > 0 && (
            <section>
              <SectionTitle action={<Link href="/app/payments">{t('c.viewAll')}</Link>}>{t('c.recent')}</SectionTitle>
              <div className="card divide-y divide-line px-4">
                {recent.map((r) => {
                  const payment = r.entry_type === 'PAYMENT';
                  const amount = Number(r.debit) || Number(r.credit);
                  return (
                    <Row key={r.id} href={`/app/${r.ledger === 'RECEIVABLE' ? 'customers' : 'suppliers'}/${r.party_id}`}
                      left={payment ? <IconBubble tone={r.ledger === 'RECEIVABLE' ? 'good' : 'violet'}>{r.ledger === 'RECEIVABLE' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}</IconBubble>
                        : <IconBubble tone="aqua"><ReceiptText className="h-5 w-5" /></IconBubble>}
                      title={r.party_name}
                      sub={`${t(`l.${r.entry_type}` as any)} · ${fmtDate(r.txn_date, locale, false)}`}
                      amount={`${payment && r.ledger === 'RECEIVABLE' ? '+' : ''}${inrSmart(amount)}`}
                      tone={payment && r.ledger === 'RECEIVABLE' ? 'good' : undefined} />
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
