import { en, type MessageKey, type Messages } from './en';
import { mr } from './mr';
import { hi } from './hi';
import type { Locale } from '@/lib/format';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'mr', label: 'मराठी' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'en', label: 'English' },
];

export const dictionaries: Record<Locale, Messages> = { en, mr, hi };

export function isLocale(v: unknown): v is Locale {
  return v === 'mr' || v === 'hi' || v === 'en';
}

export type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(messages: Messages): TFn {
  return (key, vars) => {
    let s = messages[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Pick the name of a bird size / category in the current language. */
export function localName(row: { name: string; name_mr?: string | null; name_hi?: string | null }, locale: Locale): string {
  if (locale === 'mr' && row.name_mr) return row.name_mr;
  if (locale === 'hi' && row.name_hi) return row.name_hi;
  return row.name;
}

export type { MessageKey, Messages };
