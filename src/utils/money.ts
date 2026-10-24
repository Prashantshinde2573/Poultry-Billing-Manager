/**
 * Money helpers. Amounts are converted to integer paise (and weights to
 * integer grams) before any arithmetic, mirroring the backend exactly, so
 * the preview the user sees always equals what the server saves.
 */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const num2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,25,000.00 */
export function formatINR(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  return inr.format(Object.is(v, -0) ? 0 : v);
}

/** ₹1,25,000 (for chart axes) */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return '₹' + (value / 1e7).toFixed(abs >= 1e8 ? 0 : 1) + ' Cr';
  if (abs >= 1e5) return '₹' + (value / 1e5).toFixed(abs >= 1e6 ? 0 : 1) + ' L';
  if (abs >= 1e3) return '₹' + (value / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'k';
  return inrWhole.format(value);
}

/** Plain Indian-grouped number with 2 decimals, no symbol (for PDFs/CSV) */
export function formatAmountPlain(value: number): string {
  return num2.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return num.format(Number(value ?? 0));
}

export function formatKg(value: number | null | undefined): string {
  return num.format(Number(value ?? 0)) + ' kg';
}

/**
 * Parses a decimal string into an integer scaled by 10^decimals.
 * Returns null if invalid or if it has too many decimal places.
 * parseScaled('135.8', 3) → 135800
 */
export function parseScaled(input: string | number, decimals: number, allowNegative = false): number | null {
  const s = String(input ?? '').trim().replace(/,/g, '');
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  if (m[1] && !allowNegative) return null;
  let frac = (m[3] ?? '').replace(/0+$/, '');
  if (frac.length > decimals) return null;
  frac = frac.padEnd(decimals, '0');
  const intPart = m[2].replace(/^0+(?=\d)/, '');
  if (intPart.length > 12) return null;
  const n = parseInt(intPart + frac, 10);
  return m[1] ? -n : n;
}

/** Same formula as the backend: round half-up(grams × paisePerKg ÷ 1000). */
export function computeBillPaise(grams: number, ratePaise: number): number {
  return Math.floor((grams * ratePaise + 500) / 1000);
}

/** Bill preview from raw form strings; null when inputs are not valid yet. */
export function previewBillAmount(weightKg: string, ratePerKg: string): number | null {
  const g = parseScaled(weightKg, 3);
  const r = parseScaled(ratePerKg, 2);
  if (g === null || r === null) return null;
  return computeBillPaise(g, r) / 100;
}

export function balanceLabel(balance: number): { text: string; tone: 'due' | 'advance' | 'clear' } {
  if (balance > 0.004) return { text: 'Due', tone: 'due' };
  if (balance < -0.004) return { text: 'Advance', tone: 'advance' };
  return { text: 'Settled', tone: 'clear' };
}
