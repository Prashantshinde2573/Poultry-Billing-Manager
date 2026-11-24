import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, HandCoins, Wallet, Truck, ChevronRight, AlertTriangle, ReceiptText } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { inrSmart, fmtDate, num, inr } from '@/lib/format';
import { rpc, listParties, recentLedger } from '@/lib/data/queries';
import { ActionSquare, Avatar, IconBubble, Row, SectionTitle, Badge } from '@/components/ui/core';
import { ICONS } from '@/components/shell/icons';
import { NEW_ENTRY, allowed } from '@/components/shell/nav-items';

export const dynamic = 'force-dynamic';

/** Which step of the day a trip is at (1 vehicle · 2 orders · 3 farms · 4 load · 5 deliver · 6 accounts). */
function nextStep(tr: { status: string; customers: number; delivered: number }) {
  if (tr.status === 'DRAFT') return 1;
  if (!tr.customers) return 2;
  if (tr.status === 'ASSIGNED') return 3;
  if (tr.delivered < tr.customers && ['LOADING', 'DISPATCHED', 'IN_PROGRESS'].includes(tr.status)) return 5;
  if (tr.status === 'SETTLED') return 7;
  return 6;
}

export default async function Dashboard() {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const [d, customers] = await Promise.all([rpc<any>('get_dashboard', ctx), listParties(ctx, 'CUSTOMER')]);
  const pending = d.pending_verification as { count: number; amount: string };
  const people = customers
    .filter((c) => c.status === 'ACTIVE' && Number(c.receivable) > 0)
    .sort((a, b) => Number(b.receivable) - Number(a.receivable))
    .slice(0, 10);
  const trips = ctx.has('trips');
  const card = 'press relative flex h-[184px] w-[82%] max-w-[340px] shrink-0 snap-start flex-col justify-between rounded-[24px] p-5 text-white shadow-lift sm:w-[340px]';

  return (
    <div className="space-y-7">
      {/* today's vehicles: the day's work starts here */}
      {trips && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[19px] font-semibold">{t('day.today')}</h2>
            {(d.active_trips as any[]).length > 0 && <Link href="/app/trips/new" className="press rounded-full px-3 py-1.5 text-[15px] font-semibold text-aqua-deep">+ {t('day.another')}</Link>}
          </div>
          {(d.active_trips as any[]).length === 0 ? (
            <Link href="/app/trips/new" className="press flex items-center gap-4 rounded-[22px] bg-ink p-5 text-white shadow-lift">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/10"><Truck className="h-7 w-7" /></span>
              <span className="flex-1 text-[19px] font-semibold">{t('day.newVehicle')}</span>
              <ChevronRight className="h-6 w-6" />
            </Link>
          ) : (d.active_trips as any[]).map((tr) => {
            const step = nextStep(tr);
            return (
              <Link key={tr.id} href={`/app/trips/${tr.id}`} className="card press block p-4">
                <div className="flex items-center gap-3">
                  <IconBubble tone="ink"><Truck className="h-5 w-5" /></IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[17px] font-semibold">{tr.vehicle ?? tr.trip_no}</p>
                    <p className="break-words text-[14px] text-ink-muted">{tr.driver ?? '—'}{tr.customers ? ` · ${tr.delivered}/${tr.customers}` : ''}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
                </div>
                <div className="mt-3 flex gap-1.5" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n < step ? 'bg-good' : n === step ? 'bg-aqua' : 'bg-ink/[0.08]'}`} />)}
                </div>
                <p className="mt-2 text-[15px] font-medium text-aqua-deep">{step > 6 ? t('day.allDone') : t('day.next', { step: t(`day.s${step}` as any) })}</p>
              </Link>
            );
          })}
        </section>
      )}


      <div className="space-y-7 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="min-w-0 space-y-7">
          {/* balance (reference: Balance + square actions) */}
          <section>
            <p className="text-[15px] text-ink-muted">{t('dash.receivable')}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="tabular min-w-0 truncate text-[38px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]">{inr(d.receivable_total, { decimals: false })}</p>
              <div className="flex shrink-0 gap-2">
                <ActionSquare href="/app/payments/new" label={t('qa.payment')}><HandCoins className="h-6 w-6" /></ActionSquare>
                <ActionSquare href={trips ? '/app/trips' : '/app/payments'} label={trips ? t('nav.trips') : t('nav.payments')}>{trips ? <Truck className="h-6 w-6" /> : <Wallet className="h-6 w-6" />}</ActionSquare>
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
        </div>
      </div>
    </div>
  );
}
