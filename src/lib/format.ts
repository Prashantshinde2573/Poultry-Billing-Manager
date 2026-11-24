/** Money, weight and date formatting (Indian conventions). Pure; safe on server and client. */
export type Locale = 'mr' | 'hi' | 'en';

const tag = (l: Locale) => (l === 'en' ? 'en-IN' : `${l}-IN`);

export function inr(value: number | string | null | undefined, opts: { decimals?: boolean } = {}): string {
  const v = Number(value ?? 0);
  const f = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: opts.decimals === false ? 0 : 2,
    maximumFractionDigits: opts.decimals === false ? 0 : 2,
  });
  return f.format(Object.is(v, -0) ? 0 : v);
}

/** ₹1,25,000 without paise when the amount is whole, ₹1,25,000.50 otherwise. */
export function inrSmart(value: number | string | null | undefined): string {
  const v = Number(value ?? 0);
  return inr(v, { decimals: Math.round(v * 100) % 100 !== 0 });
}

export function num(value: number | string | null | undefined, max = 3): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: max }).format(Number(value ?? 0));
}

export function kg(value: number | string | null | undefined): string {
  return `${num(value)} kg`;
}

export function todayIST(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + '01';
}

export function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(ymd, 1 - dow);
}

export function fmtDate(ymd: string | null | undefined, locale: Locale = 'en', withYear = true): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtDateTime(iso: string | null | undefined, locale: Locale = 'en'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

/** Exact decimal parse → scaled integer (paise / grams). null when invalid. */
export function parseScaled(input: string | number, decimals: number, allowNegative = false): number | null {
  const s = String(input ?? '').trim().replace(/,/g, '');
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] && !allowNegative)) return null;
  let frac = (m[3] ?? '').replace(/0+$/, '');
  if (frac.length > decimals) return null;
  frac = frac.padEnd(decimals, '0');
  const n = parseInt(m[2].replace(/^0+(?=\d)/, '') + frac, 10);
  return m[1] ? -n : n;
}

/** Same rule as the database: round half-up(weight × rate) to the paisa. */
export function lineAmount(weightKg: string, rate: string): number | null {
  const g = parseScaled(weightKg, 3);
  const r = parseScaled(rate, 2);
  if (g === null || r === null) return null;
  return Math.floor((g * r + 500) / 1000) / 100;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

export function waNumber(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}
