import { useState } from 'react';
import { FileSpreadsheet, IndianRupee, ReceiptText, SlidersHorizontal } from 'lucide-react';
import { useAppBar } from '@/components/mobile/AppBarContext';
import { Link } from 'react-router-dom';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useToast } from '@/context/ToastContext';
import { ApiRequestError } from '@/services/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PeriodFilter, type PeriodValue } from '@/components/PeriodFilter';
import { CustomerPicker } from '@/components/CustomerPicker';
import { TransactionList } from '@/features/transactions/TransactionList';
import { formatINR, formatNumber } from '@/utils/money';
import { formatRange } from '@/utils/dates';
import { downloadCsv, safeFilename } from '@/utils/csv';
import { methodLabel, PAYMENT_METHOD_LABELS, TXN_TYPE_LABELS } from '@/utils/labels';
import type { PaymentMethod, TransactionType } from '@/types/api';

const PAGE = 100;

export default function TransactionsPage() {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'MONTH' });
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState<TransactionType | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [includeVoid, setIncludeVoid] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [customerId, type, method, includeVoid ? 'v' : ''].filter(Boolean).length;
  const customers = useApiQuery(() => api.listCustomers({ status: 'ALL' }), []);
  const filters = { ...period, customerId: customerId || undefined, transactionType: type, paymentMethod: method, includeVoid };
  const q = useApiQuery(() => api.listTransactions({ ...filters, limit }), [period.period, period.start, period.end, customerId, type, method, includeVoid, limit]);
  const d = q.data;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.listTransactions({ ...filters, limit: 5000 });
      downloadCsv(
        safeFilename(`Transactions_${all.range.start}_to_${all.range.end}`),
        ['Date', 'Customer ID', 'Customer', 'Type', 'Status', 'Transaction ID', 'Birds', 'Weight (kg)', 'Rate per kg', 'Bill amount', 'Payment amount', 'Payment method', 'Reference', 'Notes', 'Entered by', 'Void reason'],
        all.rows.map((t) => [t.transactionDate, t.customerId, t.customerName, TXN_TYPE_LABELS[t.transactionType], t.status, t.transactionId, t.birdCount, t.weightKg, t.ratePerKg, t.billAmount || '', t.paymentAmount || '', methodLabel(t.paymentMethod), t.referenceNumber, t.notes, t.createdBy, t.voidReason]),
      );
    } catch (e) {
      toast.error((e as ApiRequestError).message);
    } finally {
      setExporting(false);
    }
  };

  useAppBar({
    title: 'History',
    actions: (
      <button type="button" aria-label="Export CSV" disabled={!d?.total || exporting} onClick={exportCsv} className="press rounded-full p-2.5 hover:bg-slate-100 disabled:opacity-40">
        <FileSpreadsheet className="h-5 w-5" />
      </button>
    ),
  }, [d?.total, exporting, period.period, period.start, period.end, customerId, type, method, includeVoid]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        subtitle={d ? formatRange(d.range.start, d.range.end) : 'All bills, payments and adjustments'}
        actions={
          <>
            <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} loading={exporting} disabled={!d?.total} onClick={exportCsv}>Export CSV</Button>
            <Link to="/payments/new"><Button size="sm" variant="secondary" icon={<IndianRupee className="h-4 w-4" />}>Receive Payment</Button></Link>
            <Link to="/bills/new"><Button size="sm" icon={<ReceiptText className="h-4 w-4" />}>Add Bill</Button></Link>
          </>
        }
      />
      <PeriodFilter value={period} onChange={(v) => { setPeriod(v); setLimit(PAGE); }} />
      <button type="button" onClick={() => setShowFilters((f) => !f)} aria-expanded={showFilters} className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink ring-1 ring-line md:hidden">
        <SlidersHorizontal className="h-4 w-4" /> Filters{activeFilters ? ` · ${activeFilters}` : ''}
      </button>
      <div className={`card grid-cols-1 gap-3 rounded-2xl p-3 sm:grid-cols-2 md:grid lg:grid-cols-4 ${showFilters ? 'grid' : 'hidden'}`}>
        <div>
          <CustomerPicker label="Customer" customers={customers.data?.customers ?? []} loading={customers.loading} value={customerId} onChange={setCustomerId} includeInactive />
          {customerId && <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setCustomerId('')}>Clear customer</button>}
        </div>
        <label><span className="field-label">Type</span>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value as TransactionType | '')}>
            <option value="">All types</option><option value="BILL">Bills</option><option value="PAYMENT">Payments</option><option value="ADJUSTMENT">Adjustments</option>
          </select>
        </label>
        <label><span className="field-label">Payment method</span>
          <select className="field-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={includeVoid} onChange={(e) => setIncludeVoid(e.target.checked)} /> Show voided entries
        </label>
      </div>

      {q.error && <ErrorState message={q.error} onRetry={q.reload} />}
      {q.loading && <Skeleton className="h-64 w-full" />}
      {d && (
        <section className={`card rounded-2xl p-4 ${q.refreshing ? 'opacity-70' : ''}`}>
          <div className="mb-3 grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:flex sm:flex-wrap">
            <span><span className="text-ink-muted">Entries:</span> <b>{d.total}</b></span>
            <span><span className="text-ink-muted">Billing:</span> <b className="tabular">{formatINR(d.totals.billing)}</b></span>
            <span><span className="text-ink-muted">Payments:</span> <b className="tabular">{formatINR(d.totals.payments)}</b></span>
            <span><span className="text-ink-muted">Birds:</span> <b>{formatNumber(d.totals.birds)}</b></span>
            <span><span className="text-ink-muted">Weight:</span> <b>{formatNumber(d.totals.weightKg)} kg</b></span>
          </div>
          {d.rows.length ? <TransactionList transactions={d.rows} showCustomer /> : <EmptyState title="No transactions match these filters" />}
          {d.total > d.rows.length && (
            <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)} loading={q.refreshing}>Show more ({d.total - d.rows.length} remaining)</Button></div>
          )}
        </section>
      )}
    </div>
  );
}
