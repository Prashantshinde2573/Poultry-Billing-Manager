import type { ReactNode } from 'react';

/**
 * Desktop page header. On phones the title lives in the app bar instead, so
 * only the subtitle is shown (and actions only when `mobileActions` is set).
 */
export function PageHeader({ title, subtitle, actions, mobileActions = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; mobileActions?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:mb-5 ${subtitle || mobileActions ? 'mb-4' : 'mb-0'}`}>
      <div className="min-w-0">
        <h1 className="hidden truncate text-2xl font-bold tracking-tight md:block">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted md:mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className={`no-print flex-wrap gap-2 ${mobileActions ? 'flex' : 'hidden md:flex'}`}>{actions}</div>}
    </div>
  );
}
