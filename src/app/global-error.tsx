'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/app/actions/system';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ message: error.message || 'App crashed', stack: error.stack, digest: error.digest, path: location.pathname, meta: { boundary: 'global' } }).catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F2F6F5', color: '#0E2A2F', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0, padding: 24, textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong · काहीतरी चुकले</h1>
          <p style={{ color: '#5B6F72' }}>We have noted the problem. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 16, height: 48, padding: '0 20px', borderRadius: 14, border: 0, background: '#0E2A2F', color: '#fff', fontSize: 15 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
