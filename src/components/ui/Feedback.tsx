import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-primary-soft p-3 text-primary">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-4 py-8 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-danger" />
      <p className="max-w-md text-sm text-ink">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Alert({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info' | 'success'; children: ReactNode }) {
  const tones = {
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    info: 'bg-primary-soft border-teal-200 text-teal-900',
    success: 'bg-green-50 border-green-200 text-green-900',
  };
  return <div className={`rounded-lg border px-3.5 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
