import type { SessionUser, Transaction } from '@/types/api';
import { todayIST } from '@/utils/dates';

/** Mirrors the backend rule (Transactions.gs → canEditTxn). The server enforces it. */
export function canEditTransaction(user: SessionUser | null, t: Transaction): boolean {
  if (!user || t.status === 'VOID') return false;
  if (user.role === 'OWNER') return true;
  return t.transactionType !== 'ADJUSTMENT' && t.createdBy === user.username && todayIST(new Date(t.createdAt)) === todayIST();
}

export function canVoidTransaction(user: SessionUser | null, t: Transaction): boolean {
  return !!user && user.role === 'OWNER' && t.status !== 'VOID';
}
