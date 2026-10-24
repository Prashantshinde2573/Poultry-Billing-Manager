import { describe, expect, it } from 'vitest';
import { formatDateShort, todayIST } from '../../src/utils/dates';
import { whatsappUrl } from '../../src/utils/whatsapp';
import { billSchema, customerSchema, paymentSchema } from '../../src/validation/schemas';

describe('dates', () => {
  it('uses Asia/Kolkata for the business date', () => {
    // 20:00 UTC on 24 Oct is 01:30 IST on 25 Oct
    expect(todayIST(new Date('2026-10-24T20:00:00Z'))).toBe('2026-10-25');
    expect(todayIST(new Date('2026-10-24T18:00:00Z'))).toBe('2026-10-24');
    expect(formatDateShort('2026-10-04')).toBe('04/10/2026');
  });
});

describe('whatsapp', () => {
  it('builds click-to-chat links with encoded text', () => {
    expect(whatsappUrl('+91 98765 43210', 'Balance: ₹1,000 & thanks')).toBe('https://wa.me/919876543210?text=Balance%3A%20%E2%82%B91%2C000%20%26%20thanks');
    expect(whatsappUrl(null, 'hi')).toBe('https://wa.me/?text=hi');
  });
});

describe('form validation', () => {
  const bill = { customerId: 'C0001', transactionDate: '2020-01-01', birdCount: '100', weightKg: '135.8', ratePerKg: '114', notes: '' };
  it('accepts a valid bill and rejects bad numbers', () => {
    expect(billSchema.safeParse(bill).success).toBe(true);
    expect(billSchema.safeParse({ ...bill, birdCount: '1.5' }).success).toBe(false);
    expect(billSchema.safeParse({ ...bill, weightKg: '0' }).success).toBe(false);
    expect(billSchema.safeParse({ ...bill, weightKg: '1.2345' }).success).toBe(false);
    expect(billSchema.safeParse({ ...bill, transactionDate: '2999-01-01' }).success).toBe(false);
  });
  it('validates payments and customers', () => {
    expect(paymentSchema.safeParse({ customerId: 'C0001', transactionDate: '2020-01-01', amount: '0', paymentMethod: 'CASH' }).success).toBe(false);
    expect(paymentSchema.safeParse({ customerId: 'C0001', transactionDate: '2020-01-01', amount: '500.50', paymentMethod: 'UPI' }).success).toBe(true);
    expect(customerSchema.safeParse({ customerName: 'Rahul', phone: '98765 43210' }).success).toBe(true);
    expect(customerSchema.safeParse({ customerName: 'Rahul', phone: '12345' }).success).toBe(false);
    expect(customerSchema.safeParse({ customerName: 'Rahul', phone: '9876543210', openingBalance: '-2500' }).success).toBe(true);
  });
});
