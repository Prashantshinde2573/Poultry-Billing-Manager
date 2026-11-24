'use client';
import { useEffect } from 'react';

/** Registers the service worker in production (installable app; no business data is cached). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
