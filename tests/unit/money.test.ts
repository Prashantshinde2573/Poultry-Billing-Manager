import { describe, expect, it } from 'vitest';
import { computeBillPaise, formatINR, formatINRCompact, parseScaled, previewBillAmount } from '../../src/utils/money';

describe('money utils', () => {
  it('formats rupees in the Indian numbering system', () => {
    expect(formatINR(125000)).toBe('₹1,25,000.00');
    expect(formatINR(15481.2)).toBe('₹15,481.20');
    expect(formatINR(12345678.9)).toBe('₹1,23,45,678.90');
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatINR(-0)).toBe('₹0.00');
    expect(formatINRCompact(250000)).toBe('₹2.5 L');
  });

  it('parses decimals exactly', () => {
    expect(parseScaled('135.8', 3)).toBe(135800);
    expect(parseScaled('114', 2)).toBe(11400);
    expect(parseScaled('0.10', 2)).toBe(10);
    expect(parseScaled('1,250.50', 2)).toBe(125050);
    expect(parseScaled('12.3456', 3)).toBeNull();
    expect(parseScaled('-5', 2)).toBeNull();
    expect(parseScaled('-5', 2, true)).toBe(-500);
    expect(parseScaled('abc', 2)).toBeNull();
    expect(parseScaled('1e3', 2)).toBeNull();
    expect(parseScaled('', 2)).toBeNull();
  });

  it('matches the backend bill formula', () => {
    expect(previewBillAmount('135.8', '114')).toBe(15481.2);
    expect(previewBillAmount('0.1', '0.3')).toBe(0.03);
    expect(previewBillAmount('1.005', '1')).toBe(1.01);
    expect(previewBillAmount('', '114')).toBeNull();
    expect(computeBillPaise(135800, 11400)).toBe(1548120);
  });
});
