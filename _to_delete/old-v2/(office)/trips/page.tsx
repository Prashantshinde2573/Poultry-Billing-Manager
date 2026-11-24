import { Plus, Truck } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/format';
import { one } from '@/lib/data/queries';
import { TRIP_TONE } from '@/lib/status';
import { Badge, Empty, IconBubble, IconCircle, LinkButton, PageHeader, Pills, Row } from '@/components/ui/core';

export const dynamic = 'force-dynamic';

const TABS: Record<string, string[] | null> = {
  active: ['DRAFT', 'ASSIGNED', 'LOADING', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED'], settled: ['SETTLED'], cancelled: ['CANCELLED'], all: null,
};

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const tab = (await searchParams).tab ?? 'active';
  const supabase = await createClient();
  let q = supabase.from('trips').select('id, trip_no, trip_date, status, drivers(name), vehicles(registration_no), trip_allocations(customer_id, allocated_qty), deliveries(id)')
    .eq('business_id', ctx.businessId).order('trip_date', { ascending: false }).order('trip_no', { ascending: false }).limit(150);
  if (TABS[tab]) q = q.in('status', TABS[tab]!);
  const { data } = await q;
  const rows = data ?? [];
  const label: Record<string, string> = { active: t('dash.activeTrips'), settled: t('t.s.SETTLED'), cancelled: t('t.s.CANCELLED'), all: t('c.all') };
  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.trips')} right={<IconCircle href="/trips/new" label={t('t.new')} dark><Plus className="h-5 w-5" /></IconCircle>} />
      <Pills items={Object.keys(TABS).map((k) => ({ href: `/trips?tab=${k}`, label: label[k], active: tab === k }))} />
      {rows.length === 0 ? (
        <Empty icon={<Truck className="h-6 w-6" />} title={t('dash.noTrips')} action={<LinkButton href="/trips/new">{t('t.new')}</LinkButton>} />
      ) : (
        <div className="card divide-y divide-line px-4">
          {rows.map((r) => {
            const al = (r.trip_allocations ?? []) as { customer_id: string; allocated_qty: number }[];
            const custs = new Set(al.map((a) => a.customer_id)).size;
            const birds = al.reduce((s, a) => s + a.allocated_qty, 0);
            return (
              <Row key={r.id} href={`/trips/${r.id}`} left={<IconBubble tone="ink"><Truck className="h-5 w-5" /></IconBubble>}
                title={`${r.trip_no} · ${fmtDate(r.trip_date, locale, false)}`}
                sub={[(one(r.drivers as any) as any)?.name, (one(r.vehicles as any) as any)?.registration_no, `${birds} ${t('c.birds')}`].filter(Boolean).join(' · ')}
                amount={t('dash.progress', { done: (r.deliveries ?? []).length, total: custs })} amountSub={<Badge tone={TRIP_TONE[r.status]}>{t(`t.s.${r.status}` as any)}</Badge>} />
            );
          })}
        </div>
      )}
    </div>
  );
}
