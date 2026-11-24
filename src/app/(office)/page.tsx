import Link from 'next/link';
import { Bell, ArrowDownLeft, ArrowUpRight, Plus, ArrowLeftRight, Truck, ChevronRight, AlertTriangle } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { inr, inrSmart, fmtDate, num } from '@/lib/format';
import { rpc, listParties, recentLedger } from '@/lib/data/queries';
import { ActionSquare, Avatar, IconCircle, IconBubble, Row, SectionTitle, Badge } from '@/components/ui/core';
import { ICONS } from '@/components/shell/icons';
import { NEW_ENTRY, allowed } from '@/components/shell/nav-items';

export const dynamic = 'force-dynamic';

function greetingKey() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'c.goodMorning' : h < 17 ? 'c.goodAfternoon' : 'c.goodEvening';
}

export default async function Dashboard() {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const [d, customers, recent] = await Promise.all([
    rpc<any>('get_dashboard', ctx),
    listParties(ctx, 'CUSTOMER'),
    recentLedger(ctx, 8),
  ]);
  const pending = d.pending_verification as { count: number; amount: string };
  const people = customers
    .filter((c) => c.status === 'ACTIVE')
    .sort((a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? '') || a.name.localeCompare(b.name))
    .slice(0, 8);
  const quick = allowed(NEW_ENTRY, ctx.role, ctx.perms).slice(0, 8);

  return (
    <div className="space-y-7">
      {/* header (reference: avatar · Welcome, Name · bell) */}
      <header className="flex items-center gap-3.5 pt-2">
        <Avatar name={ctx.name || ctx.businessName} size={56} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[17px] text-ink-muted">{t(greetingKey() as any)}</p>
          <p className="truncate text-[22px] font-semibold tracking-tight">{ctx.name || ctx.businessName}</p>
        </div>
        <span className="relative">
          <IconCircle href="/payments?tab=pending" label={t('dash.pendingVerification')}><Bell className="h-5 w-5" /></IconCircle>
          {pending.count > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-aqua ring-2 ring-white" />}
        </span>
      </header>

      {/* balance (reference: "Balance $10 524.15" with + and ⇆) */}
      <section>
        <p className="text-[19px] text-ink-muted">{t('dash.receivable')}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="tabular text-[44px] font-semibold leading-none tracking-tight">{inr(d.receivable_total)}</p>
          <div className="flex shrink-0 gap-2.5">
            <ActionSquare href="/payments/new" label={t('qa.payment')}><Plus className="h-6 w-6" /></ActionSquare>
            <ActionSquare href="/trips" label={t('nav.trips')}><ArrowLeftRight className="h-5 w-5" /></ActionSquare>
          </div>
        </div>
      </section>

      {/* swipeable cards (reference: debit cards) */}
      <section className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        <Link href="/reports?r=receivables" className="stripe-card press relative flex h-[190px] w-[82%] max-w-[360px] shrink-0 snap-start flex-col justify-between rounded-[28px] p-6 text-white shadow-float">
          <div className="flex items-start justify-between">
            <p className="tabular text-[28px] font-medium tracking-tight">{inrSmart(d.sales_today)}</p>
            <ArrowDownLeft className="h-6 w-6 text-aqua-light" />
          </div>
          <div>
            <p className="text-[15px] text-white/70">{t('dash.salesToday')}</p>
            <p className="mt-1 text-lg tracking-wide">{t('dash.receivedToday')} · {inrSmart(d.received_today)}</p>
          </div>
        </Link>
        {d.payable_total !== undefined && (
          <Link href="/reports?r=payables" className="stripe-card-2 press flex h-[190px] w-[82%] max-w-[360px] shrink-0 snap-start flex-col justify-between rounded-[28px] p-6 text-white shadow-float">
            <div className="flex items-start justify-between">
              <p className="tabular text-[28px] font-medium tracking-tight">{inrSmart(d.payable_total)}</p>
              <ArrowUpRight className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[15px] text-white/80">{t('dash.payable')}</p>
              <p className="mt-1 text-lg">{t('dash.purchasesToday')} · {inrSmart(d.purchases_today)}</p>
            </div>
          </Link>
        )}
        {d.profit && (
          <Link href="/pnl" className="stripe-card-3 press flex h-[190px] w-[82%] max-w-[360px] shrink-0 snap-start flex-col justify-between rounded-[28px] p-6 text-white shadow-float">
            <div className="flex items-start justify-between">
              <p className="tabular text-[28px] font-medium tracking-tight">{inrSmart(d.profit.net_profit)}</p>
              {d.profit.provisional && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">{t('dash.provisional')}</span>}
            </div>
            <div>
              <p className="text-[15px] text-white/80">{t('dash.profitToday')} · {t('dash.net')}</p>
              <p className="mt-1 text-lg">{t('dash.gross')} · {inrSmart(d.profit.gross_profit)}</p>
            </div>
          </Link>
        )}
      </section>

      {pending.count > 0 && (
        <Link href="/payments?tab=pending" className="press flex items-center gap-3 rounded-3xl bg-[#FCF0DC] px-4 py-3 text-[#7A4A08]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[15px]">{t('dash.pendingVerification')}: <b>{pending.count}</b> · {inrSmart(pending.amount)}</span>
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      {/* quick actions */}
      <section className="glass p-4">
        <div className="grid grid-cols-4 gap-y-4">
          {quick.map((q) => {
            const Icon = ICONS[q.icon];
            return (
              <Link key={q.href} href={q.href} className="press flex flex-col items-center gap-1.5 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-aqua-soft text-aqua-deep"><Icon className="h-5 w-5" /></span>
                <span className="text-[12px] font-medium leading-tight">{t(q.key)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* customers (reference: avatar row) */}
      {people.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/customers">{t('c.viewAll')}</Link>}>{t('dash.recentCustomers')}</SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
            {people.map((c, i) => (
              <Link key={c.id} href={`/customers/${c.id}`} className="press flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
                <Avatar name={c.name} size={64} ring={i === 0} />
                <span className="line-clamp-1 w-full text-[14px]">{c.name.split(' ')[0]}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{t('dash.customersWithDues', { n: d.customers_with_dues })}</p>
        </section>
      )}

      {/* today */}
      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.salesToday')}</p><p className="tabular mt-1 text-xl font-semibold">{inrSmart(d.sales_today)}</p><p className="text-xs text-ink-muted">{d.bills_today} · {t('l.BILL')}</p></div>
        <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.receivedToday')}</p><p className="tabular mt-1 text-xl font-semibold text-good">{inrSmart(d.received_today)}</p></div>
        {d.purchases_today !== undefined && (
          <>
            <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.purchasesToday')}</p><p className="tabular mt-1 text-xl font-semibold">{inrSmart(d.purchases_today)}</p></div>
            <div className="card p-4"><p className="text-[13px] text-ink-muted">{t('dash.paidToday')}</p><p className="tabular mt-1 text-xl font-semibold">{inrSmart(d.supplier_paid_today)}</p></div>
          </>
        )}
      </section>

      {/* birds by size */}
      <section className="card overflow-hidden">
        <p className="px-4 pb-2 pt-4 text-[17px] font-semibold">{t('dash.birdsToday')}</p>
        <table className="w-full text-[15px]">
          <thead><tr className="text-left text-xs text-ink-muted">
            <th className="px-4 py-2 font-medium">{t('c.size')}</th><th className="px-2 py-2 text-right font-medium">{t('dash.ordered')}</th>
            <th className="px-2 py-2 text-right font-medium">{t('dash.loaded')}</th><th className="px-2 py-2 text-right font-medium">{t('dash.delivered')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('dash.remaining')}</th>
          </tr></thead>
          <tbody>
            {(d.sizes as any[]).map((s) => (
              <tr key={s.bird_size_id} className="border-t border-line">
                <td className="px-4 py-2.5 font-medium">{localName(s, locale)}</td>
                <td className="tabular px-2 py-2.5 text-right">{num(s.ordered)}</td>
                <td className="tabular px-2 py-2.5 text-right">{num(s.loaded)}</td>
                <td className="tabular px-2 py-2.5 text-right text-good">{num(s.delivered)}</td>
                <td className="tabular px-4 py-2.5 text-right font-semibold">{num(s.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* trips */}
      <section>
        <SectionTitle action={<Link href="/trips">{t('c.viewAll')}</Link>}>{t('dash.activeTrips')}</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone="warn">{t('dash.pendingDeliveries')}: {d.pending_deliveries}</Badge>
          <Badge tone="slate">{t('dash.unsettledTrips')}: {d.unsettled_trips}</Badge>
        </div>
        {(d.active_trips as any[]).length === 0 ? <p className="text-ink-muted">{t('dash.noTrips')}</p> : (
          <div className="space-y-2.5">
            {(d.active_trips as any[]).map((tr) => (
              <Link key={tr.id} href={`/trips/${tr.id}`} className="card press flex items-center gap-3.5 p-4">
                <IconBubble tone="ink"><Truck className="h-5 w-5" /></IconBubble>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{tr.trip_no} · {tr.driver ?? '—'}</p>
                  <p className="text-sm text-ink-muted">{tr.vehicle ?? ''} · {t(`t.s.${tr.status}` as any)}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-mint"><div className="h-1.5 rounded-full bg-aqua" style={{ width: `${tr.customers ? (tr.delivered / tr.customers) * 100 : 0}%` }} /></div>
                </div>
                <span className="text-sm text-ink-muted">{t('dash.progress', { done: tr.delivered, total: tr.customers })}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* recent transactions (reference list) */}
      {recent.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/payments">{t('c.viewAll')}</Link>}>{t('pay.list')}</SectionTitle>
          <div className="divide-y divide-line">
            {recent.map((r) => {
              const isIn = r.ledger === 'RECEIVABLE' ? Number(r.credit) > 0 : Number(r.debit) > 0;
              const amount = Number(r.debit) || Number(r.credit);
              return (
                <Row key={r.id} href={`/${r.ledger === 'RECEIVABLE' ? 'customers' : 'suppliers'}/${r.party_id}`}
                  left={<Avatar name={r.party_name ?? '?'} size={56} />}
                  title={r.party_name}
                  sub={`${fmtDate(r.txn_date, locale)} · ${t(`l.${r.entry_type}` as any)}`}
                  amount={`${isIn ? '+' : '−'}${inrSmart(amount)}`}
                  amountSub={r.ledger === 'RECEIVABLE' ? t('p.receivable') : t('p.payable')}
                  tone={isIn ? 'good' : undefined} />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
