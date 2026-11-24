'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/app/actions/system';

/** Sends uncaught browser errors to the super admin's error log (at most 5 per page load). */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();
    const send = (message: string, stack?: string) => {
      if (!message || sent >= 5 || seen.has(message)) return;
      // noise from browser extensions and cancelled navigations
      if (/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|NEXT_REDIRECT|AbortError|Load failed|Failed to fetch/i.test(message + (stack ?? ''))) return;
      seen.add(message); sent++;
      reportClientError({ message, stack, path: location.pathname }).catch(() => {});
    };
    const onErr = (e: ErrorEvent) => send(e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => { const r = e.reason; send(r?.message ?? String(r), r?.stack); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);
  return null;
}
