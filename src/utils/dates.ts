import { format, parseISO } from 'date-fns';
import type { PeriodKey } from '@/types/api';

export const BUSINESS_TZ = 'Asia/Kolkata';

/** Today's business date (Asia/Kolkata) as yyyy-MM-dd, regardless of device timezone. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 24 Oct 2026 */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  try {
    return format(parseISO(ymd), 'd MMM yyyy');
  } catch {
    return ymd;
  }
}

/** 24/10/2026 (Indian style, used in PDFs/CSV) */
export function formatDateShort(ymd: string): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export function chartLabel(key: string, granularity: 'day' | 'month'): string {
  try {
    return granularity === 'day' ? format(parseISO(key), 'd MMM') : format(parseISO(key + '-01'), 'MMM yy');
  } catch {
    return key;
  }
}

export const PERIOD_TABS: { key: Exclude<PeriodKey, 'CUSTOM'>; label: string }[] = [
  { key: 'DAY', label: 'Day' },
  { key: 'WEEK', label: 'Week' },
  { key: 'MONTH', label: 'Month' },
  { key: 'QUARTER', label: '3 Months' },
  { key: 'HALF_YEAR', label: '6 Months' },
  { key: 'YEAR', label: '1 Year' },
];

export function periodLabel(p: PeriodKey): string {
  return PERIOD_TABS.find((t) => t.key === p)?.label ?? 'Custom';
}
