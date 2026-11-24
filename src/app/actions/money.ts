'use server';
import { z } from 'zod';
import { call, invalid, zDate, zId, zKey, zKg, zMoney, zMoneyOpt, zQty, zText } from './_call';

const paymentSchema = z.object({
  party_id: zId,
  direction: z.enum(['IN', 'OUT']),
  amount: zMoney,
  method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']),
  reference: zText(60),
  payment_date: zDate,
  notes: zText(500),
  confirm_overpayment: z.boolean().optional(),
});
export async function recordPayment(input: z.input<typeof paymentSchema>, key: string) {
  const v = paymentSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call<{ id: string; balance: string; duplicate: boolean }>('record_payment', { p: v.data, p_idempotency_key: key });
}

export async function verifyPayment(paymentId: string, approve: boolean, reason?: string) {
  return call('verify_payment', { p_payment_id: zId.parse(paymentId), p_approve: approve, p_reason: reason ?? null });
}

export async function voidPayment(paymentId: string, reason: string) {
  return call('void_payment', { p_payment_id: zId.parse(paymentId), p_reason: reason });
}

const lineSchema = z.object({ bird_size_id: z.union([zId, z.literal('')]).optional(), qty: zQty, weight_kg: zKg, rate: zMoney });
const billSchema = z.object({
  customer_id: zId, bill_date: zDate, notes: zText(500),
  final_amount: zMoneyOpt, adjustment_reason: zText(300),
  items: z.array(lineSchema).min(1).max(20),
});
export async function createDirectBill(input: z.input<typeof billSchema>, key: string) {
  const v = billSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call<{ id: string; bill_no: string; final_amount: string; balance: string }>('create_direct_bill', { p: v.data, p_idempotency_key: key });
}

export async function voidBill(billId: string, reason: string) {
  return call('void_bill', { p_bill_id: zId.parse(billId), p_reason: reason });
}

export async function correctBill(billId: string, items: { bill_item_id: string; weight_kg: string; rate: string }[], finalAmount: string | null, reason: string) {
  const v = z.array(z.object({ bill_item_id: zId, weight_kg: zKg, rate: zMoney })).safeParse(items);
  if (!v.success) return invalid(v.error);
  return call('correct_bill', { p_bill_id: zId.parse(billId), p_items: v.data, p_final_amount: finalAmount || null, p_reason: reason });
}

const purchaseSchema = z.object({
  supplier_id: zId, purchase_date: zDate, trip_id: z.union([zId, z.literal('')]).optional(), vehicle_ref: zText(60), notes: zText(500),
  final_amount: zMoneyOpt, adjustment_reason: zText(300),
  items: z.array(z.object({ bird_size_id: zId, qty: zQty, weight_kg: zKg, rate: zMoney })).min(1).max(20),
});
export async function createPurchase(input: z.input<typeof purchaseSchema>, key: string) {
  const v = purchaseSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call<{ id: string; purchase_no: string; final_amount: string; balance: string }>('create_purchase', { p: v.data, p_idempotency_key: key });
}

export async function voidPurchase(id: string, reason: string) {
  return call('void_purchase', { p_purchase_id: zId.parse(id), p_reason: reason });
}

const expenseSchema = z.object({
  expense_date: zDate, category_id: zId, amount: zMoney, trip_id: z.union([zId, z.literal('')]).optional(), note: zText(500),
  confirm_duplicate: z.boolean().optional(),
});
export async function createExpense(input: z.input<typeof expenseSchema>, key: string) {
  const v = expenseSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call('create_expense', { p: v.data, p_idempotency_key: key });
}

export async function voidExpense(id: string, reason: string) {
  return call('void_expense', { p_expense_id: zId.parse(id), p_reason: reason });
}
