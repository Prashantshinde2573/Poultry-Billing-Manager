import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { addDays, fmtDate, inr, todayIST } from '@/lib/format';
import { one } from '@/lib/data/queries';
import { PAY_TONE } from '@/lib/status';
import { Badge, Empty, IconBubble, IconCircle, PageHeader, Pills } from '@/components/ui/core';
import { VerifyButtons } from '@/components/forms/verify-buttons';
import { VoidButton } from '@/components/forms/void-button';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const sp = await searchParams;
  const sup = ctx.can('suppliers');
  const tab = sp.tab === 'out' && sup ? 'out' : sp.tab === 'pending' ? 'pending' : sp.tab === 'in' ? 'in' : 'all';
  const supabase = await createClient();
  let q = supabase.from('payments').select('id, direction, amount, method, reference, payment_date, status, source, party_id, notes, status_reason, created_at, parties(name), trips(trip_no)')
    .eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(200);
  if (tab === 'pending') q = q.eq('status', 'PENDING_VERIFICATION');
  else {
    q = q.gte('payment_date', addDays(todayIST(), -60));
    if (tab === 'in') q = q.eq('direction', 'IN');
    if (tab === 'out') q = q.eq('direction', 'OUT');
  }
  const { data } = await q;
  const rows = data ?? [];
  const { count: pendingCount } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('business_id', ctx.businessId).eq('status', 'PENDING_VERIFICATION');
  const canVerify = ctx.can('verify_payments');
  const tabs = [
    { k: 'all', l: t('c.all') }, { k: 'in', l: t('pay.in') }, ...(sup ? [{ k: 'out', l: t('pay.out') }] : []),
    { k: 'pending', l: `${t('pay.s.PENDING_VERIFICATION')}${pendingCount ? ` · ${pendingCount}` : ''}` },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t('pay.list')} right={<IconCircle href="/app/payments/new" label={t('qa.payment')} dark><Plus className="h-5 w-5" /></IconCircle>} />
      <Pills items={tabs.map((x) => ({ href: `/app/payments?tab=${x.k}`, label: x.l, active: tab === x.k }))} />
      {tab === 'pending' && <p className="text-sm text-ink-muted">{t('pay.pendingTitle')}</p>}
      {rows.length === 0 ? <Empty icon={<Wallet className="h-6 w-6" />} title={t('c.none')} /> : (
        <div className="card divide-y divide-line px-4">
          {rows.map((r) => {
            const name = (one(r.parties as any) as any)?.name ?? '—';
            const trip = (one(r.trips as any) as any)?.trip_no;
            const inDir = r.direction === 'IN';
            return (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <IconBubble tone={inDir ? 'good' : 'violet'}>{inDir ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}</IconBubble>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[17px] font-medium">{name}</p>
                  <p className="break-words text-sm text-ink-muted">{fmtDate(r.payment_date, locale, false)} · {t(`pay.m.${r.method}` as any)}{r.reference ? ` · ${r.reference}` : ''}{trip ? ` · ${trip}` : ''}</p>
                  {r.status_reason && <p className="break-words text-xs text-ink-muted">{r.status_reason}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tabular text-[17px] font-medium ${r.status === 'VOID' || r.status === 'REJECTED' ? 'text-ink-faint line-through' : inDir ? 'text-good' : ''}`}>{inDir ? '+' : '−'}{inr(r.amount)}</p>
                  {r.status !== 'CONFIRMED' && <Badge tone={PAY_TONE[r.status]}>{t(`pay.s.${r.status}` as any)}</Badge>}
                </div>
                {r.status === 'PENDING_VERIFICATION' && canVerify && <VerifyButtons id={r.id} />}
                {ctx.role === 'owner' && r.status === 'CONFIRMED' && <VoidButton kind="payment" id={r.id} label={t('c.void')} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
