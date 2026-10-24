import type { PaymentMethod, TransactionType } from '@/types/api';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  UPI: 'UPI',
  OTHER: 'Other',
};

export const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  BILL: 'Bill',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
};

export function methodLabel(m: PaymentMethod | null | undefined): string {
  return m ? PAYMENT_METHOD_LABELS[m] ?? m : '';
}
