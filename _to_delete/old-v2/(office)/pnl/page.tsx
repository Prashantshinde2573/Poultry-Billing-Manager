import { AlertTriangle } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { fmtDate, inr, kg, num } from '@/lib/format';
import { rpc } from '@/lib/data/queries';
import { PageHeader, SectionTitle, Stat } from '@/components/ui/core';
import { Donut } from '@/components/ui/donut';
import { PeriodPills, resolvePeriod } from '@/components/period-pills';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const ctx = await requireCtx({ office: true, owner: true });
  const { t, locale } = await getT();
  const per = resolvePeriod(await searchParams);
  const d = await rpc<any>('get_pnl', ctx, { p_from: per.from, p_to: per.to });
  const net = Number(d.net_profit);
  const reasons = (d.provisional_reasons ?? []) as any[];
  const exp = (d.expenses_by_category ?? []).map((e: any) => ({ label: localName({ name: e.category, name_mr: e.category_mr, name_hi: e.category_hi }, locale), value: Number(e.amount) }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('pnl.title')} sub={`${fmtDate(per.from, locale)} – ${fmtDate(per.to, locale)}`} />
      <PeriodPills base="/pnl" cur={per} t={t} />

      <section className={`${net >= 0 ? 'stripe-card' : 'stripe-card-2'} rounded-[28px] p-6 text-white shadow-float`}>
        <p className="text-white/75">{t('pnl.net')}</p>
        <p className="tabular text-[42px] font-semibold leading-tight tracking-tight">{inr(net)}</p>
        <div className="tabular mt-4 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-white/70">{t('pnl.sales')}</p><p className="font-semibold">{inr(d.sales, { decimals: false })}</p></div>
          <div><p className="text-white/70">{t('pnl.gross')}</p><p className="font-semibold">{inr(d.gross_profit, { decimals: false })}</p></div>
          <div><p className="text-white/70">{t('pnl.opex')}</p><p className="font-semibold">{inr(d.expenses, { decimals: false })}</p></div>
        </div>
      </section>

      {d.provisional && (
        <div className="flex gap-3 rounded-2xl bg-[#FCF0DC] p-4 text-sm text-[#7A4A08]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div><p className="font-medium">{t('pnl.provisionalNote')}</p>
            <ul className="mt-1 list-disc pl-5">{reasons.map((r) => <li key={r.code}>{t(`pnl.r.${r.code}` as any, { kg: num(r.weight_kg), n: r.count, amount: inr(r.amount) })}</li>)}</ul></div>
        </div>
      )}

      <section className="card divide-y divide-line px-5">
        {[[t('pnl.sales'), d.sales, ''], [t('pnl.cogs'), d.cogs_goods, '−'], [t('pnl.stockLoss'), d.stock_loss, '−'], [t('pnl.gross'), d.gross_profit, '='], [t('pnl.opex'), d.expenses, '−'], [t('pnl.net'), d.net_profit, '=']]
          .map(([l, v, s]) => (
            <div key={l} className={`tabular flex justify-between py-3 ${s === '=' ? 'font-semibold' : ''}`}><span>{s && s !== '=' ? `${s} ` : ''}{l}</span><span>{inr(v)}</span></div>
          ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle>{t('pnl.expenseSplit')}</SectionTitle>
          {exp.length ? <Donut parts={exp} center={inr(d.expenses, { decimals: false })} sub={t('pnl.opex')} size={230} /> : <p className="text-sm text-ink-muted">{t('c.none')}</p>}
        </section>
        <section>
          <SectionTitle>{t('pnl.notProfit')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('pnl.cashIn')} value={inr(d.cash_collected, { decimals: false })} />
            <Stat label={t('pnl.cashOut')} value={inr(d.supplier_payments, { decimals: false })} />
            <Stat label={t('pnl.netCash')} value={inr(d.net_cash, { decimals: false })} tone={Number(d.net_cash) >= 0 ? 'good' : 'bad'} />
            <Stat label={t('pnl.purchases')} value={inr(d.purchases, { decimals: false })} />
            <Stat label={t('p.receivable')} value={inr(d.receivable_total, { decimals: false })} />
            <Stat label={t('p.payable')} value={inr(d.payable_total, { decimals: false })} />
          </div>
        </section>
      </div>

      {(d.stock ?? []).length > 0 && (
        <section>
          <SectionTitle>{t('pnl.stock')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(d.stock as any[]).map((s) => <Stat key={s.size} label={localName({ name: s.size, name_mr: s.size_mr, name_hi: s.size_hi }, locale)} value={kg(s.weight_kg)} sub={`${s.qty} · ${inr(s.cost)}`} />)}
          </div>
        </section>
      )}

      {(d.trips ?? []).length > 0 && (
        <section>
          <SectionTitle>{t('pnl.byTrip')}</SectionTitle>
          <div className="card overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead className="text-ink-muted"><tr className="border-b border-line text-right"><th className="p-3 text-left font-medium">{t('c.trip')}</th><th className="p-3 font-medium">{t('pnl.sales')}</th><th className="p-3 font-medium">{t('pnl.cogs')}</th><th className="p-3 font-medium">{t('pnl.opex')}</th><th className="p-3 font-medium">{t('pnl.net')}</th></tr></thead>
              <tbody>{(d.trips as any[]).map((r) => (
                <tr key={r.trip_id} className="border-b border-line text-right last:border-0">
                  <td className="p-3 text-left"><Link className="font-medium underline-offset-2 hover:underline" href={`/trips/${r.trip_id}`}>{r.trip_no}</Link><span className="block text-xs text-ink-muted">{fmtDate(r.date, locale, false)} · {t(`t.s.${r.status}` as any)}</span></td>
                  <td className="p-3">{inr(r.sales, { decimals: false })}</td><td className="p-3">{inr(r.cogs, { decimals: false })}</td><td className="p-3">{inr(r.expenses, { decimals: false })}</td>
                  <td className={`p-3 font-semibold ${Number(r.net) < 0 ? 'text-bad' : 'text-good'}`}>{inr(r.net, { decimals: false })}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>
      )}

      {(d.daily ?? []).length > 1 && (
        <section>
          <SectionTitle>{t('pnl.daily')}</SectionTitle>
          <div className="card overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead className="text-ink-muted"><tr className="border-b border-line text-right"><th className="p-3 text-left font-medium">{t('c.date')}</th><th className="p-3 font-medium">{t('pnl.sales')}</th><th className="p-3 font-medium">{t('pnl.cogs')}</th><th className="p-3 font-medium">{t('pnl.opex')}</th><th className="p-3 font-medium">{t('pnl.net')}</th></tr></thead>
              <tbody>{(d.daily as any[]).filter((r) => Number(r.sales) || Number(r.expenses) || Number(r.cogs)).map((r) => (
                <tr key={r.date} className="border-b border-line text-right last:border-0">
                  <td className="p-3 text-left">{fmtDate(r.date, locale, false)}</td><td className="p-3">{inr(r.sales, { decimals: false })}</td><td className="p-3">{inr(r.cogs, { decimals: false })}</td>
                  <td className="p-3">{inr(r.expenses, { decimals: false })}</td><td className={`p-3 font-semibold ${Number(r.net) < 0 ? 'text-bad' : ''}`}>{inr(r.net, { decimals: false })}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
