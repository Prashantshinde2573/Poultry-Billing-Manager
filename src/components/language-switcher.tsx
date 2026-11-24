'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';
import { setLanguage } from '@/app/actions/auth';

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Language" className={`inline-flex gap-1 rounded-full p-1 ${dark ? 'bg-white/10' : 'border border-ink/10 bg-white/70'} ${pending ? 'opacity-60' : ''}`}>
      {LOCALES.map((l) => (
        <button key={l.code} type="button" role="radio" aria-checked={locale === l.code}
          onClick={() => start(async () => { await setLanguage(l.code); router.refresh(); })}
          className={`press h-9 rounded-full px-3.5 text-sm font-medium ${locale === l.code ? (dark ? 'bg-white text-ink' : 'bg-ink text-white') : dark ? 'text-white/80' : 'text-ink-soft'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
