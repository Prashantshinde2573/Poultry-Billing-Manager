import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Download, MessageCircle, Plus } from 'lucide-react';
import type { Customer, WriteResult } from '@/types/api';
import { paymentSchema, type PaymentFormValues } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError, newRequestId } from '@/services/api/client';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { CustomerPicker } from '@/components/CustomerPicker';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { BalanceText } from '@/components/ui/Money';
import { shareTransactionReceipt } from '@/features/transactions/receipt';
import { formatINR, parseScaled } from '@/utils/money';
import { formatDate, todayIST } from '@/utils/dates';
import { methodLabel, PAYMENT_METHOD_LABELS } from '@/utils/labels';
import type { PaymentMethod } from '@/types/api';

interface Props {
  customers: Customer[];
  customersLoading: boolean;
  initialCustomerId?: string;
}

export function PaymentForm({ customers, customersLoading, initialCustomerId }: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const [requestId, setRequestId] = useState(newRequestId);
  const [saved, setSaved] = useState<(WriteResult & { customerName: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overpay, setOverpay] = useState<{ message: string; outstanding: number; excess: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const defaults = useMemo<PaymentFormValues>(() => ({
    customerId: initialCustomerId ?? '', transactionDate: todayIST(), amount: '', paymentMethod: 'CASH', referenceNumber: '', notes: '',
  }), [initialCustomerId]);
  const { register, handleSubmit, watch, setValue, reset, formState, setError: setFieldError, getValues } = useForm<PaymentFormValues>({ resolver: zodResolver(paymentSchema), defaultValues: defaults });

  const customerId = watch('customerId');
  const method = watch('paymentMethod') as PaymentMethod;
  const customer = customers.find((c) => c.customerId === customerId);
  const amountPaise = parseScaled(watch('amount') ?? '', 2);
  const balance = customer?.summary?.balance ?? 0;
  const exceeds = customer && amountPaise !== null && amountPaise > Math.max(Math.round(balance * 100), 0);

  const submit = async (v: PaymentFormValues, confirmOverpayment: boolean) => {
    setError(null);
    try {
      const r = await api.createPayment({ customerId: v.customerId, transactionDate: v.transactionDate, amount: v.amount, paymentMethod: v.paymentMethod as PaymentMethod, referenceNumber: v.referenceNumber, notes: v.notes, confirmOverpayment }, requestId);
      setSaved({ ...r, customerName: customer?.customerName ?? '' });
      setOverpay(null);
      toast.success(r.duplicateRequest ? 'This payment was already recorded.' : `Payment of ${formatINR(r.transaction.paymentAmount)} recorded`);
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.code === 'OVERPAYMENT_CONFIRMATION_REQUIRED') {
        setOverpay({ message: err.message, outstanding: Number(err.details?.outstanding ?? 0), excess: Number(err.details?.excess ?? 0) });
        return;
      }
      if (err.field && err.code === 'VALIDATION_ERROR') setFieldError(err.field as keyof PaymentFormValues, { message: err.message });
      setError(err.message);
    }
  };

  const another = () => {
    reset({ ...defaults, customerId: '', transactionDate: getValues('transactionDate') });
    setRequestId(newRequestId());
    setSaved(null);
    setError(null);
  };

  const receipt = async (mode: 'pdf' | 'wa') => {
    if (!saved) return;
    setBusy(mode);
    try {
      const r = await shareTransactionReceipt(saved.transaction, settings, mode);
      if (r === 'downloaded' && mode === 'wa') toast.info('Receipt PDF downloaded; WhatsApp opened with a summary.');
    } catch (e) {
      toast.error((e as ApiRequestError).message);
    } finally {
      setBusy(null);
    }
  };

  if (saved) {
    const t = saved.transaction;
    return (
      <div className="card mx-auto max-w-xl rounded-2xl p-5 text-center sm:p-6">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-2 text-xl font-bold">Payment recorded</h2>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Customer</span><b>{saved.customerName}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Date</span><span>{formatDate(t.transactionDate)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Method</span><span>{methodLabel(t.paymentMethod)}{t.referenceNumber && ` · ${t.referenceNumber}`}</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-base"><span>Amount received</span><b className="tabular text-success">{formatINR(t.paymentAmount)}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-muted">Balance now</span><BalanceText value={saved.customerBalance} /></div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'pdf'} onClick={() => receipt('pdf')}>Receipt PDF</Button>
          <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} loading={busy === 'wa'} onClick={() => receipt('wa')}>Share</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={another}>New Payment</Button>
        </div>
      </div>
    );
  }

  const e = formState.errors;
  return (
    <form onSubmit={handleSubmit((v) => submit(v, false))} className="mx-auto max-w-xl space-y-4 md:rounded-xl md:border md:border-line md:bg-white md:p-6" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <CustomerPicker customers={customers} loading={customersLoading} value={customerId} onChange={(id) => { setValue('customerId', id, { shouldValidate: true }); setOverpay(null); }} error={e.customerId?.message} includeInactive />
      {customer?.summary && (
        <div className="-mt-1 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-ink-muted">Outstanding now</span>
          <span className="flex items-center gap-2">
            <BalanceText value={balance} />
            {balance > 0 && <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setValue('amount', balance.toFixed(2), { shouldValidate: true })}>Pay full</button>}
          </span>
        </div>
      )}
      <TextField label="Date" type="date" max={todayIST()} {...register('transactionDate')} error={e.transactionDate?.message} />
      <div className={`rounded-2xl bg-white px-4 py-5 text-center ring-1 focus-within:ring-2 ${e.amount ? 'ring-danger' : 'ring-line focus-within:ring-primary'}`}>
        <label htmlFor="pay-amount" className="text-sm font-medium text-ink-muted">Amount received</label>
        <div className="mt-1 flex items-center justify-center">
          <span className="text-3xl font-bold text-ink-muted">₹</span>
          <input
            id="pay-amount"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            aria-invalid={!!e.amount || undefined}
            className="tabular w-full max-w-[14ch] bg-transparent text-center text-[40px] font-bold leading-tight outline-none placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
            {...register('amount', { onChange: () => setOverpay(null) })}
          />
        </div>
        {e.amount && <p className="field-error">{e.amount.message}</p>}
      </div>
      {exceeds && !overpay && <p className="-mt-2 text-sm text-warning">This is more than the outstanding balance ({formatINR(balance)}).</p>}
      <fieldset>
        <legend className="field-label">Payment method</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <label key={m} className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium ${method === m ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-white text-ink-muted'}`}>
              <input type="radio" value={m} className="sr-only" {...register('paymentMethod')} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Reference number (optional)" placeholder="UPI / bank reference" {...register('referenceNumber')} error={e.referenceNumber?.message} />
      <TextAreaField label="Notes (optional)" {...register('notes')} error={e.notes?.message} />
      {overpay ? (
        <div className="space-y-3">
          <Alert tone="warning">
            {overpay.message}<br />
            Outstanding: <b>{formatINR(overpay.outstanding)}</b> · Extra to hold as advance: <b>{formatINR(overpay.excess)}</b>
          </Alert>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => setOverpay(null)}>Change amount</Button>
            <Button variant="danger" loading={formState.isSubmitting} onClick={handleSubmit((v) => submit(v, true))}>Confirm & record advance</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="h-20 md:hidden" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:static md:border-0 md:p-0">
            <Button type="submit" size="lg" variant="success" block loading={formState.isSubmitting}>Record Payment</Button>
          </div>
        </>
      )}
    </form>
  );
}
