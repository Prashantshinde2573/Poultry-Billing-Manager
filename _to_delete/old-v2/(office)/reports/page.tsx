import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, inr, num, todayIST } from '@/lib/format';
import { one, rpc } from '@/lib/data/queries';
import { PageHeader, Pills, Empty } from '@/components/ui/core';
import { PeriodPills, resolvePeriod } from '@/components/period-pills';
import { ReportExport, type ReportSpec } from '@/components/report-export';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string; p?: string; from?: string; to?: string; asof?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const sp = await searchParams;
  const rep = ctx.can('reports'), sup = ctx.can('suppliers');
  const tabs = [
    ...(rep ? [['sales', t('r.dailySales')]] : []), ...(rep && sup ? [['purchase', t('r.dailyPurchase')]] : []),
    ['receivables', t('r.receivables')], ...(sup ? [['payables', t('r.payables')]] : []),
    ...(rep ? [['payments', t('r.payments')], ['trips', t('r.trips')]] : []),
  ] as [string, string][];
  const r = tabs.some(([k]) => k === sp.r) ? sp.r! : tabs[0][0];
  const per = resolvePeriod(sp);
  const asOf = sp.asof && /^\d{4}-\d{2}-\d{2}$/.test(sp.asof) ? sp.asof : todayIST();
  const supabase = await createClient();
  const range = `${per.from} – ${per.to}`;
  let spec: ReportSpec;
  const sizeName = (x: any) => (x ? localName(x, locale) : '—');

  if (r === 'sales' || r === 'purchase') {
    const sale = r === 'sales';
    const { data } = sale
      ? await supabase.from('bills').select('bill_no, bill_date, final_amount, status, trip_id, parties(name), bill_items(qty, weight_kg, bird_sizes(name, name_mr, name_hi))')
        .eq('business_id', ctx.businessId).eq('status', 'POSTED').gte('bill_date', per.from).lte('bill_date', per.to).order('bill_date').order('bill_no')
      : await supabase.from('purchases').select('purchase_no, purchase_date, final_amount, status, parties(name), purchase_items(qty, weight_kg, bird_sizes(name, name_mr, name_hi))')
        .eq('business_id', ctx.businessId).eq('status', 'POSTED').gte('purchase_date', per.from).lte('purchase_date', per.to).order('purchase_date').order('purchase_no');
    const rows = ((data ?? []) as any[]).map((d) => {
      const items = (d.bill_items ?? d.purchase_items ?? []) as any[];
      return [d.bill_date ?? d.purchase_date, d.bill_no ?? d.purchase_no, (one(d.parties) as any)?.name ?? '', items.map((i) => sizeName(one(i.bird_sizes))).join(', '),
        items.reduce((s, i) => s + i.qty, 0), Number(items.reduce((s, i) => s + Number(i.weight_kg), 0).toFixed(3)), Number(d.final_amount)];
    });
    const tot = rows.reduce((s, x) => s + (x[6] as number), 0), w = rows.reduce((s, x) => s + (x[5] as number), 0), b = rows.reduce((s, x) => s + (x[4] as number), 0);
    spec = { title: sale ? t('r.dailySales') : t('r.dailyPurchase'), pdfTitle: sale ? 'Sales' : 'Purchases', subtitle: range,
      head: [t('c.date'), sale ? t('b.billNo') : t('pu.no'), sale ? t('c.customer') : t('c.supplier'), t('c.size'), t('c.birds'), 'kg', t('c.amount')],
      pdfHead: ['Date', 'No.', sale ? 'Customer' : 'Supplier', 'Size', 'Birds', 'Kg', 'Amount'], rows, money: [6],
      summary: [['Total', 'Rs. ' + num(tot, 2)], ['Birds', String(b)], ['Kg', num(w)], ['Entries', String(rows.length)]] };
  } else if (r === 'receivables' || r === 'payables') {
    const recv = r === 'receivables';
    const d = await rpc<any>('outstanding_report', ctx, { p_ledger: recv ? 'RECEIVABLE' : 'PAYABLE', p_as_of: asOf });
    const rows = (d.rows as any[]).map((x) => [x.name, x.phone ?? '', Number(x.balance), x.last_payment ?? '']);
    spec = { title: recv ? t('r.receivables') : t('r.payables'), pdfTitle: recv ? 'Receivables' : 'Payables', subtitle: `${t('r.asOf')} ${asOf}`,
      head: [t('c.name'), t('c.phone'), t('l.balance'), t('pay.list')], pdfHead: ['Name', 'Mobile', 'Balance', 'Last payment'], rows, money: [2],
      summary: [['Total owed', 'Rs. ' + num(d.total_owed, 2)], ['Advances', 'Rs. ' + num(d.total_advance, 2)], ['Parties', String(rows.length)]] };
  } else if (r === 'payments') {
    let q = supabase.from('payments').select('payment_date, direction, amount, method, reference, status, parties(name)')
      .eq('business_id', ctx.businessId).eq('status', 'CONFIRMED').gte('payment_date', per.from).lte('payment_date', per.to).order('payment_date');
    if (!sup) q = q.eq('direction', 'IN');
    const { data } = await q;
    const rows = ((data ?? []) as any[]).map((p) => [p.payment_date, p.direction === 'IN' ? t('pay.in') : t('pay.out'), (one(p.parties) as any)?.name ?? '', t(`pay.m.${p.method}` as any), p.reference ?? '', Number(p.amount)]);
    const inSum = ((data ?? []) as any[]).filter((p) => p.direction === 'IN').reduce((s, p) => s + Number(p.amount), 0);
    const outSum = ((data ?? []) as any[]).filter((p) => p.direction === 'OUT').reduce((s, p) => s + Number(p.amount), 0);
    spec = { title: t('r.payments'), pdfTitle: 'Payments', subtitle: range, head: [t('c.date'), '', t('c.name'), t('c.method'), t('c.reference'), t('c.amount')],
      pdfHead: ['Date', 'Type', 'Party', 'Method', 'Ref', 'Amount'], rows, pdfRows: rows.map((x, i) => [x[0], (data as any[])[i].direction, x[2], (data as any[])[i].method, x[4], x[5]]), money: [5],
      summary: [['Received', 'Rs. ' + num(inSum, 2)], ['Paid', 'Rs. ' + num(outSum, 2)]] };
  } else {
    const { data } = await supabase.from('trips').select('trip_no, trip_date, status, drivers(name), vehicles(registration_no), trip_allocations(allocated_qty), deliveries(id)')
      .eq('business_id', ctx.businessId).gte('trip_date', per.from).lte('trip_date', per.to).order('trip_date');
    const rows = ((data ?? []) as any[]).map((x) => [x.trip_date, x.trip_no, (one(x.drivers) as any)?.name ?? '', (one(x.vehicles) as any)?.registration_no ?? '',
      (x.trip_allocations ?? []).reduce((s: number, a: any) => s + a.allocated_qty, 0), (x.deliveries ?? []).length, t(`t.s.${x.status}` as any)]);
    spec = { title: t('r.trips'), pdfTitle: 'Trips', subtitle: range, head: [t('c.date'), t('t.no'), t('c.driver'), t('c.vehicle'), t('c.birds'), t('dash.delivered'), t('c.status')],
      pdfHead: ['Date', 'Trip', 'Driver', 'Vehicle', 'Birds', 'Deliveries', 'Status'], rows, pdfRows: ((data ?? []) as any[]).map((x, i) => [...rows[i].slice(0, 6), x.status]), money: [] };
  }
  const { data: biz } = await supabase.from('businesses').select('name, settings').eq('id', ctx.businessId).single();
  const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  return (
    <div className="space-y-5">
      <PageHeader title={t('r.title')} />
      <Pills items={tabs.map(([k, l]) => ({ href: `/reports?r=${k}&p=${per.p}${per.p === 'custom' ? `&from=${per.from}&to=${per.to}` : ''}`, label: l, active: r === k }))} />
      {r === 'receivables' || r === 'payables' ? (
        <form action="/reports" className="flex items-end gap-2">
          <input type="hidden" name="r" value={r} />
          <label className="flex-1"><span className="label">{t('r.asOf')}</span><input type="date" name="asof" defaultValue={asOf} className="input" /></label>
          <button className="press h-12 rounded-2xl bg-ink px-5 font-medium text-white">{t('c.apply')}</button>
        </form>
      ) : <PeriodPills base="/reports" cur={per} t={t} extra={{ r }} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{spec.title}</h2><p className="text-sm text-ink-muted">{spec.subtitle}</p></div>
        <ReportExport spec={spec} business={biz?.name ?? ''} footer={(biz?.settings as any)?.report_footer} />
      </div>
      {spec.summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {spec.summary.map(([k, v]) => <div key={k} className="rounded-2xl bg-white/70 p-3"><p className="text-xs text-ink-muted">{k}</p><p className="tabular font-semibold">{v.replace('Rs. ', '₹')}</p></div>)}
        </div>
      )}
      {spec.rows.length === 0 ? <Empty title={t('c.none')} /> : (
        <div className="card overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-ink-muted"><tr className="border-b border-line">{spec.head.map((h, i) => <th key={i} className={`whitespace-nowrap p-3 font-medium ${spec.money.includes(i) || typeof spec.rows[0][i] === 'number' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {spec.rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {row.map((v, j) => <td key={j} className={`whitespace-nowrap p-3 ${spec.money.includes(j) || typeof v === 'number' ? 'text-right' : ''}`}>{spec.money.includes(j) ? inr(v) : isDate(v) ? fmtDate(v as string, locale, false) : typeof v === 'number' ? num(v) : v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
