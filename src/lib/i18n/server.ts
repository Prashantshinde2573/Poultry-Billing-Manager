import 'server-only';
import { cookies } from 'next/headers';
import { dictionaries, isLocale, makeT } from './index';
import type { Locale } from '@/lib/format';

export const LANG_COOKIE = 'poulgo_lang';

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : 'mr';
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(dictionaries[locale]), messages: dictionaries[locale] };
}
