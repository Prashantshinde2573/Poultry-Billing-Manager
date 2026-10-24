import type { Transaction } from '@/types/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { api } from '@/services/api/endpoints';
import { ApiRequestError } from '@/services/api/client';
import { formatINR } from '@/utils/money';
import { formatDate } from '@/utils/dates';
import { TXN_TYPE_LABELS } from '@/utils/labels';

export function VoidTransactionDialog({ open, transaction: t, onClose, onVoided }: { open: boolean; transaction: Transaction; onClose: () => void; onVoided: () => void }) {
  const toast = useToast();
  return (
    <ConfirmDialog
      open={open}
      title="Void this transaction?"
      confirmLabel="Void transaction"
      inputLabel="Reason (required)"
      inputPlaceholder="e.g. Entered twice by mistake"
      minInputLength={3}
      onClose={onClose}
      onConfirm={async (reason) => {
        try {
          const r = await api.voidTransaction({ customerId: t.customerId, transactionId: t.transactionId, expectedVersion: t.version, reason });
          toast.success(`Transaction voided. New balance: ${formatINR(r.customerBalance)}`);
          onVoided();
        } catch (e) {
          toast.error((e as ApiRequestError).message);
        }
      }}
    >
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm">
        {t.customerName && <><dt className="text-ink-muted">Customer</dt><dd className="font-medium">{t.customerName}</dd></>}
        <dt className="text-ink-muted">Date</dt><dd className="font-medium">{formatDate(t.transactionDate)}</dd>
        <dt className="text-ink-muted">Type</dt><dd className="font-medium">{TXN_TYPE_LABELS[t.transactionType]}</dd>
        <dt className="text-ink-muted">Amount</dt><dd className="font-medium">{formatINR(t.amount)}</dd>
      </dl>
      <p className="text-sm text-ink-muted">The account balance will be recalculated without this entry. The record stays in the Google Sheet marked <b>VOID</b> for the audit trail and cannot be edited afterwards.</p>
    </ConfirmDialog>
  );
}
