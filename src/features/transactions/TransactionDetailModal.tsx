import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Download, MessageCircle, Pencil } from 'lucide-react';
import type { Transaction } from '@/types/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TxnTypeBadge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Feedback';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { ApiRequestError } from '@/services/api/client';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/dates';
import { methodLabel } from '@/utils/labels';
import { canEditTransaction, canVoidTransaction } from './permissions';
import { EditTransactionModal } from './EditTransactionModal';
import { VoidTransactionDialog } from './VoidTransactionDialog';
import { shareTransactionReceipt } from './receipt';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function TransactionDetailModal({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [t, setT] = useState<Transaction | null>(transaction);
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'wa' | null>(null);

  useEffect(() => setT(transaction), [transaction]);
  if (!t) return null;

  const receipt = async (mode: 'pdf' | 'wa') => {
    setBusy(mode);
    try {
      const r = await shareTransactionReceipt(t, settings, mode);
      if (r === 'downloaded' && mode === 'wa') toast.info('Receipt PDF downloaded. WhatsApp opened with a summary — attach the PDF there if needed.');
    } catch (e) {
      toast.error((e as ApiRequestError).message || 'Could not create the receipt.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal
        open={!!transaction && !editing && !voiding}
        onClose={onClose}
        title={<span className="flex items-center gap-2">Transaction <TxnTypeBadge type={t.transactionType} voided={t.status === 'VOID'} /></span>}
        footer={
          <>
            {canVoidTransaction(user, t) && <Button variant="secondary" className="text-danger" icon={<Ban className="h-4 w-4" />} onClick={() => setVoiding(true)}>Void</Button>}
            {canEditTransaction(user, t) && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>}
            {t.status !== 'VOID' && t.transactionType !== 'ADJUSTMENT' && (
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'pdf'} onClick={() => receipt('pdf')}>{t.transactionType === 'PAYMENT' ? 'Receipt' : 'Bill'} PDF</Button>
                <Button icon={<MessageCircle className="h-4 w-4" />} loading={busy === 'wa'} onClick={() => receipt('wa')}>WhatsApp</Button>
              </>
            )}
          </>
        }
      >
        {t.status === 'VOID' && <div className="mb-3"><Alert tone="warning">Voided by {t.voidedBy} on {formatDateTime(t.voidedAt)}. Reason: {t.voidReason}. It is excluded from all totals.</Alert></div>}
        <dl className="divide-y divide-line">
          {t.customerName && <Row label="Customer" value={<Link className="text-primary hover:underline" to={`/customers/${t.customerId}`} onClick={onClose}>{t.customerName}</Link>} />}
          <Row label="Date" value={formatDate(t.transactionDate)} />
          {t.transactionType === 'BILL' && (
            <>
              <Row label="Birds" value={formatNumber(t.birdCount)} />
              <Row label="Weight" value={`${formatNumber(t.weightKg)} kg`} />
              <Row label="Rate" value={`${formatINR(t.ratePerKg)} / kg`} />
              <Row label="Bill amount" value={<span className="text-base">{formatINR(t.billAmount)}</span>} />
            </>
          )}
          {t.transactionType === 'PAYMENT' && (
            <>
              <Row label="Amount received" value={<span className="text-base text-success">{formatINR(t.paymentAmount)}</span>} />
              <Row label="Method" value={methodLabel(t.paymentMethod)} />
              {t.referenceNumber && <Row label="Reference" value={t.referenceNumber} />}
            </>
          )}
          {t.transactionType === 'ADJUSTMENT' && <Row label={t.direction === 'DEBIT' ? 'Debit (adds to dues)' : 'Credit (reduces dues)'} value={formatINR(t.amount)} />}
          {t.notes && <Row label="Notes" value={<span className="whitespace-pre-wrap">{t.notes}</span>} />}
          {t.runningBalance !== undefined && <Row label="Balance after" value={formatINR(t.runningBalance)} />}
          <Row label="Entered by" value={`${t.createdBy} · ${formatDateTime(t.createdAt)}`} />
          {t.version > 1 && <Row label="Last changed" value={`${t.updatedBy} · ${formatDateTime(t.updatedAt)}`} />}
          <Row label="ID" value={<span className="font-mono text-xs">{t.transactionId}</span>} />
        </dl>
      </Modal>
      {editing && (
        <EditTransactionModal
          transaction={t}
          onClose={() => setEditing(false)}
          onSaved={(nt) => {
            setT({ ...nt, customerName: t.customerName });
            setEditing(false);
          }}
        />
      )}
      <VoidTransactionDialog
        open={voiding}
        transaction={t}
        onClose={() => setVoiding(false)}
        onVoided={() => {
          setVoiding(false);
          onClose();
        }}
      />
    </>
  );
}
