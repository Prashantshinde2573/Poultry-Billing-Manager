import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/core';

export const STATE: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'slate' | 'aqua' }> = {
  ACTIVE: { label: 'Active', tone: 'good' }, GRACE: { label: 'Grace', tone: 'warn' }, EXPIRED: { label: 'Ended', tone: 'bad' }, SUSPENDED: { label: 'Suspended', tone: 'slate' },
};

export function StateBadge({ state, planId, renewsAt }: { state: string; planId?: string; renewsAt?: string }) {
  if (state === 'ACTIVE' && planId === 'trial') return <Badge tone="aqua">Trial</Badge>;
  if (state === 'ACTIVE' && renewsAt && daysTo(renewsAt) <= 7) return <Badge tone="warn">Ends in {Math.max(daysTo(renewsAt), 0)}d</Badge>;
  const s = STATE[state] ?? STATE.ACTIVE;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const daysTo = (d: string) => Math.ceil((new Date(d + 'T23:59:59+05:30').getTime() - Date.now()) / 864e5) - 1;
export const dmy = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00+05:30' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
export const rs = (n: number | string | null | undefined) => (n == null ? '—' : '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n)));

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="text-[13px] leading-snug text-ink-muted">{label}</p>
      <p className={`tabular mt-1 text-[24px] font-semibold tracking-[-0.02em] ${tone === 'warn' ? 'text-[#9A5E0B]' : tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 break-words text-[12.5px] text-ink-muted">{sub}</p>}
    </div>
  );
}
