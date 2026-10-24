import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { adjustmentSchema, type AdjustmentFormValues } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError, newRequestId } from '@/services/api/client';
import { useToast } from '@/context/ToastContext';
import { formatINR } from '@/utils/money';
import { todayIST } from '@/utils/dates';

/** Owner-only correction entry, always with a reason, recorded in the audit log. */
export function AdjustmentModal({ open, onClose, customerId, customerName }: { open: boolean; onClose: () => void; customerId: string; customerName: string }) {
  const toast = useToast();
  const requestId = useMemo(() => newRequestId(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { transactionDate: todayIST(), direction: 'CREDIT', amount: '', notes: '' },
  });
  const submit = async (v: AdjustmentFormValues) => {
    setError(null);
    try {
      const r = await api.createAdjustment({ customerId, transactionDate: v.transactionDate, direction: v.direction, amount: v.amount, notes: v.notes }, requestId);
      toast.success(`Adjustment saved. New balance: ${formatINR(r.customerBalance)}`);
      reset();
      onClose();
    } catch (e) {
      setError((e as ApiRequestError).message);
    }
  };
  const e = formState.errors;
  return (
    <Modal open={open} onClose={onClose} locked={formState.isSubmitting} title={`Adjustment · ${customerName}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={formState.isSubmitting} onClick={handleSubmit(submit)}>Save adjustment</Button></>}>
      <form className="space-y-4" onSubmit={(ev) => ev.preventDefault()} noValidate>
        <Alert tone="info">Use adjustments only for corrections such as a discount, a weight dispute or a write-off. Normal sales and receipts should be entered as bills and payments.</Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField label="Date" type="date" max={todayIST()} {...register('transactionDate')} error={e.transactionDate?.message} />
        <SelectField label="Type" {...register('direction')}>
          <option value="CREDIT">Credit — reduces what the customer owes</option>
          <option value="DEBIT">Debit — increases what the customer owes</option>
        </SelectField>
        <TextField label="Amount" inputMode="decimal" prefix="₹" {...register('amount')} error={e.amount?.message} />
        <TextAreaField label="Reason (required)" {...register('notes')} error={e.notes?.message} />
      </form>
    </Modal>
  );
}
