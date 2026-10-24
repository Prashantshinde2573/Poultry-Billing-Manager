import type { ReactNode } from 'react';
import type { TransactionType } from '@/types/api';

const tones = {
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  green: 'bg-green-50 text-green-800 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function TxnTypeBadge({ type, voided }: { type: TransactionType; voided?: boolean }) {
  if (voided) return <Badge tone="slate">Void</Badge>;
  if (type === 'BILL') return <Badge tone="amber">Bill</Badge>;
  if (type === 'PAYMENT') return <Badge tone="green">Payment</Badge>;
  return <Badge tone="violet">Adjustment</Badge>;
}

export function StatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return status === 'ACTIVE' ? <Badge tone="teal">Active</Badge> : <Badge tone="slate">Archived</Badge>;
}
