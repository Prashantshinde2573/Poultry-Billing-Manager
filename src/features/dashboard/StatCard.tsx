import type { ReactNode } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { Skeleton } from '@/components/ui/Feedback';

interface Props {
  label: string;
  sublabel?: string;
  value: ReactNode;
  footnote?: ReactNode;
  tip?: string;
  icon: ReactNode;
  tone: 'teal' | 'indigo' | 'slate' | 'red';
  loading?: boolean;
}

const tones = {
  teal: 'bg-teal-50 text-teal-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  slate: 'bg-slate-100 text-slate-700',
  red: 'bg-red-50 text-red-700',
};

export function StatCard({ label, sublabel, value, footnote, tip, icon, tone, loading }: Props) {
  return (
    <div className="card h-full rounded-2xl p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted sm:text-xs">
            {label} {tip && <InfoTip text={tip} label={`About ${label}`} />}
          </p>
          {sublabel && <p className="text-[11px] font-medium text-ink-muted/80">{sublabel}</p>}
        </div>
        <div className={`hidden rounded-lg p-2 sm:block ${tones[tone]}`}>{icon}</div>
      </div>
      <div className="mt-2 text-[20px] font-bold leading-tight tracking-tight tabular sm:mt-3 sm:text-[28px]">
        {loading ? <Skeleton className="h-8 w-32" /> : value}
      </div>
      {footnote && <div className="mt-1.5 text-xs text-ink-muted">{loading ? <Skeleton className="h-3 w-24" /> : footnote}</div>}
    </div>
  );
}

export function MiniStat({ label, value, loading }: { label: string; value: ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2.5 sm:px-3.5 sm:py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1 text-[15px] font-semibold tabular sm:text-lg">{loading ? <Skeleton className="h-6 w-20" /> : value}</div>
    </div>
  );
}
