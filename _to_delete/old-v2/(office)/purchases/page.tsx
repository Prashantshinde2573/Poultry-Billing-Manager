import { Plus, ShoppingBasket } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { addDays, fmtDate, inr, kg, todayIST } from '@/lib/format';
import { one } from '@/lib/data/queries';
import { Badge, Empty, IconBubble, IconCircle, LinkButton, PageHeader, Pills, Row } from '@/components/ui/core';
import { VoidButton } from '@/components/forms/void-button';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const ctx = await requireCtx({ office: true, perm: 'suppliers' });
  const { t, locale } = await getT();
  const sp = await searchParams;
  const today = todayIST();
  const days = sp.d === '7' ? 7 : sp.d === '90' ? 90 : 30;
  const supabase = await createClient();
  const { data } = await supabase.from('purchases')
    .select('id, purchase_no, purchase_date, final_amount, status, supplier_id, parties(name), purchase_items(qty, weight_kg)')
    .eq('business_id', ctx.businessId).gte('purchase_date', addDays(today, -days + 1))
    .order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  const rows = data ?? [];
  const total = rows.filter((r) => r.status === 'POSTED').reduce((s, r) => s + Number(r.final_amount), 0);
  return (
    <div className="space-y-5">
      <PageHeader title={t('pu.list')} sub={inr(total)} right={<IconCircle href="/purchases/new" label={t('pu.new')} dark><Plus className="h-5 w-5" /></IconCircle>} />
      <Pills items={[['7', '7d'], ['30', '30d'], ['90', '90d']].map(([v, l]) => ({ href: `/purchases?d=${v}`, label: l, active: String(days) === v }))} />
      {rows.length === 0 ? (
        <Empty icon={<ShoppingBasket className="h-6 w-6" />} title={t('c.none')} action={<LinkButton href="/purchases/new">{t('pu.new')}</LinkButton>} />
      ) : (
        <div className="card divide-y divide-line px-4">
          {rows.map((r) => {
            const items = (r.purchase_items ?? []) as { qty: number; weight_kg: string }[];
            const w = items.reduce((s, i) => s + Number(i.weight_kg), 0);
            const q = items.reduce((s, i) => s + i.qty, 0);
            return (
              <div key={r.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Row href={`/suppliers/${r.supplier_id}?ledger=PAYABLE`} left={<IconBubble tone="violet"><ShoppingBasket className="h-5 w-5" /></IconBubble>}
                    title={one(r.parties as any)?.name ?? '—'} sub={`${r.purchase_no} · ${fmtDate(r.purchase_date, locale, false)} · ${q} · ${kg(w)}`}
                    amount={r.status === 'VOID' ? <s>{inr(r.final_amount)}</s> : inr(r.final_amount)} amountSub={r.status === 'VOID' ? <Badge tone="bad">{t('b.voided')}</Badge> : undefined} tone={r.status === 'VOID' ? 'muted' : undefined} />
                </div>
                {ctx.role === 'owner' && r.status === 'POSTED' && <VoidButton kind="purchase" id={r.id} label={t('pu.void')} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
