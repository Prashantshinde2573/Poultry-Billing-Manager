import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Transaction } from '@/types/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { adjustmentSchema, billSchema, paymentSchema } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError } from '@/services/api/client';
import { useToast } from '@/context/ToastContext';
import { formatINR, previewBillAmount } from '@/utils/money';
import { todayIST } from '@/utils/dates';
import { PAYMENT_METHOD_LABELS } from '@/utils/labels';

const billEdit = billSchema.omit({ customerId: true });
const payEdit = paymentSchema.omit({ customerId: true });

interface Props {
  transaction: Transaction;
  onClose: () => void;
  onSaved: (t: Transaction) => void;
}

export function EditTransactionModal({ transaction: t, onClose, onSaved }: Props) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [overpay, setOverpay] = useState<string | null>(null);
  const schema = t.transactionType === 'BILL' ? billEdit : t.transactionType === 'PAYMENT' ? payEdit : adjustmentSchema;
  const { register, handleSubmit, watch, formState, setError: setFieldError } = useForm<Record<string, string>>({
    resolver: zodResolver(schema as never),
    defaultValues: {
      transactionDate: t.transactionDate,
      notes: t.notes,
      birdCount: String(t.birdCount ?? 0),
      weightKg: String(t.weightKg ?? ''),
      ratePerKg: String(t.ratePerKg ?? ''),
      amount: String(t.amount),
      paymentMethod: t.paymentMethod ?? 'CASH',
      referenceNumber: t.referenceNumber,
      direction: t.direction,
    },
  });
  const preview = t.transactionType === 'BILL' ? previewBillAmount(watch('weightKg') ?? '', watch('ratePerKg') ?? '') : null;

  const submit = async (v: Record<string, string>, confirmOverpayment = false) => {
    setError(null);
    const payload: Record<string, unknown> = {
      customerId: t.customerId, transactionId: t.transactionId, expectedVersion: t.version,
      transactionDate: v.transactionDate, notes: v.notes ?? '',
    };
    if (t.transactionType === 'BILL') Object.assign(payload, { birdCount: v.birdCount, weightKg: v.weightKg, ratePerKg: v.ratePerKg });
    if (t.transactionType === 'PAYMENT') Object.assign(payload, { amount: v.amount, paymentMethod: v.paymentMethod, referenceNumber: v.referenceNumber ?? '', confirmOverpayment });
    if (t.transactionType === 'ADJUSTMENT') Object.assign(payload, { amount: v.amount, direction: v.direction });
    try {
      const r = await api.updateTransaction(payload as never);
      toast.success(`Transaction updated. Balance is now ${formatINR(r.customerBalance)}.`);
      onSaved(r.transaction);
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.code === 'OVERPAYMENT_CONFIRMATION_REQUIRED') { setOverpay(err.message); return; }
      if (err.code === 'CONFLICT') { setError('Someone else changed this transaction after you opened it. Close this window and refresh to see the latest version.'); return; }
      if (err.field && err.code === 'VALIDATION_ERROR') setFieldError(err.field, { message: err.message });
      setError(err.message);
    }
  };

  const e = formState.errors;
  return (
    <Modal
      open
      onClose={onClose}
      locked={formState.isSubmitting}
      title={`Edit ${t.transactionType.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formState.isSubmitting}>Cancel</Button>
          {overpay
            ? <Button variant="danger" loading={formState.isSubmitting} onClick={handleSubmit((v) => submit(v, true))}>Confirm advance & save</Button>
            : <Button loading={formState.isSubmitting} onClick={handleSubmit((v) => submit(v))}>Save changes</Button>}
        </>
      }
    >
      <form className="space-y-4" onSubmit={(ev) => ev.preventDefault()} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {overpay && <Alert tone="warning">{overpay}</Alert>}
        <TextField label="Date" type="date" max={todayIST()} {...register('transactionDate')} error={e.transactionDate?.message} />
        {t.transactionType === 'BILL' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <TextField label="Birds" inputMode="numeric" {...register('birdCount')} error={e.birdCount?.message} />
              <TextField label="Weight" inputMode="decimal" suffix="kg" {...register('weightKg')} error={e.weightKg?.message} />
              <TextField label="Rate" inputMode="decimal" prefix="₹" {...register('ratePerKg')} error={e.ratePerKg?.message} />
            </div>
            <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-sm">New bill amount: <b className="tabular">{preview === null ? '—' : formatINR(preview)}</b> <span className="text-ink-muted">(was {formatINR(t.billAmount)})</span></div>
          </>
        )}
        {t.transactionType === 'PAYMENT' && (
          <>
            <TextField label="Amount received" inputMode="decimal" prefix="₹" {...register('amount')} error={e.amount?.message} />
            <SelectField label="Method" {...register('paymentMethod')}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <TextField label="Reference number" {...register('referenceNumber')} error={e.referenceNumber?.message} />
          </>
        )}
        {t.transactionType === 'ADJUSTMENT' && (
          <>
            <SelectField label="Type" {...register('direction')}>
              <option value="DEBIT">Debit — increases what the customer owes</option>
              <option value="CREDIT">Credit — reduces what the customer owes</option>
            </SelectField>
            <TextField label="Amount" inputMode="decimal" prefix="₹" {...register('amount')} error={e.amount?.message} />
          </>
        )}
        <TextAreaField label={t.transactionType === 'ADJUSTMENT' ? 'Reason' : 'Notes'} {...register('notes')} error={e.notes?.message} />
        <p className="text-xs text-ink-muted">The change is recorded in the audit log and all balances are recalculated from the full history.</p>
      </form>
    </Modal>
  );
}
