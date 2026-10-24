import { z } from 'zod';
import { parseScaled } from '@/utils/money';
import { todayIST } from '@/utils/dates';

/**
 * Client-side validation mirrors the backend rules for fast feedback.
 * The backend re-validates everything — these schemas are a convenience,
 * not a security boundary.
 */

const decimal = (label: string, decimals: number, opts: { positive?: boolean; allowNegative?: boolean; allowZero?: boolean; max?: number } = {}) =>
  z.string().trim().min(1, `${label} is required`).superRefine((v, ctx) => {
    const n = parseScaled(v, decimals, opts.allowNegative);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `Enter a valid ${label.toLowerCase()} (max ${decimals} decimal places)` });
      return;
    }
    if (opts.positive && n <= 0) ctx.addIssue({ code: 'custom', message: `${label} must be greater than zero` });
    if (opts.max !== undefined && Math.abs(n) > opts.max * 10 ** decimals) ctx.addIssue({ code: 'custom', message: `${label} is too large` });
  });

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date').refine((d) => d <= todayIST(), 'Date cannot be in the future');

export const phoneSchema = z.string().trim().min(1, 'Mobile number is required').refine((v) => {
  const digits = v.replace(/\D/g, '');
  if (v.startsWith('+')) return digits.length >= 8 && digits.length <= 15;
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('0')) || (digits.length === 12 && digits.startsWith('91'));
}, 'Enter a 10-digit mobile number (or include the country code with +)');

export const customerSchema = z.object({
  customerName: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  phone: phoneSchema,
  address: z.string().trim().max(200, 'Address is too long').optional().default(''),
  notes: z.string().trim().max(500, 'Notes are too long').optional().default(''),
  openingBalance: z.string().trim().optional().default('').refine((v) => v === '' || parseScaled(v, 2, true) !== null, 'Enter a valid amount (use - for an advance)'),
});
export type CustomerFormValues = z.input<typeof customerSchema>;

export const billSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  transactionDate: businessDate,
  birdCount: z.string().trim().regex(/^\d+$/, 'Enter a whole number of birds (0 or more)').refine((v) => Number(v) <= 1000000, 'Too many birds'),
  weightKg: decimal('Weight', 3, { positive: true, max: 1000000 }),
  ratePerKg: decimal('Rate', 2, { max: 100000 }),
  notes: z.string().trim().max(500, 'Notes are too long').optional().default(''),
});
export type BillFormValues = z.input<typeof billSchema>;

export const paymentSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  transactionDate: businessDate,
  amount: decimal('Amount', 2, { positive: true, max: 1000000000 }),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER']),
  referenceNumber: z.string().trim().max(60, 'Reference is too long').optional().default(''),
  notes: z.string().trim().max(500, 'Notes are too long').optional().default(''),
});
export type PaymentFormValues = z.input<typeof paymentSchema>;

export const adjustmentSchema = z.object({
  transactionDate: businessDate,
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: decimal('Amount', 2, { positive: true, max: 1000000000 }),
  notes: z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(500),
});
export type AdjustmentFormValues = z.input<typeof adjustmentSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});
