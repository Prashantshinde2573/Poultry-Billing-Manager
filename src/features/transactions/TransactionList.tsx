import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Ban, Scale } from 'lucide-react';
import type { Transaction } from '@/types/api';
import { TxnTypeBadge } from '@/components/ui/Badge';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate } from '@/utils/dates';
import { methodLabel } from '@/utils/labels';
import { TransactionDetailModal } from './TransactionDetailModal';

interface Props {
  transactions: Transaction[];
  showCustomer?: boolean;
  showRunningBalance?: boolean;
  compact?: boolean;
}

function details(t: Transaction) {
  if (t.transactionType === 'BILL') return `${formatNumber(t.birdCount)} birds · ${formatNumber(t.weightKg)} kg × ${formatINR(t.ratePerKg)}`;
  if (t.transactionType === 'PAYMENT') return [methodLabel(t.paymentMethod), t.referenceNumber].filter(Boolean).join(' · ');
  return t.direction === 'DEBIT' ? 'Debit adjustment' : 'Credit adjustment';
}

function Amount({ t }: { t: Transaction }) {
  const voided = t.status === 'VOID';
  const isCredit = t.transactionType === 'PAYMENT' || (t.transactionType === 'ADJUSTMENT' && t.direction === 'CREDIT');
  return (
    <span className={`tabular font-semibold ${voided ? 'text-ink-muted line-through' : isCredit ? 'text-success' : 'text-ink'}`}>
      {isCredit ? '− ' : '+ '}{formatINR(t.amount)}
    </span>
  );
}

/** Bills, payments and adjustments: a table on desktop, cards on phones. Tap a row for details/edit/void. */
export function TransactionList({ transactions, showCustomer, showRunningBalance, compact }: Props) {
  const [selected, setSelected] = useState<Transaction | null>(null);
  return (
    <>
      {/* phone rows (payment-app style history) */}
      <ul className="-mx-1 md:hidden">
        {transactions.map((t) => {
          const voided = t.status === 'VOID';
          const credit = t.transactionType === 'PAYMENT' || (t.transactionType === 'ADJUSTMENT' && t.direction === 'CREDIT');
          const icon = voided ? <Ban className="h-5 w-5" /> : t.transactionType === 'ADJUSTMENT' ? <Scale className="h-5 w-5" /> : credit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />;
          const tone = voided ? 'bg-slate-100 text-slate-500' : t.transactionType === 'ADJUSTMENT' ? 'bg-violet-50 text-violet-700' : credit ? 'bg-green-50 text-success' : 'bg-amber-50 text-amber-700';
          const title = showCustomer && t.customerName ? t.customerName : t.transactionType === 'BILL' ? 'Bill' : t.transactionType === 'PAYMENT' ? 'Payment received' : 'Adjustment';
          return (
            <li key={t.transactionId}>
              <button type="button" onClick={() => setSelected(t)} className={`press flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left active:bg-slate-50 ${voided ? 'opacity-60' : ''}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{title}</p>
                  <p className="truncate text-xs text-ink-muted">{formatDate(t.transactionDate)} · {details(t)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Amount t={t} />
                  {voided ? <p className="text-[11px] font-medium text-ink-muted">VOID</p>
                    : showRunningBalance && t.runningBalance !== undefined ? <p className="tabular text-[11px] text-ink-muted">Bal {formatINR(t.runningBalance)}</p>
                    : <p className="text-[11px] text-ink-muted">{t.transactionType === 'BILL' ? 'Bill' : t.transactionType === 'PAYMENT' ? 'Received' : 'Adjust'}</p>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {/* desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              {showCustomer && <th className="py-2 pr-3 font-medium">Customer</th>}
              <th className="py-2 pr-3 font-medium">Details</th>
              {!compact && <th className="py-2 pr-3 font-medium">Notes</th>}
              <th className="py-2 pr-3 text-right font-medium">Amount</th>
              {showRunningBalance && <th className="py-2 pr-1 text-right font-medium">Balance</th>}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transactionId} onClick={() => setSelected(t)} className={`cursor-pointer border-b border-line/70 last:border-0 hover:bg-slate-50 ${t.status === 'VOID' ? 'opacity-60' : ''}`}>
                <td className="whitespace-nowrap py-2.5 pr-3">{formatDate(t.transactionDate)}</td>
                <td className="py-2.5 pr-3"><TxnTypeBadge type={t.transactionType} voided={t.status === 'VOID'} /></td>
                {showCustomer && <td className="max-w-[180px] truncate py-2.5 pr-3 font-medium">{t.customerName}</td>}
                <td className="py-2.5 pr-3 text-ink-muted">{details(t)}</td>
                {!compact && <td className="max-w-[200px] truncate py-2.5 pr-3 text-ink-muted">{t.status === 'VOID' ? `Void: ${t.voidReason}` : t.notes}</td>}
                <td className="whitespace-nowrap py-2.5 pr-3 text-right"><Amount t={t} /></td>
                {showRunningBalance && <td className="tabular whitespace-nowrap py-2.5 pr-1 text-right">{t.runningBalance !== undefined ? formatINR(t.runningBalance) : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TransactionDetailModal transaction={selected} onClose={() => setSelected(null)} />
    </>
  );
}
