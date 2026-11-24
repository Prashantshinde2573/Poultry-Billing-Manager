'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { makeT, type Messages, type TFn } from './index';
import type { Locale } from '@/lib/format';

const Ctx = createContext<{ locale: Locale; t: TFn } | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(messages) }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
