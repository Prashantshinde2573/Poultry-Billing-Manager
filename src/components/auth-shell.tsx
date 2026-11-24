import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';

/** Sign-in style screens: form on the right; on large screens a dark khata panel on the left. */
export function AuthShell({ children, aside, back }: { children: ReactNode; aside?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="stripe-card relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Link href="/" aria-label="PoulGo"><Wordmark height={52} white /></Link>
        <div className="max-w-md">{aside}</div>
        <p className="text-[13px] text-white/50">© PoulGo</p>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 pb-10 pt-[max(env(safe-area-inset-top),20px)] lg:justify-center lg:py-12">
        <div className="flex items-center justify-between gap-3 lg:absolute lg:right-8 lg:top-6">
          {back ? <Link href={back.href} className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft lg:hidden"><ArrowLeft className="h-4 w-4" /> {back.label}</Link> : <span />}
          <LanguageSwitcher />
        </div>
        <Link href="/" aria-label="PoulGo" className="mt-8 block lg:hidden"><Wordmark height={48} /></Link>
        <div className="mt-8 lg:mt-0">{children}</div>
      </main>
    </div>
  );
}

/** The left-panel illustration: an evening WhatsApp hisab as the trader receives it. */
export function HisabBubble({ lines, title }: { lines: [string, string][]; title: string }) {
  return (
    <div className="rounded-[20px] rounded-tl-[6px] bg-white/95 p-5 text-ink shadow-2xl">
      <p className="text-[13px] font-semibold text-aqua-deep">{title}</p>
      <dl className="tabular mt-3 space-y-1.5 text-[14.5px]">
        {lines.map(([k, v], i) => (
          <div key={k} className={`flex justify-between gap-6 ${i === lines.length - 1 ? 'border-t border-line pt-2 font-semibold' : ''}`}><dt className="text-ink-soft">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
