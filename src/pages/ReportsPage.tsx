import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarRange, FileBarChart, FileSpreadsheet, Download, IndianRupee, MessageCircle, Printer, Scale, User, Wallet } from 'lucide-react';
import type { PaymentMethod, PeriodKey, ReportType, TransactionType } from '@/types/api';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { ApiRequestError } from '@/services/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PeriodFilter, type PeriodValue } from '@/components/PeriodFilter';
import { CustomerPicker } from '@/components/CustomerPicker';
import { BalanceText } from '@/components/ui/Money';
import { Avatar } from '@/components/mobile/Avatar';
import { TransactionList } from '@/features/transactions/TransactionList';
import {
  downloadOutstandingPdf, downloadReportPdf, downloadStatementPdf, outstandingCsv, reportByCustomerCsv, reportCsv,
  reportText, shareStatement, statementCsv,
} from '@/features/reports/exports';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate, formatRange, todayIST } from '@/utils/dates';
import { PAYMENT_METHOD_LABELS } from '@/utils/labels';
import { openWhatsApp } from '@/utils/whatsapp';

type Kind = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTER' | 'HALF_YEAR' | 'YEARLY' | 'CUSTOM' | 'STATEMENT' | 'OUTSTANDING' | 'PAYMENTS' | 'BILLING';

const KINDS: { key: Kind; label: string; icon: typeof FileBarChart; period?: PeriodKey; type?: ReportType }[] = [
  { key: 'DAILY', label: 'Daily', icon: CalendarDays, period: 'DAY', type: 'SUMMARY' },
  { key: 'WEEKLY', label: 'Weekly', icon: CalendarDays, period: 'WEEK', type: 'SUMMARY' },
  { key: 'MONTHLY', label: 'Monthly', icon: CalendarDays, period: 'MONTH', type: 'SUMMARY' },
  { key: 'QUARTER', label: '3-Month', icon: CalendarDays, period: 'QUARTER', type: 'SUMMARY' },
  { key: 'HALF_YEAR', label: '6-Month', icon: CalendarDays, period: 'HALF_YEAR', type: 'SUMMARY' },
  { key: 'YEARLY', label: 'Yearly', icon: CalendarDays, period: 'YEAR', type: 'SUMMARY' },
  { key: 'CUSTOM', label: 'Custom range', icon: CalendarRange, period: 'CUSTOM', type: 'SUMMARY' },
  { key: 'STATEMENT', label: 'Customer statement', icon: User },
  { key: 'OUTSTANDING', label: 'Outstanding balances', icon: Wallet },
  { key: 'PAYMENTS', label: 'Payments received', icon: IndianRupee, period: 'MONTH', type: 'PAYMENTS' },
  { key: 'BILLING', label: 'Billing & weight', icon: Scale, period: 'MONTH', type: 'BILLING' },
];

function Total({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1 font-semibold tabular">{value}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { settings } = useSettings();
  const toast = useToast();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>('DAILY');
  const def = KINDS.find((k) => k.key === kind)!;
  const today = todayIST();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'DAY' });
  const [customerId, setCustomerId] = useState('');
  const [txnType, setTxnType] = useState<TransactionType | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [asOf, setAsOf] = useState(today);
  const [includeZero, setIncludeZero] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const customers = useApiQuery(() => api.listCustomers({ status: 'ALL' }), []);
  const customerName = customers.data?.customers.find((c) => c.customerId === customerId)?.customerName;

  const isTxnReport = !!def.type;
  const rq = useApiQuery(
    () => api.getReports({ ...period, reportType: def.type ?? 'SUMMARY', customerId: customerId || undefined, transactionType: def.type === 'SUMMARY' ? txnType : '', paymentMethod: def.type === 'BILLING' ? '' : method }),
    [kind, period.period, period.start, period.end, customerId, txnType, method],
    { enabled: isTxnReport },
  );
  const sq = useApiQuery(() => api.getCustomerStatement(customerId, period), [kind, customerId, period.period, period.start, period.end], { enabled: kind === 'STATEMENT' && !!customerId });
  const oq = useApiQuery(() => api.getOutstandingReport({ asOf, includeZero }), [asOf, includeZero], { enabled: kind === 'OUTSTANDING' });

  const choose = (k: Kind) => {
    const d = KINDS.find((x) => x.key === k)!;
    setKind(k);
    if (d.period && d.period !== 'CUSTOM') setPeriod({ period: d.period });
    if (d.period === 'CUSTOM') setPeriod({ period: 'CUSTOM', start: today.slice(0, 8) + '01', end: today });
    if (k === 'STATEMENT') setPeriod({ period: 'MONTH' });
  };

  const run = async (key: string, fn: () => Promise<unknown> | void) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as ApiRequestError).message || 'Export failed'); } finally { setBusy(null); }
  };

  // Deep links from the home screen, e.g. /reports?type=OUTSTANDING
  useEffect(() => {
    const t = params.get('type') as Kind | null;
    if (t && KINDS.some((k) => k.key === t)) choose(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const title = `${def.label} report`;
  const r = rq.data;
  const st = sq.data;
  const o = oq.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Every figure comes straight from your Google Sheet. Exports respect the filters you choose." />

      <div className="no-print no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-6" role="tablist" aria-label="Report type">
        {KINDS.map((k) => (
          <button key={k.key} role="tab" aria-selected={kind === k.key} type="button" onClick={() => choose(k.key)}
            className={`press flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-left text-sm font-medium md:rounded-xl md:py-2.5 ${kind === k.key ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-white text-ink-muted hover:text-ink'}`}>
            <k.icon className="h-4 w-4 shrink-0" /> {k.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="no-print space-y-3">
        {kind !== 'OUTSTANDING' && <PeriodFilter key={kind} value={period} onChange={setPeriod} />}
        <div className="card grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {kind === 'OUTSTANDING' ? (
            <>
              <label><span className="field-label">Balances as of</span><input type="date" className="field-input" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value || today)} /></label>
              <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> Include settled customers</label>
            </>
          ) : (
            <>
              <div>
                <CustomerPicker label={kind === 'STATEMENT' ? 'Customer (required)' : 'Customer'} customers={customers.data?.customers ?? []} loading={customers.loading} value={customerId} onChange={setCustomerId} includeInactive />
                {customerId && kind !== 'STATEMENT' && <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setCustomerId('')}>All customers</button>}
              </div>
              {def.type === 'SUMMARY' && (
                <label><span className="field-label">Transaction type</span>
                  <select className="field-input" value={txnType} onChange={(e) => setTxnType(e.target.value as TransactionType | '')}>
                    <option value="">All</option><option value="BILL">Bills</option><option value="PAYMENT">Payments</option><option value="ADJUSTMENT">Adjustments</option>
                  </select>
                </label>
              )}
              {(def.type === 'SUMMARY' || def.type === 'PAYMENTS') && (
                <label><span className="field-label">Payment method</span>
                  <select className="field-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
                    <option value="">All methods</option>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transaction-based reports */}
      {isTxnReport && (
        <>
          {rq.error && <ErrorState message={rq.error} onRetry={rq.reload} />}
          {rq.loading && <Skeleton className="h-64 w-full" />}
          {r && (
            <section className={`space-y-4 ${rq.refreshing ? 'opacity-70' : ''}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <p className="text-sm text-ink-muted">{formatRange(r.range.start, r.range.end)}{customerName && ` · ${customerName}`}</p>
                </div>
                <div className="no-print flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'pdf'} onClick={() => run('pdf', () => downloadReportPdf(r, settings, title, customerName))}>PDF</Button>
                  <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!r.rows.length} onClick={() => reportCsv(r, title)}>CSV (entries)</Button>
                  <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!r.byCustomer.length} onClick={() => reportByCustomerCsv(r, title)}>CSV (by customer)</Button>
                  <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
                  <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openWhatsApp(null, reportText(r, title, settings.businessName))}>WhatsApp</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {def.type !== 'PAYMENTS' && <Total label="Total billing" value={formatINR(r.totals.billing)} />}
                {def.type !== 'BILLING' && <Total label="Payments received" value={formatINR(r.totals.payments)} />}
                {def.type !== 'PAYMENTS' && <Total label="Birds" value={formatNumber(r.totals.birds)} />}
                {def.type !== 'PAYMENTS' && <Total label="Weight" value={`${formatNumber(r.totals.weightKg)} kg`} />}
                {def.type !== 'PAYMENTS' && <Total label="Avg rate / kg" value={r.totals.weightKg ? formatINR(r.totals.avgRatePerKg) : '—'} />}
                <Total label="Bills · Payments" value={`${r.totals.billCount} · ${r.totals.paymentCount}`} />
                <Total label={`Closing outstanding (${formatDate(r.range.end)})`} value={formatINR(r.totals.closingOutstanding)} />
                <Total label="Current outstanding (today)" value={formatINR(r.totals.currentOutstanding)} />
              </div>
              {def.type === 'PAYMENTS' && r.paymentsByMethod.length > 0 && (
                <div className="card flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm">
                  {r.paymentsByMethod.map((m) => <span key={m.paymentMethod}><span className="text-ink-muted">{PAYMENT_METHOD_LABELS[m.paymentMethod]}:</span> <b className="tabular">{formatINR(m.amount)}</b></span>)}
                </div>
              )}
              {r.byCustomer.length > 0 && !customerId && (
                <section className="card overflow-x-auto p-4">
                  <h3 className="mb-2 font-semibold">By customer</h3>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 text-right font-medium">Birds</th><th className="py-2 pr-3 text-right font-medium">Weight</th>
                      <th className="py-2 pr-3 text-right font-medium">Billing</th><th className="py-2 pr-3 text-right font-medium">Payments</th><th className="py-2 pr-3 text-right font-medium">Closing</th><th className="py-2 text-right font-medium">Today</th>
                    </tr></thead>
                    <tbody>{r.byCustomer.map((c) => (
                      <tr key={c.customerId} className="border-b border-line/70 last:border-0">
                        <td className="py-2 pr-3 font-medium">{c.customerName}</td><td className="tabular py-2 pr-3 text-right">{formatNumber(c.birds)}</td><td className="tabular py-2 pr-3 text-right">{formatNumber(c.weightKg)}</td>
                        <td className="tabular py-2 pr-3 text-right">{formatINR(c.billing)}</td><td className="tabular py-2 pr-3 text-right">{formatINR(c.payments)}</td>
                        <td className="py-2 pr-3 text-right"><BalanceText value={c.closingBalance} /></td><td className="py-2 text-right"><BalanceText value={c.currentBalance} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </section>
              )}
              <section className="card p-4">
                <h3 className="mb-2 font-semibold">Entries ({r.rows.length})</h3>
                {r.rows.length ? <TransactionList transactions={r.rows} showCustomer /> : <EmptyState title="No entries for these filters" />}
              </section>
            </section>
          )}
        </>
      )}

      {/* Customer statement */}
      {kind === 'STATEMENT' && (
        !customerId ? <div className="card"><EmptyState icon={<User className="h-6 w-6" />} title="Choose a customer" message="Pick a customer above to see their statement with opening, running and closing balances." /></div> : (
          <>
            {sq.error && <ErrorState message={sq.error} onRetry={sq.reload} />}
            {sq.loading && <Skeleton className="h-64 w-full" />}
            {st && (
              <section className={`card space-y-4 p-4 ${sq.refreshing ? 'opacity-70' : ''}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Statement · {st.customer.customerName}</h2>
                    <p className="text-sm text-ink-muted">{formatRange(st.range.start, st.range.end)} · {st.customer.phone}</p>
                  </div>
                  <div className="no-print flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'spdf'} onClick={() => run('spdf', () => downloadStatementPdf(st, settings))}>PDF</Button>
                    <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => statementCsv(st)}>CSV</Button>
                    <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
                    <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} loading={busy === 'sshare'} onClick={() => run('sshare', async () => { const x = await shareStatement(st, settings); if (x === 'downloaded') toast.info('PDF downloaded; WhatsApp opened with a summary.'); })}>Share</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Total label={`Opening (${formatDate(st.range.start)})`} value={formatINR(st.openingBalance)} />
                  <Total label="Bills" value={formatINR(st.totals.billing)} />
                  <Total label="Payments" value={formatINR(st.totals.payments)} />
                  <Total label={`Closing (${formatDate(st.range.end)})`} value={formatINR(st.closingBalance)} />
                </div>
                {st.rows.length ? <TransactionList transactions={st.rows.map((x) => ({ ...x.transaction, runningBalance: x.runningBalance, customerName: st.customer.customerName }))} showRunningBalance /> : <EmptyState title="No transactions in this period" />}
              </section>
            )}
          </>
        )
      )}

      {/* Outstanding */}
      {kind === 'OUTSTANDING' && (
        <>
          {oq.error && <ErrorState message={oq.error} onRetry={oq.reload} />}
          {oq.loading && <Skeleton className="h-64 w-full" />}
          {o && (
            <section className={`card space-y-4 p-4 ${oq.refreshing ? 'opacity-70' : ''}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Outstanding balances</h2>
                  <p className="text-sm text-ink-muted">As of {formatDate(o.asOf)}{o.isHistorical && ' (historical — later transactions excluded)'}</p>
                </div>
                <div className="no-print flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'opdf'} onClick={() => run('opdf', () => downloadOutstandingPdf(o, settings))}>PDF</Button>
                  <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!o.rows.length} onClick={() => outstandingCsv(o)}>CSV</Button>
                  <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Total label="Total receivable" value={<span className="text-danger">{formatINR(o.totals.receivable)}</span>} />
                <Total label="Customers with dues" value={o.totals.customersWithOutstanding} />
                <Total label="Advances held" value={formatINR(o.totals.advances)} />
                <Total label="Net outstanding" value={formatINR(o.totals.net)} />
              </div>
              {o.rows.length > 0 && (
                <ul className="-mx-1 divide-y divide-line md:hidden">
                  {o.rows.map((x) => (
                    <li key={x.customerId} className="flex items-center gap-3 px-1 py-2.5">
                      <Avatar name={x.customerName} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{x.customerName}{x.status === 'INACTIVE' && <span className="ml-1 text-xs text-ink-muted">(archived)</span>}</p>
                        <p className="truncate text-xs text-ink-muted">{x.lastPaymentDate ? `Paid ${formatDate(x.lastPaymentDate)} · ${x.daysSinceLastPayment} days ago` : 'No payment yet'}</p>
                      </div>
                      <BalanceText value={x.balance} className="text-[15px]" />
                      {x.balance > 0 && (
                        <button type="button" aria-label={`Send WhatsApp reminder to ${x.customerName}`} className="press rounded-full bg-green-50 p-2 text-success no-print"
                          onClick={() => openWhatsApp(x.phone, `Namaste ${x.customerName}, your outstanding balance with ${settings.businessName} is ${formatINR(x.balance)} as of ${formatDate(o.asOf)}. Kindly arrange payment. Thank you.`)}>
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {o.rows.length ? (
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Mobile</th><th className="py-2 pr-3 font-medium">Last bill</th><th className="py-2 pr-3 font-medium">Last payment</th><th className="py-2 pr-3 text-right font-medium">Days since payment</th><th className="py-2 text-right font-medium">Balance</th><th className="no-print py-2" />
                    </tr></thead>
                    <tbody>{o.rows.map((x) => (
                      <tr key={x.customerId} className="border-b border-line/70 last:border-0">
                        <td className="py-2 pr-3 font-medium">{x.customerName}{x.status === 'INACTIVE' && <span className="ml-1 text-xs text-ink-muted">(archived)</span>}</td>
                        <td className="py-2 pr-3 text-ink-muted">{x.phone}</td><td className="py-2 pr-3">{formatDate(x.lastBillDate)}</td><td className="py-2 pr-3">{formatDate(x.lastPaymentDate)}</td>
                        <td className="tabular py-2 pr-3 text-right">{x.daysSinceLastPayment ?? '—'}</td><td className="py-2 text-right"><BalanceText value={x.balance} /></td>
                        <td className="no-print py-2 pl-2 text-right">{x.balance > 0 && <button type="button" title="Send reminder on WhatsApp" className="rounded p-1 text-ink-muted hover:text-success" onClick={() => openWhatsApp(x.phone, `Namaste ${x.customerName}, your outstanding balance with ${settings.businessName} is ${formatINR(x.balance)} as of ${formatDate(o.asOf)}. Kindly arrange payment. Thank you.`)}><MessageCircle className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <EmptyState title="No outstanding balances" message="Every customer is settled on this date." />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
