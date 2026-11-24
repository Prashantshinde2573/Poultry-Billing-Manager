import { addDays, monthStart, todayIST, weekStart } from '@/lib/format';
import { Pills } from '@/components/ui/core';
import type { TFn } from '@/lib/i18n';

export function resolvePeriod(sp: { p?: string; from?: string; to?: string }) {
  const today = todayIST();
  const p = sp.p ?? 'month';
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (p === 'today') return { p, from: today, to: today };
  if (p === 'week') return { p, from: weekStart(today), to: today };
  if (p === 'last') return { p, from: monthStart(addDays(monthStart(today), -1)), to: addDays(monthStart(today), -1) };
  if (p === 'custom' && ok(sp.from) && ok(sp.to)) return { p, from: sp.from!, to: sp.to! };
  return { p: 'month', from: monthStart(today), to: today };
}

/** Period pills + custom range (plain GET form, works without JS). */
export function PeriodPills({ base, cur, t, extra = {} }: { base: string; cur: { p: string; from: string; to: string }; t: TFn; extra?: Record<string, string> }) {
  const q = (o: Record<string, string>) => `${base}?${new URLSearchParams({ ...extra, ...o }).toString()}`;
  return (
    <div className="space-y-3">
      <Pills items={[['today', t('c.today')], ['week', t('c.week')], ['month', t('c.month')], ['last', '−1 ' + t('c.month')], ['custom', t('c.custom')]]
        .map(([k, l]) => ({ href: q({ p: k, ...(k === 'custom' ? { from: cur.from, to: cur.to } : {}) }), label: l, active: cur.p === k }))} />
      {cur.p === 'custom' && (
        <form action={base} className="flex flex-wrap items-end gap-2">
          {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="p" value="custom" />
          <label className="flex-1"><span className="label">{t('c.from')}</span><input type="date" name="from" defaultValue={cur.from} className="input" /></label>
          <label className="flex-1"><span className="label">{t('c.to')}</span><input type="date" name="to" defaultValue={cur.to} className="input" /></label>
          <button className="press h-12 rounded-2xl bg-ink px-5 font-medium text-white">{t('c.apply')}</button>
        </form>
      )}
    </div>
  );
}
