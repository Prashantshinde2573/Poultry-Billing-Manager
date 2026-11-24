'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChickenLoader } from '@/components/ui/loader';
import { useI18n } from '@/lib/i18n/client';

/**
 * Instant feedback for every tap on a link: a thin bar at once, the chicken after a moment.
 * If a screen still has not opened after 12 s, it is opened with a full page load
 * (recovers from a stuck in-app navigation on a weak connection).
 */
export function NavProgress() {
  const path = usePathname();
  const sp = useSearchParams();
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'bar' | 'loader' | 'slow'>('idle');
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach((x) => clearTimeout(x)); timers.current = []; };

  // navigation finished
  useEffect(() => { clear(); setState('idle'); }, [path, sp]);

  useEffect(() => {
    const start = (href: string) => {
      clear();
      setState('bar');
      timers.current.push(window.setTimeout(() => setState('loader'), 350));
      timers.current.push(window.setTimeout(() => setState('slow'), 7000));
      timers.current.push(window.setTimeout(() => { window.location.href = href; }, 12000));
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('upi:') || href.startsWith('whatsapp:')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (url.pathname === location.pathname && url.hash) return;
      start(url.pathname + url.search);
    };
    // router.push from forms / selects
    const onNav = (e: Event) => start((e as CustomEvent<string>).detail);
    document.addEventListener('click', onClick, true);
    window.addEventListener('pg:navigate', onNav);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('pg:navigate', onNav); clear(); };
  }, []);

  if (state === 'idle') return null;
  return (
    <>
      <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-aqua/20">
        <div className="h-full w-1/3 animate-[navbar_1.1s_ease-in-out_infinite] rounded-full bg-aqua" />
      </div>
      {state !== 'bar' && (
        <div className="no-print pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
          <div className="animate-fade flex flex-col items-center rounded-[24px] bg-white/95 px-6 pb-4 pt-2 shadow-lift">
            <ChickenLoader size={84} />
            <p className="text-[14px] font-medium text-ink-muted">{state === 'slow' ? t('c.slow') : t('c.loading')}</p>
          </div>
        </div>
      )}
    </>
  );
}
