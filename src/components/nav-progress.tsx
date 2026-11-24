'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChickenLoader } from '@/components/ui/loader';
import { useI18n } from '@/lib/i18n/client';
import { reportClientError } from '@/app/actions/system';

let slowReports = 0;
/** Slow screens are written to the super admin's log with the phone's network type, so slowness can be traced. */
function reportSlow(path: string, ms: number) {
  if (ms < 3000 || slowReports >= 3) return;
  slowReports++;
  const c = (navigator as any).connection;
  reportClientError({ message: `Slow screen ${ms}ms`, path, meta: { kind: 'SLOW', ms, net: c?.effectiveType, downlink: c?.downlink, rtt: c?.rtt, saveData: c?.saveData } }).catch(() => {});
}

/**
 * Instant feedback for every tap on a link: a thin bar at once, the chicken after a moment.
 * If a screen still has not opened after 12 s, it is opened with a full page load
 * (recovers from a stuck in-app navigation on a weak connection).
 */
export function NavProgress() {
  const path = usePathname();
  const sp = useSearchParams();
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'bar' | 'loader' | 'slow' | 'stuck'>('idle');
  const [target, setTarget] = useState('');
  const started = useRef(0);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach((x) => clearTimeout(x)); timers.current = []; };

  // navigation finished
  useEffect(() => {
    if (started.current) { reportSlow(path, Math.round(performance.now() - started.current)); started.current = 0; }
    clear(); setState('idle');
  }, [path, sp]);

  useEffect(() => {
    const start = (href: string) => {
      clear();
      started.current = performance.now();
      setTarget(href);
      setState('bar');
      timers.current.push(window.setTimeout(() => setState('loader'), 350));
      timers.current.push(window.setTimeout(() => setState('slow'), 8000));
      // never reload by itself (on a weak network that only costs more data); offer a retry instead
      timers.current.push(window.setTimeout(() => setState('stuck'), 20000));
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
          <div className="animate-fade pointer-events-auto flex flex-col items-center rounded-[24px] bg-white/95 px-6 pb-4 pt-2 shadow-lift">
            <ChickenLoader size={84} />
            <p className="text-[14px] font-medium text-ink-muted">{state === 'loader' ? t('c.loading') : t('c.slow')}</p>
            {state === 'stuck' && (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { window.location.href = target; }} className="press h-10 rounded-[12px] bg-ink px-4 text-[14px] font-medium text-white">{t('err.retry')}</button>
                <button type="button" onClick={() => { clear(); started.current = 0; setState('idle'); }} className="press h-10 rounded-[12px] border border-line px-4 text-[14px] font-medium">{t('c.close')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
