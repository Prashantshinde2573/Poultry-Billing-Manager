import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Download, FileSpreadsheet, IndianRupee, MessageCircle, MoreHorizontal, MoreVertical, Pencil, Phone, Printer, ReceiptText, RotateCcw, Scale, Trash2, Wrench } from 'lucide-react';
import { useAppBar } from '@/components/mobile/AppBarContext';
import { ActionSheet } from '@/components/mobile/ActionSheet';
import { Avatar } from '@/components/mobile/Avatar';
import { whatsappUrl } from '@/utils/whatsapp';
import { api } from '@/services/api/endpoints';
import { ApiRequestError } from '@/services/api/client';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { BalanceText } from '@/components/ui/Money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PeriodFilter, isAllTime, type PeriodValue } from '@/components/PeriodFilter';
import { TransactionList } from '@/features/transactions/TransactionList';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { AdjustmentModal } from '@/features/customers/AdjustmentModal';
import { downloadStatementPdf, shareStatement, statementCsv } from '@/features/reports/exports';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate, formatDateTime, formatRange } from '@/utils/dates';

type View = 'ALL' | 'BILL' | 'PAYMENT';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1 text-lg font-semibold tabular">{value}</div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { customerId = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { isOwner } = useAuth();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<PeriodValue>({ period: 'MONTH' });
  const [view, setView] = useState<View>('ALL');
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'reactivate' | 'delete'>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const cq = useApiQuery(() => api.getCustomer(customerId), [customerId]);
  const sq = useApiQuery(() => api.getCustomerStatement(customerId, period), [customerId, period.period, period.start, period.end]);
  const c = cq.data;
  const st = sq.data;

  const rows = useMemo(() => {
    if (!st) return [];
    return st.rows
      .filter((r) => view === 'ALL' || r.transaction.transactionType === view)
      .map((r) => ({ ...r.transaction, runningBalance: r.runningBalance, customerName: c?.customerName }));
  }, [st, view, c?.customerName]);

  useAppBar({
    title: cq.data?.customerName ?? 'Customer',
    subtitle: cq.data ? `${cq.data.customerId}${cq.data.status === 'INACTIVE' ? ' · Archived' : ''}` : undefined,
    actions: cq.data ? (
      <button type="button" aria-label="More options" onClick={() => setSheet(true)} className="press rounded-full p-2.5 hover:bg-slate-100"><MoreVertical className="h-5 w-5" /></button>
    ) : undefined,
  }, [cq.data?.customerName, cq.data?.customerId, cq.data?.status]);

  const voided = useMemo(() => (c?.transactions ?? []).filter((t) => t.status === 'VOID' && st && t.transactionDate >= st.range.start && t.transactionDate <= st.range.end), [c, st]);

  if (cq.error) return <ErrorState message={cq.errorCode === 'NOT_FOUND' ? 'This customer does not exist or was deleted.' : cq.error} onRetry={cq.reload} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;

  const s = c.summary;
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as ApiRequestError).message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };
  const canDelete = isOwner && s.transactionCount === 0 && (c.transactions?.length ?? 0) === 0 && c.openingBalance === 0;

  return (
    <div className="space-y-5">
      <Link to="/customers" className="no-print hidden items-center gap-1 text-sm text-ink-muted hover:text-ink md:inline-flex"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      {/* phone: contact card */}
      <section className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-line md:hidden">
        <Avatar name={c.customerName} size={64} className="mx-auto" />
        <h2 className="mt-2 text-lg font-bold">{c.customerName}</h2>
        <p className="text-sm text-ink-muted">{c.phone}{c.status === 'INACTIVE' && ' · Archived'}</p>
        <div className="mt-3 flex justify-center gap-3">
          <a href={`tel:${c.phone}`} className="press flex h-10 items-center gap-1.5 rounded-full bg-slate-100 px-4 text-sm font-semibold"><Phone className="h-4 w-4" /> Call</a>
          <a href={whatsappUrl(c.phone, '')} target="_blank" rel="noreferrer" className="press flex h-10 items-center gap-1.5 rounded-full bg-green-50 px-4 text-sm font-semibold text-success"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{s.balance < -0.004 ? 'Advance held' : 'Outstanding'}</p>
          <p className="text-3xl font-bold"><BalanceText value={s.balance} /></p>
          <p className="text-xs text-ink-muted">{s.balance > 0.004 ? 'Customer owes this today' : s.balance < -0.004 ? 'You hold this for the customer' : 'Fully settled'}{s.lastPaymentDate && ` · Last paid ${formatDate(s.lastPaymentDate)}`}</p>
        </div>
      </section>

      <div className="hidden md:block"><PageHeader
        title={<span className="flex items-center gap-2">{c.customerName} <StatusBadge status={c.status} /></span>}
        subtitle={<>{c.phone}{c.address && <> · {c.address}</>} · {c.customerId}</>}
        actions={
          <>
            {c.status === 'ACTIVE' && <Link to={`/bills/new?customer=${c.customerId}`}><Button size="sm" icon={<ReceiptText className="h-4 w-4" />}>Add Bill</Button></Link>}
            <Link to={`/payments/new?customer=${c.customerId}`}><Button size="sm" variant="success" icon={<IndianRupee className="h-4 w-4" />}>Receive Payment</Button></Link>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>
            <div className="relative">
              <Button size="sm" variant="secondary" icon={<MoreHorizontal className="h-4 w-4" />} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>More</Button>
              {menu && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-white py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  {isOwner && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); setAdjusting(true); }}><Scale className="h-4 w-4" /> Add adjustment</button>}
                  {isOwner && c.status === 'ACTIVE' && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); setConfirm('archive'); }}><Archive className="h-4 w-4" /> Archive customer</button>}
                  {isOwner && c.status === 'INACTIVE' && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenu(false); setConfirm('reactivate'); }}><RotateCcw className="h-4 w-4" /> Reactivate customer</button>}
                  {canDelete && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-red-50" onClick={() => { setMenu(false); setConfirm('delete'); }}><Trash2 className="h-4 w-4" /> Delete permanently</button>}
                  {!isOwner && <p className="px-3 py-2 text-xs text-ink-muted">Archive and adjustments are owner-only.</p>}
                </div>
              )}
            </div>
          </>
        }
      /></div>

      {c.sheetMissing && (
        <Alert tone="danger">
          This customer’s tab is missing from the Google Sheet, so their transactions cannot be read.{' '}
          <Button size="sm" variant="secondary" icon={<Wrench className="h-4 w-4" />} loading={busy === 'repair'} onClick={() => run('repair', async () => { await api.createCustomerSheet(c.customerId); toast.success('Sheet tab re-created.'); })}>Repair sheet</Button>
        </Alert>
      )}
      {c.unidentifiedRows > 0 && <Alert tone="warning">{c.unidentifiedRows} row(s) in this customer’s tab were typed by hand without a transaction ID and are not counted. The owner can run <code>repairManualRows()</code> in Apps Script to include them.</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="col-span-2 hidden rounded-xl border border-line bg-white p-4 md:block lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current outstanding</p>
          <div className="mt-1 text-3xl font-bold"><BalanceText value={s.balance} /></div>
          <p className="mt-1 text-xs text-ink-muted">{s.balance < 0 ? 'Advance held for this customer' : s.balance > 0 ? 'Customer owes this amount today' : 'Fully settled'}{s.lastPaymentDate && <> · Last payment {formatDate(s.lastPaymentDate)}</>}</p>
        </div>
        <Stat label="Opening balance" value={formatINR(s.openingBalance)} />
        <Stat label="Total bills" value={formatINR(s.totalBilling)} />
        <Stat label="Total payments" value={formatINR(s.totalPayments)} />
        <Stat label="Birds · weight" value={<span className="text-base">{formatNumber(s.birds)} · {formatNumber(s.weightKg)} kg</span>} />
      </div>
      {(s.totalAdjustmentsDebit > 0 || s.totalAdjustmentsCredit > 0) && <p className="text-xs text-ink-muted">Adjustments: {formatINR(s.totalAdjustmentsDebit)} debit, {formatINR(s.totalAdjustmentsCredit)} credit.</p>}

      <section className="card rounded-2xl p-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold">Transaction history</h2>
            {st && <p className="text-sm text-ink-muted">{isAllTime(period) ? 'All time' : formatRange(st.range.start, st.range.end)}</p>}
          </div>
          <div className="no-print hidden flex-wrap gap-2 md:flex">
            <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!st} loading={busy === 'pdf'} onClick={() => st && run('pdf', () => downloadStatementPdf(st, settings))}>Statement PDF</Button>
            <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!st} onClick={() => st && statementCsv(st)}>CSV</Button>
            <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
            <Button size="sm" icon={<MessageCircle className="h-4 w-4" />} disabled={!st} loading={busy === 'share'} onClick={() => st && run('share', async () => {
              const r = await shareStatement(st, settings);
              if (r === 'downloaded') toast.info('Statement PDF downloaded and WhatsApp opened with a summary. Attach the PDF in WhatsApp if you want to send it.');
            })}>Share</Button>
          </div>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} showAllTime />

        {sq.error && <div className="mt-4"><ErrorState message={sq.error} onRetry={sq.reload} /></div>}
        {sq.loading && <Skeleton className="mt-4 h-48 w-full" />}
        {st && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-ink-muted">Opening</span><p className="tabular font-semibold">{formatINR(st.openingBalance)}</p></div>
              <div className="rounded-lg bg-amber-50 px-3 py-2"><span className="text-ink-muted">Bills ({st.totals.billCount})</span><p className="tabular font-semibold">{formatINR(st.totals.billing)}</p></div>
              <div className="rounded-lg bg-green-50 px-3 py-2"><span className="text-ink-muted">Payments ({st.totals.paymentCount})</span><p className="tabular font-semibold">{formatINR(st.totals.payments)}</p></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-ink-muted">Closing</span><p className="tabular font-semibold">{formatINR(st.closingBalance)}</p></div>
            </div>
            <div className="no-print mt-4 inline-flex rounded-lg border border-line p-0.5 text-sm" role="tablist" aria-label="Show">
              {(['ALL', 'BILL', 'PAYMENT'] as View[]).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-primary-soft text-primary-dark' : 'text-ink-muted'}`}>
                  {v === 'ALL' ? 'All' : v === 'BILL' ? 'Bills' : 'Payments'}
                </button>
              ))}
            </div>
            <div className="mt-2">
              {rows.length ? <TransactionList transactions={rows} showRunningBalance={view === 'ALL'} /> : (
                <EmptyState title="No transactions in this period" message={s.transactionCount ? 'Choose a longer period or “All” to see older entries.' : 'Add the first bill for this customer.'}
                  action={c.status === 'ACTIVE' ? <Link to={`/bills/new?customer=${c.customerId}`}><Button size="sm">Add Bill</Button></Link> : undefined} />
              )}
            </div>
            {voided.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-ink-muted">{voided.length} voided transaction(s) in this period (not counted)</summary>
                <div className="mt-2"><TransactionList transactions={voided.map((t) => ({ ...t, customerName: c.customerName }))} /></div>
              </details>
            )}
          </>
        )}
      </section>

      <p className="text-xs text-ink-muted">Customer since {formatDateTime(c.createdAt)} · Sheet tab “{c.sheetName}”{c.notes && <> · Notes: {c.notes}</>}</p>

      {/* phone: fixed bottom actions */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t border-line bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
        {c.status === 'ACTIVE'
          ? <Link to={`/bills/new?customer=${c.customerId}`} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-white"><ReceiptText className="h-5 w-5" /> Add Bill</Link>
          : <button type="button" onClick={() => setConfirm('reactivate')} disabled={!isOwner} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 text-[15px] font-semibold disabled:opacity-50"><RotateCcw className="h-5 w-5" /> Reactivate</button>}
        <Link to={`/payments/new?customer=${c.customerId}`} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-success text-[15px] font-semibold text-white"><IndianRupee className="h-5 w-5" /> Receive</Link>
      </div>
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={c.customerName}
        actions={[
          { key: 'edit', label: 'Edit customer', icon: <Pencil className="h-5 w-5" />, onSelect: () => setEditing(true) },
          { key: 'pdf', label: 'Statement PDF', description: 'For the period selected below', icon: <Download className="h-5 w-5" />, hidden: !st, onSelect: () => st && run('pdf', () => downloadStatementPdf(st, settings)) },
          { key: 'share', label: 'Share statement', description: 'WhatsApp or other apps', icon: <MessageCircle className="h-5 w-5" />, hidden: !st, onSelect: () => st && run('share', async () => {
            const r = await shareStatement(st, settings);
            if (r === 'downloaded') toast.info('Statement PDF downloaded and WhatsApp opened with a summary.');
          }) },
          { key: 'csv', label: 'Download CSV', icon: <FileSpreadsheet className="h-5 w-5" />, hidden: !st, onSelect: () => st && statementCsv(st) },
          { key: 'adj', label: 'Add adjustment', description: 'Discount, write-off or correction', icon: <Scale className="h-5 w-5" />, hidden: !isOwner, onSelect: () => setAdjusting(true) },
          { key: 'arch', label: 'Archive customer', icon: <Archive className="h-5 w-5" />, hidden: !isOwner || c.status !== 'ACTIVE', onSelect: () => setConfirm('archive') },
          { key: 'react', label: 'Reactivate customer', icon: <RotateCcw className="h-5 w-5" />, hidden: !isOwner || c.status !== 'INACTIVE', onSelect: () => setConfirm('reactivate') },
          { key: 'del', label: 'Delete permanently', icon: <Trash2 className="h-5 w-5" />, tone: 'danger', hidden: !canDelete, onSelect: () => setConfirm('delete') },
        ]}
      />

      <CustomerFormModal open={editing} customer={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      {isOwner && <AdjustmentModal open={adjusting} onClose={() => setAdjusting(false)} customerId={c.customerId} customerName={c.customerName} />}
      <ConfirmDialog
        open={confirm === 'archive' || confirm === 'reactivate'}
        title={confirm === 'archive' ? 'Archive this customer?' : 'Reactivate this customer?'}
        confirmLabel={confirm === 'archive' ? 'Archive' : 'Reactivate'}
        tone={confirm === 'archive' ? 'danger' : 'primary'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await api.archiveCustomer(c.customerId, confirm === 'archive' ? 'INACTIVE' : 'ACTIVE');
            toast.success(confirm === 'archive' ? 'Customer archived' : 'Customer reactivated');
            setConfirm(null);
          } catch (e) {
            toast.error((e as ApiRequestError).message);
          }
        }}
      >
        {confirm === 'archive'
          ? <p>{c.customerName} will be hidden from customer pickers and new bills will be blocked. All history stays in the sheet, payments can still be received, and any outstanding balance ({formatINR(s.balance)}) still counts in totals. You can reactivate at any time.</p>
          : <p>{c.customerName} will appear in customer lists again and new bills can be added.</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete customer permanently?"
        confirmLabel="Delete permanently"
        requireText={c.customerName}
        onClose={() => setConfirm(null)}
        onConfirm={async (text) => {
          try {
            await api.deleteCustomer(c.customerId, text);
            toast.success('Customer deleted');
            nav('/customers', { replace: true });
          } catch (e) {
            toast.error((e as ApiRequestError).message);
          }
        }}
      >
        <p>This removes the customer record and their sheet tab. It is only allowed because this customer has no transactions and no opening balance. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
