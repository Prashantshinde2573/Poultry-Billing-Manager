import { ClipboardList, Plus } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/format';
import { one } from '@/lib/data/queries';
import { Avatar, Badge, Empty, IconCircle, LinkButton, PageHeader, Pills, Row } from '@/components/ui/core';
import { ORDER_TONE } from '@/lib/status';

export const dynamic = 'force-dynamic';

const TABS: Record<string, string[] | null> = {
  open: ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'], draft: ['DRAFT'], done: ['COMPLETED'], cancelled: ['CANCELLED'], all: null,
};

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const tab = (await searchParams).tab ?? 'open';
  const supabase = await createClient();
  let q = supabase.from('orders').select('id, order_no, order_date, status, parties(name), order_items(ordered_qty, delivered_qty, allocated_qty)')
    .eq('business_id', ctx.businessId).order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  if (TABS[tab]) q = q.in('status', TABS[tab]!);
  const { data } = await q;
  const rows = data ?? [];
  const label: Record<string, string> = { open: t('o.open'), draft: t('o.s.DRAFT'), done: t('o.s.COMPLETED'), cancelled: t('o.s.CANCELLED'), all: t('c.all') };
  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.orders')} right={<IconCircle href="/orders/new" label={t('o.new')} dark><Plus className="h-5 w-5" /></IconCircle>} />
      <Pills items={Object.keys(TABS).map((k) => ({ href: `/orders?tab=${k}`, label: label[k], active: tab === k }))} />
      {rows.length === 0 ? (
        <Empty icon={<ClipboardList className="h-6 w-6" />} title={t('c.none')} action={<LinkButton href="/orders/new">{t('o.new')}</LinkButton>} />
      ) : (
        <div className="card divide-y divide-line px-4">
          {rows.map((r) => {
            const it = (r.order_items ?? []) as { ordered_qty: number; delivered_qty: number; allocated_qty: number }[];
            const ord = it.reduce((s, i) => s + i.ordered_qty, 0);
            const del = it.reduce((s, i) => s + i.delivered_qty, 0);
            const name = one(r.parties as any)?.name ?? '—';
            return (
              <Row key={r.id} href={`/orders/${r.id}`} left={<Avatar name={name} size={46} />} title={name}
                sub={`${r.order_no} · ${fmtDate(r.order_date, locale, false)}`}
                amount={`${del}/${ord}`} amountSub={<Badge tone={ORDER_TONE[r.status]}>{t(`o.s.${r.status}` as any)}</Badge>} />
            );
          })}
        </div>
      )}
    </div>
  );
}
