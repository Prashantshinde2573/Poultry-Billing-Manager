import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { PeriodKey } from '@/types/api';
import { PERIOD_TABS, todayIST } from '@/utils/dates';
import { Button } from './ui/Button';

export interface PeriodValue {
  period: PeriodKey;
  start?: string;
  end?: string;
}

/** "All time" is a custom range starting at the earliest supported date. */
export const ALL_TIME_START = '2000-01-01';
export const isAllTime = (v: PeriodValue) => v.period === 'CUSTOM' && v.start === ALL_TIME_START;

/**
 * The six period tabs (Day … 1 Year) plus a custom date range.
 * Phones: one swipeable row of pill chips. Desktop: a segmented control.
 */
export function PeriodFilter({ value, onChange, showAllTime }: { value: PeriodValue; onChange: (v: PeriodValue) => void; showAllTime?: boolean }) {
  const allActive = isAllTime(value);
  const customActive = value.period === 'CUSTOM' && !allActive;
  const [showCustom, setShowCustom] = useState(customActive);
  const today = todayIST();
  const [start, setStart] = useState(customActive && value.start ? value.start : today.slice(0, 8) + '01');
  const [end, setEnd] = useState(customActive && value.end ? value.end : today);
  const invalid = !start || !end || start > end;

  const tabs: { key: string; label: string; active: boolean; select: () => void }[] = [
    ...PERIOD_TABS.map((t) => ({
      key: t.key, label: t.label, active: value.period === t.key,
      select: () => { setShowCustom(false); onChange({ period: t.key }); },
    })),
    ...(showAllTime ? [{ key: 'ALL', label: 'All', active: allActive, select: () => { setShowCustom(false); onChange({ period: 'CUSTOM', start: ALL_TIME_START, end: today }); } }] : []),
  ];

  return (
    <div className="no-print space-y-3">
      {/* phones: swipeable chips */}
      <div role="tablist" aria-label="Period" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.active} type="button" onClick={t.select}
            className={`press h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold ${t.active ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-line'}`}>
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => setShowCustom((s) => !s)} aria-expanded={showCustom}
          className={`press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold ${customActive ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-line'}`}>
          <CalendarRange className="h-4 w-4" /> Custom
        </button>
      </div>

      {/* desktop: segmented control */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <div role="tablist" aria-label="Period" className="flex gap-1 rounded-xl border border-line bg-white p-1">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={t.active} type="button" onClick={t.select}
              className={`h-10 min-w-[72px] whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${t.active ? 'bg-primary text-white shadow-sm' : 'text-ink-muted hover:bg-slate-100 hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowCustom((s) => !s)} aria-expanded={showCustom}
          className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${customActive ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-white text-ink-muted hover:text-ink'}`}>
          <CalendarRange className="h-4 w-4" /> Custom range
        </button>
      </div>

      {showCustom && (
        <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="field-label">Start date</span>
              <input type="date" className="field-input" value={start} max={today} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">End date</span>
              <input type="date" className="field-input" value={end} max={today} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <Button disabled={invalid} onClick={() => onChange({ period: 'CUSTOM', start, end })}>Apply</Button>
          {start > end && <p className="field-error">Start date must be on or before the end date.</p>}
        </div>
      )}
    </div>
  );
}
