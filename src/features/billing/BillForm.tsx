import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator, CheckCircle2, Eye, Plus, MessageCircle } from 'lucide-react';
import type { Customer, WriteResult } from '@/types/api';
import { billSchema, type BillFormValues } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError, newRequestId } from '@/services/api/client';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { CustomerPicker } from '@/components/CustomerPicker';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { BalanceText } from '@/components/ui/Money';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { TransactionDetailModal } from '@/features/transactions/TransactionDetailModal';
import { shareTransactionReceipt } from '@/features/transactions/receipt';
import { formatINR, formatNumber, previewBillAmount } from '@/utils/money';
import { formatDate, todayIST } from '@/utils/dates';

interface Props {
  customers: Customer[];
  customersLoading: boolean;
  initialCustomerId?: string;
}

export function BillForm({ customers, customersLoading, initialCustomerId }: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const [requestId, setRequestId] = useState(newRequestId);
  const [saved, setSaved] = useState<(WriteResult & { customerName: string }) | null>(null);
  const [viewing, setViewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const defaults = useMemo<BillFormValues>(() => ({
    customerId: initialCustomerId ?? '', transactionDate: todayIST(), birdCount: '', weightKg: '',
    ratePerKg: settings.defaultRatePerKg === '' ? '' : String(settings.defaultRatePerKg), notes: '',
  }), [initialCustomerId, settings.defaultRatePerKg]);

  const { register, handleSubmit, watch, setValue, reset, formState, setError: setFieldError, getValues } = useForm<BillFormValues>({ resolver: zodResolver(billSchema), defaultValues: defaults });

  useEffect(() => {
    if (!getValues('ratePerKg') && settings.defaultRatePerKg !== '') setValue('ratePerKg', String(settings.defaultRatePerKg));
  }, [settings.defaultRatePerKg, getValues, setValue]);

  const customerId = watch('customerId');
  const amount = previewBillAmount(watch('weightKg') ?? '', watch('ratePerKg') ?? '');
  const customer = customers.find((c) => c.customerId === customerId);

  const onSubmit = async (v: BillFormValues) => {
    setError(null);
    try {
      const r = await api.createBill({
        customerId: v.customerId, transactionDate: v.transactionDate, birdCount: v.birdCount, weightKg: v.weightKg, ratePerKg: v.ratePerKg, notes: v.notes,
      }, requestId);
      setSaved({ ...r, customerName: customer?.customerName ?? '' });
      toast.success(r.duplicateRequest ? 'This bill was already saved.' : `Bill saved: ${formatINR(r.transaction.billAmount)}`);
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.field && err.code === 'VALIDATION_ERROR') setFieldError(err.field as keyof BillFormValues, { message: err.message });
      setError(err.message);
    }
  };

  const addAnother = () => {
    const keep = getValues();
    reset({ ...defaults, customerId: '', transactionDate: keep.transactionDate, ratePerKg: keep.ratePerKg });
    setRequestId(newRequestId());
    setSaved(null);
    setError(null);
    window.scrollTo({ top: 0 });
  };

  if (saved) {
    const t = saved.transaction;
    return (
      <div className="card mx-auto max-w-xl rounded-2xl p-5 text-center sm:p-6">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-2 text-xl font-bold">Bill saved</h2>
        <p className="text-sm text-ink-muted">Saved to {saved.customerName}’s sheet in Google Sheets.</p>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Customer</span><b>{saved.customerName}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Date</span><span>{formatDate(t.transactionDate)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Birds · Weight</span><span>{formatNumber(t.birdCount)} · {formatNumber(t.weightKg)} kg</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Rate</span><span>{formatINR(t.ratePerKg)}/kg</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-base"><span>Bill amount</span><b className="tabular">{formatINR(t.billAmount)}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Customer balance now</span><BalanceText value={saved.customerBalance} /></div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setViewing(true)}>View Bill</Button>
          <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} loading={sharing} onClick={async () => {
            setSharing(true);
            try {
              const r = await shareTransactionReceipt(t, settings, 'wa');
              if (r === 'downloaded') toast.info('Bill PDF downloaded; WhatsApp opened with a summary.');
            } catch (e) { toast.error((e as ApiRequestError).message); } finally { setSharing(false); }
          }}>Share</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={addAnother}>Add Another Bill</Button>
        </div>
        <TransactionDetailModal transaction={viewing ? { ...t, customerName: saved.customerName } : null} onClose={() => setViewing(false)} />
      </div>
    );
  }

  const e = formState.errors;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4 md:rounded-xl md:border md:border-line md:bg-white md:p-6" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <CustomerPicker customers={customers} loading={customersLoading} value={customerId} onChange={(id) => setValue('customerId', id, { shouldValidate: true })} error={e.customerId?.message} onAddNew={() => setAdding(true)} />
      {customer?.summary && <p className="-mt-2 text-xs text-ink-muted">Current balance: <BalanceText value={customer.summary.balance} className="text-xs" /></p>}
      <TextField label="Date" type="date" max={todayIST()} {...register('transactionDate')} error={e.transactionDate?.message} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Number of birds" inputMode="numeric" placeholder="0" autoComplete="off" {...register('birdCount')} error={e.birdCount?.message} />
        <TextField label="Total weight" inputMode="decimal" placeholder="0.000" suffix="kg" autoComplete="off" {...register('weightKg')} error={e.weightKg?.message} />
      </div>
      <TextField label="Rate per kg" inputMode="decimal" placeholder="0.00" prefix="₹" autoComplete="off" {...register('ratePerKg')} error={e.ratePerKg?.message} hint={settings.defaultRatePerKg !== '' ? `Default rate from Settings: ${formatINR(Number(settings.defaultRatePerKg))}` : undefined} />
      <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-primary-soft px-4 py-3" aria-live="polite">
        <span className="flex items-center gap-2 text-sm font-medium text-teal-900"><Calculator className="h-4 w-4" /> Bill amount</span>
        <span className="tabular text-2xl font-bold text-teal-900">{amount === null ? '—' : formatINR(amount)}</span>
      </div>
      <p className="-mt-2 text-xs text-ink-muted">Weight × rate, rounded to the nearest paisa. The server recalculates and saves exactly this amount.</p>
      <TextAreaField label="Notes (optional)" {...register('notes')} error={e.notes?.message} />
      <div className="h-20 md:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:static md:border-0 md:p-0">
        <Button type="submit" size="lg" block loading={formState.isSubmitting} disabled={formState.isSubmitting}>
          Save Bill{amount !== null && amount > 0 ? ` · ${formatINR(amount)}` : ''}
        </Button>
      </div>
      <CustomerFormModal open={adding} onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); setValue('customerId', c.customerId, { shouldValidate: true }); }} />
    </form>
  );
}
