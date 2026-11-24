import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Pencil, Phone, ShoppingBasket, ScrollText } from 'lucide-react';
import type { Ctx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/data/queries';
import { addDays, fmtDate, inr, inrSmart, monthStart, num, todayIST, weekStart } from '@/lib/format';
import { localName } from '@/lib/i18n';
import { Avatar, Badge, IconCircle, PageHeader, Pills, Row, IconBubble, btnClass } from '@/components/ui/core';
import { DailyShareButton, OwnerPartyTools, StatementExport } from './party-tools';

type Ledger = 'RECEIVABLE' | 'PAYABLE';

export async function PartyDetail({ ctx, id, kind, sp }: { ctx: Ctx; id: string; kind: 'CUSTOMER' | 'SUPPLIER'; sp: Record<string, string | undefined> }) {
  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data: party } = await supabase.from('parties').select('*, customers(customer_type, default_rate), suppliers(default_purchase_rate)').eq('id', id).maybeSingle();
  if (!party || (kind === 'CUSTOMER' ? !party.is_customer : !party.is_supplier)) notFound();
  const canSup = ctx.can('suppliers');
  const ledgers: Ledger[] = [...(party.is_customer ? ['RECEIVABLE' as const] : []), ...(party.is_supplier && canSup ? ['PAYABLE' as const] : [])];
  const ledger: Ledger = (sp.ledger as Ledger) && ledgers.includes(sp.ledger as Ledger) ? (sp.ledger as Ledger) : kind === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';

  const today = todayIST();
  const period = sp.p ?? 'month';
  const from = period === 'week' ? weekStart(today) : period === 'all' ? '2000-01-01' : period === 'custom' && sp.from ? sp.from : monthStart(today);
  const to = period === 'custom' && sp.to ? sp.to : today;
  const day = sp.day ?? today;
  const [st, sum] = await Promise.all([
    rpc<any>('party_statement', ctx, { p_party_id: id, p_ledger: ledger, p_from: from, p_to: to }),
    rpc<any>('party_daily_summary', ctx, { p_party_id: id, p_ledger: ledger, p_date: day }),
  ]);
  const { data: biz } = await supabase.from('businesses').select('name, settings').eq('id', ctx.businessId).single();
  const base = kind === 'CUSTOMER' ? '/app/customers' : '/app/suppliers';
  const cur = Number(st.current);
  const q = (o: Record<string, string>) => `${base}/${id}?${new URLSearchParams({ ledger, p: period, ...o }).toString()}`;
  const custType = (Array.isArray(party.customers) ? party.customers[0] : party.customers)?.customer_type;

  return (
    <div className="space-y-6">
      <PageHeader back={base} title={party.name} right={<IconCircle href={`${base}/${id}/edit`} label={t('p.editParty')}><Pencil className="h-5 w-5" /></IconCircle>} />

      <section className="flex flex-col items-center text-center">
        <Avatar name={party.name} size={84} ring />
        <p className="mt-3 text-sm text-ink-muted">{party.phone ?? '—'}{party.address ? ` · ${party.address}` : ''}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {custType && <Badge tone="aqua">{t(`p.type.${custType}` as any)}</Badge>}
          {party.is_customer && party.is_supplier && <Badge tone="violet">{t('c.customer')} + {t('c.supplier')}</Badge>}
          {party.status === 'INACTIVE' && <Badge>{t('p.archived')}</Badge>}
        </div>
        {party.phone && (
          <div className="mt-4 flex gap-2">
            <a href={`tel:${party.phone}`} className={btnClass('outline', 'sm')}><Phone className="h-4 w-4" /> {t('p.call')}</a>
          </div>
        )}
      </section>

      {ledgers.length > 1 && <Pills items={ledgers.map((l) => ({ href: `${base}/${id}?ledger=${l}`, label: l === 'RECEIVABLE' ? t('p.receivable') : t('p.payable'), active: l === ledger }))} />}

      {/* balance card */}
      <section className={`${ledger === 'RECEIVABLE' ? 'stripe-card' : 'stripe-card-2'} rounded-[28px] p-6 text-white shadow-float`}>
        <p className="text-[15px] text-white/75">{ledger === 'RECEIVABLE' ? t('dash.receivableSub') : t('dash.payableSub')}</p>
        <p className="tabular mt-1 text-[40px] font-semibold leading-tight tracking-tight">{inr(Math.abs(cur))}</p>
        <p className="text-white/80">{cur > 0 ? (ledger === 'RECEIVABLE' ? t('p.owesYou') : t('p.youOwe')) : cur < 0 ? t('p.advance') : t('p.settled')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {ledger === 'RECEIVABLE' ? (
            <>
              <Link href={`/app/payments/new?party=${id}`} className={btnClass('light', 'md')}><ArrowDownLeft className="h-5 w-5" /> {t('qa.payment')}</Link>
              <Link href={`/app/orders/new?customer=${id}`} className={btnClass('light', 'md')}><ClipboardList className="h-5 w-5" /> {t('qa.order')}</Link>
              <Link href={`/app/bills/new?customer=${id}`} className={`${btnClass('light', 'md')} col-span-2`}><ScrollText className="h-5 w-5" /> {t('qa.bill')}</Link>
            </>
          ) : (
            <>
              <Link href={`/app/payments/new?dir=OUT&party=${id}`} className={btnClass('light', 'md')}><ArrowUpRight className="h-5 w-5" /> {t('qa.paySupplier')}</Link>
              <Link href={`/app/purchases/new?supplier=${id}`} className={btnClass('light', 'md')}><ShoppingBasket className="h-5 w-5" /> {t('qa.purchase')}</Link>
            </>
          )}
        </div>
      </section>

      {/* daily summary (PRD 5.1 / 7.1) */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="text-[17px] font-semibold">{t('p.dailySummary')}</h2>
          <form className="flex items-center gap-2" action={`${base}/${id}`}>
            <input type="hidden" name="ledger" value={ledger} />
            <input type="date" name="day" defaultValue={day} max={today} className="input h-9 w-auto rounded-[12px] px-3 text-[14px]" aria-label={t('c.date')} />
            <button className={btnClass('outline', 'sm')}>{t('c.apply')}</button>
          </form>
        </div>
        <dl className="divide-y divide-line text-[15px]">
          {(sum.lines as any[]).map((l, i) => (
            <div key={i} className="flex justify-between py-2"><dt className="text-ink-muted">{l.size ? localName({ name: l.size, name_mr: l.size_mr, name_hi: l.size_hi }, locale) : '—'}</dt><dd className="tabular">{num(l.qty)} · {num(l.weight_kg)} kg · {inrSmart(l.amount)}</dd></div>
          ))}
          <div className="flex justify-between py-2"><dt className="text-ink-muted">{ledger === 'RECEIVABLE' ? t('wa.bill') : t('wa.purchaseAmt')}</dt><dd className="tabular">{inrSmart(sum.bill_amount)}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-ink-muted">{t('wa.paid')}</dt><dd className="tabular text-good">{inrSmart(sum.paid_amount)}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-ink-muted">{t('wa.dayIncrease')}</dt><dd className="tabular">{inrSmart(sum.day_change)}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-ink-muted">{t('wa.prev')}</dt><dd className="tabular">{inrSmart(sum.previous_balance)}</dd></div>
          <div className="flex justify-between py-2 text-[17px] font-semibold"><dt>{ledger === 'RECEIVABLE' ? t('wa.totalReceivable') : t('wa.totalPayable')}</dt><dd className="tabular">{inrSmart(sum.total_balance)}</dd></div>
        </dl>
        <div className="mt-4"><DailyShareButton summary={{ ...sum, phone: party.phone }} business={biz?.name ?? ctx.businessName} partyId={id} /></div>
      </section>

      {/* statement */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[19px] font-semibold">{t('p.statement')}</h2>
          <StatementExport st={st} party={party.name} business={biz?.name ?? ''} ledger={ledger} footer={(biz?.settings as any)?.report_footer} />
        </div>
        <Pills items={[
          { href: q({ p: 'week' }), label: t('c.week'), active: period === 'week' },
          { href: q({ p: 'month' }), label: t('c.month'), active: period === 'month' },
          { href: q({ p: 'all' }), label: t('c.all'), active: period === 'all' },
        ]} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-white/70 py-2.5"><p className="text-ink-muted">{t('l.opening')}</p><p className="tabular font-semibold">{inrSmart(st.opening)}</p></div>
          <div className="rounded-2xl bg-white/70 py-2.5"><p className="text-ink-muted">{t('l.closing')}</p><p className="tabular font-semibold">{inrSmart(st.closing)}</p></div>
          <div className="rounded-2xl bg-white/70 py-2.5"><p className="text-ink-muted">{t('l.current')}</p><p className="tabular font-semibold">{inrSmart(st.current)}</p></div>
        </div>
        {(st.rows as any[]).length === 0 ? <p className="py-6 text-center text-ink-muted">{t('c.none')}</p> : (
          <div className="mt-2 divide-y divide-line">
            {[...(st.rows as any[])].reverse().map((r) => {
              const isCredit = ledger === 'RECEIVABLE' ? Number(r.credit) > 0 : Number(r.debit) > 0;
              const amt = Number(r.debit) || Number(r.credit);
              return (
                <Row key={r.id}
                  left={<IconBubble tone={r.is_reversal ? 'warn' : isCredit ? 'good' : 'aqua'}>{isCredit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}</IconBubble>}
                  title={t(`l.${r.type}` as any)} sub={`${fmtDate(r.date, locale)}${r.description ? ' · ' + r.description : ''}`}
                  amount={`${isCredit ? '−' : '+'}${inrSmart(amt)}`} amountSub={`${t('l.balance')} ${inrSmart(r.balance)}`} tone={isCredit ? 'good' : undefined} />
              );
            })}
          </div>
        )}
      </section>

      {ctx.role === 'owner' && <OwnerPartyTools partyId={id} ledgers={ledgers} status={party.status} />}
      <p className="text-center text-xs text-ink-faint">{addDays(today, 0) && `${t('c.from')} ${fmtDate(from === '2000-01-01' ? null : from, locale)} ${t('c.to')} ${fmtDate(to, locale)}`}</p>
    </div>
  );
}
