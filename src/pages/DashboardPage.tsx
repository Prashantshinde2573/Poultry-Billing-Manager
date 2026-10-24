import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, FileText, History, IndianRupee, ReceiptText, RefreshCw, Settings as SettingsIcon, UserPlus, Users, Wallet, Scale, Eye, EyeOff } from 'lucide-react';
import { QuickActions } from '@/components/mobile/QuickActions';
import { Avatar } from '@/components/mobile/Avatar';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PeriodFilter, type PeriodValue } from '@/components/PeriodFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { BalanceText } from '@/components/ui/Money';
import { MiniStat, StatCard } from '@/features/dashboard/StatCard';
import { BillingChart } from '@/features/dashboard/BillingChart';
import { TransactionList } from '@/features/transactions/TransactionList';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate, formatRange, todayIST } from '@/utils/dates';
import { readPref, writePref } from '@/utils/prefs';

export default function DashboardPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => readPref<PeriodValue>('dash.period', { period: 'DAY' }));
  const [fresh, setFresh] = useState(0);
  const q = useApiQuery(() => api.getDashboard({ ...period, fresh: fresh > 0 }), [period.period, period.start, period.end, fresh]);
  const cq = useApiQuery(() => api.listCustomers({ status: 'ACTIVE' }), [fresh]);
  const [hideAmounts, setHideAmounts] = useState(() => readPref('hideAmounts', false));
  const recent = (cq.data?.customers ?? [])
    .slice()
    .sort((a, b) => (b.summary?.lastTransactionDate ?? '').localeCompare(a.summary?.lastTransactionDate ?? '') || a.customerName.localeCompare(b.customerName))
    .slice(0, 7);
  const d = q.data;
  const t = d?.totals;
  const loading = q.loading || (q.refreshing && !d);

  const change = (v: PeriodValue) => {
    setPeriod(v);
    writePref('dash.period', v);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={<span className="hidden md:inline">{d ? <>{d.range.label} · {formatRange(d.range.start, d.range.end)}</> : 'Business overview'}</span>}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw className={`h-4 w-4 ${q.refreshing ? 'animate-spin' : ''}`} />} onClick={() => setFresh((f) => f + 1)} title="Reload from Google Sheets">Refresh</Button>
            <Link to="/customers?new=1"><Button variant="secondary" size="sm" icon={<UserPlus className="h-4 w-4" />}>Add Customer</Button></Link>
            <Link to="/bills/new"><Button size="sm" icon={<ReceiptText className="h-4 w-4" />}>Add Bill</Button></Link>
          </>
        }
      />


      {/* ---------- Phone home: balance hero, quick actions, people ---------- */}
      <div className="space-y-4 md:hidden">
        <section className="-mx-4 -mt-4 rounded-b-[28px] bg-primary px-4 pb-6 pt-2 text-white">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Total outstanding · Ekun Baki</p>
              <button type="button" aria-label={hideAmounts ? 'Show amounts' : 'Hide amounts'} className="press rounded-full p-1 text-white/80" onClick={() => { setHideAmounts(!hideAmounts); writePref('hideAmounts', !hideAmounts); }}>
                {hideAmounts ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <p className="tabular mt-1 text-[34px] font-bold leading-tight">{loading ? <span className="inline-block h-9 w-40 animate-pulse rounded bg-white/20" /> : hideAmounts ? '₹ ••••••' : formatINR(t?.outstanding)}</p>
            <p className="mt-0.5 text-xs text-white/80">{t ? `${t.customersWithOutstanding} customers owe money · as of today` : ' '}{t && t.advances > 0 && !hideAmounts ? ` · ${formatINR(t.advances)} advance` : ''}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/10 px-3 py-2"><p className="text-[11px] text-white/75">Billed · {d?.range.label ?? 'Today'}</p><p className="tabular font-semibold">{hideAmounts ? '••••' : formatINR(t?.billing)}</p></div>
              <div className="rounded-xl bg-white/10 px-3 py-2"><p className="text-[11px] text-white/75">Received · {d?.range.label ?? 'Today'}</p><p className="tabular font-semibold">{hideAmounts ? '••••' : formatINR(t?.payments)}</p></div>
            </div>
          </div>
        </section>

        <div className="-mt-1 grid grid-cols-2 gap-3">
          <Link to="/bills/new" className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold shadow-sm ring-1 ring-line"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700"><ReceiptText className="h-4 w-4" /></span>Add Bill</Link>
          <Link to="/payments/new" className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold shadow-sm ring-1 ring-line"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-success"><IndianRupee className="h-4 w-4" /></span>Receive</Link>
        </div>

        <QuickActions
          title="Quick actions"
          actions={[
            { to: '/customers?new=1', label: 'Add Customer', icon: <UserPlus className="h-5 w-5" />, tone: 'bg-teal-50 text-teal-700' },
            { to: '/customers', label: 'Customers', icon: <Users className="h-5 w-5" />, tone: 'bg-indigo-50 text-indigo-700' },
            { to: '/transactions', label: 'History', icon: <History className="h-5 w-5" />, tone: 'bg-sky-50 text-sky-700' },
            { to: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, tone: 'bg-violet-50 text-violet-700' },
            { to: '/reports?type=OUTSTANDING', label: 'Dues List', icon: <Wallet className="h-5 w-5" />, tone: 'bg-rose-50 text-rose-700' },
            { to: '/reports?type=STATEMENT', label: 'Statement', icon: <ReceiptText className="h-5 w-5" />, tone: 'bg-amber-50 text-amber-700' },
            { to: '/reports?type=PAYMENTS', label: 'Payments Report', icon: <IndianRupee className="h-5 w-5" />, tone: 'bg-green-50 text-green-700' },
            { to: '/settings', label: 'Settings', icon: <SettingsIcon className="h-5 w-5" />, tone: 'bg-slate-100 text-slate-700' },
          ]}
        />

        {recent.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-line">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Customers</h2>
              <Link to="/customers" className="flex items-center text-sm font-medium text-primary">See all <ChevronRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid grid-cols-4 gap-y-3">
              {recent.map((c) => (
                <Link key={c.customerId} to={`/customers/${c.customerId}`} className="press flex flex-col items-center gap-1 text-center">
                  <Avatar name={c.customerName} size={48} />
                  <span className="line-clamp-2 w-full px-0.5 text-[12px] font-medium leading-tight">{c.customerName}</span>
                </Link>
              ))}
              <Link to="/customers?new=1" className="press flex flex-col items-center gap-1 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-primary/40 text-primary"><UserPlus className="h-5 w-5" /></span>
                <span className="text-[12px] font-medium leading-tight text-primary">Add new</span>
              </Link>
            </div>
          </section>
        )}

        <InstallPrompt />

        <div className="flex items-center justify-between pt-1">
          <div><h2 className="text-[15px] font-semibold">Business summary</h2>{d && <p className="text-xs text-ink-muted">{formatRange(d.range.start, d.range.end)}</p>}</div>
          <button type="button" onClick={() => setFresh((f) => f + 1)} className="press flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-primary" aria-label="Refresh from Google Sheets">
            <RefreshCw className={`h-4 w-4 ${q.refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <PeriodFilter value={period} onChange={change} />

      {q.error && <ErrorState message={q.error} onRetry={q.reload} />}
      {d && d.missingSheets.length > 0 && (
        <Alert tone="warning"><AlertTriangle className="mr-1 inline h-4 w-4" />{d.missingSheets.length} customer tab(s) are missing from the spreadsheet, so their transactions are not counted. Open the customer and use “Repair sheet”.</Alert>
      )}

      {!q.error && (
        <>
          <div className={`grid grid-cols-2 gap-3 xl:grid-cols-4 ${q.refreshing ? 'opacity-70 transition-opacity' : ''}`}>
            <StatCard
              label="Total Billing" sublabel="Ekun Bil" tone="teal" icon={<ReceiptText className="h-5 w-5" />} loading={loading}
              value={formatINR(t?.billing)}
              footnote={t && `${t.billCount} bill${t.billCount === 1 ? '' : 's'} in this period`}
              tip="Sum of all bills dated within the selected period. Payments are not included."
            />
            <StatCard
              label="Payments Received" sublabel="Ekun Jama" tone="indigo" icon={<IndianRupee className="h-5 w-5" />} loading={loading}
              value={formatINR(t?.payments)}
              footnote={t && `${t.paymentCount} payment${t.paymentCount === 1 ? '' : 's'} in this period`}
              tip="Money actually received within the selected period, including payments against old dues."
            />
            <StatCard
              label="Customers" sublabel="Ekun Grahak" tone="slate" icon={<Users className="h-5 w-5" />} loading={loading}
              value={formatNumber(t?.activeCustomers)}
              footnote={t && `${t.customersWithActivity} with activity in this period`}
              tip="All active customers in the business. The note below shows how many had a bill or payment in the selected period."
            />
            <div className="hidden md:block"><StatCard
              label="Outstanding" sublabel="Ekun Baki · as of today" tone="red" icon={<Wallet className="h-5 w-5" />} loading={loading}
              value={<span className="text-danger">{formatINR(t?.outstanding)}</span>}
              footnote={t && (
                <>
                  {t.customersWithOutstanding} customer{t.customersWithOutstanding === 1 ? '' : 's'} owe money
                  {t.advances > 0 && <> · {formatINR(t.advances)} held as advance</>}
                  {d?.range.isHistorical && <> · At {formatDate(d.range.end)}: {formatINR(t.closingOutstanding)}</>}
                </>
              )}
              tip={`Total that customers owe right now (${formatDate(todayIST())}), across active and archived accounts. It is a current figure and does not change with the period filter.`}
            /></div>
            <div className="md:hidden"><StatCard label="Bills · Payments" sublabel="Count in period" tone="slate" icon={<Scale className="h-5 w-5" />} loading={loading} value={t ? `${t.billCount} · ${t.paymentCount}` : '—'} footnote={t && `${t.voidCount} voided`} /></div>
          </div>

          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            <MiniStat label="Birds" value={formatNumber(t?.birds)} loading={loading} />
            <MiniStat label="Weight" value={`${formatNumber(t?.weightKg)} kg`} loading={loading} />
            <MiniStat label="Avg rate / kg" value={t && t.weightKg > 0 ? formatINR(t.avgRatePerKg) : '—'} loading={loading} />
            <div className="hidden md:block"><MiniStat label="Bills · Payments" value={t ? `${t.billCount} · ${t.paymentCount}` : '—'} loading={loading} /></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card rounded-2xl p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Billing vs Payments</h2>
                <span className="text-xs text-ink-muted">{d?.range.granularity === 'month' ? 'Monthly' : 'Daily'}</span>
              </div>
              {loading ? <Skeleton className="h-72 w-full" /> : d && (d.totals.billing > 0 || d.totals.payments > 0)
                ? <BillingChart data={d.chart} granularity={d.range.granularity} />
                : <EmptyState icon={<Scale className="h-6 w-6" />} title="No bills or payments in this period" message="Choose a longer period or add a bill." action={<Link to="/bills/new"><Button size="sm">Add Bill</Button></Link>} />}
            </section>

            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Highest outstanding</h2>
              {loading ? <Skeleton className="h-48 w-full" /> : d && d.topOutstanding.length ? (
                <ul className="divide-y divide-line">
                  {d.topOutstanding.map((c) => (
                    <li key={c.customerId}>
                      <Link to={`/customers/${c.customerId}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                        <span className="min-w-0 truncate font-medium">{c.customerName}</span>
                        <BalanceText value={c.balance} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No outstanding dues" message="Every customer is settled." />}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Top customers by billing</h2>
              {loading ? <Skeleton className="h-48 w-full" /> : d && d.topCustomersByBilling.length ? (
                <ul className="space-y-3">
                  {d.topCustomersByBilling.map((c) => {
                    const pct = d.topCustomersByBilling[0].billing ? (c.billing / d.topCustomersByBilling[0].billing) * 100 : 0;
                    return (
                      <li key={c.customerId}>
                        <Link to={`/customers/${c.customerId}`} className="block hover:text-primary">
                          <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium">{c.customerName}</span><span className="tabular font-semibold">{formatINR(c.billing)}</span></div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                          <p className="mt-0.5 text-xs text-ink-muted">{formatNumber(c.birds)} birds · {formatNumber(c.weightKg)} kg</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title="No bills in this period" />}
            </section>

            <section className="card p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Recent transactions</h2>
                <Link to="/transactions" className="text-sm font-medium text-primary hover:underline">View all</Link>
              </div>
              {loading ? <Skeleton className="h-48 w-full" /> : d && d.recentTransactions.length
                ? <TransactionList transactions={d.recentTransactions} showCustomer compact />
                : <EmptyState title="No transactions in this period" message="Bills and payments you record will appear here." action={<div className="flex gap-2"><Link to="/bills/new"><Button size="sm">Add Bill</Button></Link><Link to="/payments/new"><Button size="sm" variant="secondary">Receive Payment</Button></Link></div>} />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
