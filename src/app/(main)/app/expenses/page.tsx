import { Receipt } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { addDays, fmtDate, inr, monthStart, todayIST } from '@/lib/format';
import { categories, one, tripOptions } from '@/lib/data/queries';
import { Empty, IconBubble, PageHeader, Pills } from '@/components/ui/core';
import { Donut, DONUT_COLORS } from '@/components/ui/donut';
import { ExpenseSheet } from '@/components/forms/expense-sheet';
import { VoidButton } from '@/components/forms/void-button';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; new?: string; trip?: string }> }) {
  const ctx = await requireCtx({ office: true, module: 'expenses', perm: 'expenses' });
  const { t, locale } = await getT();
  const sp = await searchParams;
  const today = todayIST();
  const period = sp.p ?? 'month';
  const from = period === 'today' ? today : period === 'last' ? monthStart(addDays(monthStart(today), -1)) : monthStart(today);
  const to = period === 'last' ? addDays(monthStart(today), -1) : today;
  const supabase = await createClient();
  const [{ data }, cats, trips] = await Promise.all([
    supabase.from('expenses').select('id, expense_date, amount, note, status, category_id, expense_categories(name, name_mr, name_hi), trips(trip_no)')
      .eq('business_id', ctx.businessId).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
    categories(ctx), tripOptions(ctx, false),
  ]);
  const rows = data ?? [];
  const live = rows.filter((r) => r.status === 'ACTIVE');
  const total = live.reduce((s, r) => s + Number(r.amount), 0);
  const byCat = new Map<string, number>();
  for (const r of live) { const n = localName(one(r.expense_categories as any) as any, locale); byCat.set(n, (byCat.get(n) ?? 0) + Number(r.amount)); }
  const parts = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  return (
    <div className="space-y-5">
      <PageHeader title={t('e.list')} right={<ExpenseSheet cats={cats} trips={trips} today={today} startOpen={sp.new === '1'} startTrip={sp.trip ?? ''} />} />
      <Pills items={[['today', t('c.today')], ['month', t('c.month')], ['last', '−1 ' + t('c.month')]].map(([k, l]) => ({ href: `/app/expenses?p=${k}`, label: l, active: period === k }))} />
      {parts.length > 0 && (
        <section className="card flex flex-col items-center gap-4 p-5 sm:flex-row">
          <Donut parts={parts} center={inr(total, { decimals: false })} sub={t('c.total')} size={220} />
          <ul className="w-full flex-1 space-y-2">
            {parts.map((p, i) => (
              <li key={p.label} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="flex-1">{p.label}</span><span className="tabular font-medium">{inr(p.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length === 0 ? <Empty icon={<Receipt className="h-6 w-6" />} title={t('c.none')} /> : (
        <div className="card divide-y divide-line px-4">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <IconBubble tone="warn"><Receipt className="h-5 w-5" /></IconBubble>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[17px] font-medium">{localName(one(r.expense_categories as any) as any, locale)}</p>
                <p className="break-words text-sm text-ink-muted">{fmtDate(r.expense_date, locale, false)}{(one(r.trips as any) as any)?.trip_no ? ` · ${(one(r.trips as any) as any).trip_no}` : ''}{r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <p className={`tabular text-[17px] font-medium ${r.status === 'VOID' ? 'text-ink-faint line-through' : ''}`}>{inr(r.amount)}</p>
              {ctx.role === 'owner' && r.status === 'ACTIVE' && <VoidButton kind="expense" id={r.id} label={t('c.void')} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
