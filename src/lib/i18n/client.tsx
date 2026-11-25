'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { dictionaries, makeT, type TFn } from './index';
import type { Locale } from '@/lib/format';

const Ctx = createContext<{ locale: Locale; t: TFn } | null>(null);

/**
 * The dictionaries ship once inside the cached JS bundle; pages no longer carry the
 * whole word list in every HTML response.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(dictionaries[locale]) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
