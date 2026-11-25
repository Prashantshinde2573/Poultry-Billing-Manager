'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { reportClientError } from '@/app/actions/system';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    reportClientError({ message: error.message || 'Render error', stack: error.stack, digest: error.digest, path: location.pathname, meta: { boundary: 'route' } }).catch(() => {});
  }, [error]);
  const home = typeof location !== 'undefined' && location.pathname.startsWith('/admin') ? '/admin' : typeof location !== 'undefined' && location.pathname.startsWith('/driver') ? '/driver' : '/app';
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#FCEAE6] text-bad"><AlertTriangle className="h-7 w-7" /></span>
      <h1 className="mt-4 text-[22px] font-semibold">{t('err.pageTitle')}</h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">{t('err.pageSub')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="press inline-flex h-12 items-center gap-2 rounded-[14px] bg-ink px-5 text-[15px] font-medium text-white"><RotateCw className="h-4 w-4" /> {t('err.retry')}</button>
        <Link href={home} className="press inline-flex h-12 items-center rounded-[14px] border border-line bg-white px-5 text-[15px] font-medium">{t('err.home')}</Link>
      </div>
    </div>
  );
}
