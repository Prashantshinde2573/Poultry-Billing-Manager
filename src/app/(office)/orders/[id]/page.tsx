import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, inr, num } from '@/lib/format';
import { one } from '@/lib/data/queries';
import { Avatar, Badge, PageHeader, SectionTitle } from '@/components/ui/core';
import { OrderActions } from '@/components/forms/order-actions';
import { ORDER_TONE } from '@/lib/status';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const { id } = await params;
  const supabase = await createClient();
  const { data: o } = await supabase.from('orders')
    .select('*, parties(id, name, phone), order_items(id, ordered_qty, allocated_qty, delivered_qty, expected_weight, rate, bird_sizes(name, name_mr, name_hi, sort_order)), trip_allocs:order_items(trip_allocations(id, allocated_qty, trips(id, trip_no, status)))')
    .eq('id', id).eq('business_id', ctx.businessId).maybeSingle();
  if (!o) notFound();
  const party = one(o.parties as any) as { id: string; name: string; phone: string | null };
  const items = ((o.order_items ?? []) as any[]).sort((a, b) => (one(a.bird_sizes) as any)?.sort_order - (one(b.bird_sizes) as any)?.sort_order);
  const trips = new Map<string, { id: string; trip_no: string; status: string }>();
  for (const oi of (o.trip_allocs ?? []) as any[]) for (const a of oi.trip_allocations ?? []) { const tr = one(a.trips) as any; if (tr) trips.set(tr.id, tr); }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader back="/orders" title={o.order_no} sub={fmtDate(o.order_date, locale)} />
      <Link href={`/customers/${party.id}`} className="card press flex items-center gap-3 p-4">
        <Avatar name={party.name} size={52} />
        <div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold">{party.name}</p><p className="text-sm text-ink-muted">{party.phone ?? ''}</p></div>
        <Badge tone={ORDER_TONE[o.status]}>{t(`o.s.${o.status}` as any)}</Badge>
      </Link>
      <section>
        <SectionTitle>{t('c.details')}</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted"><tr className="border-b border-line">
              <th className="p-3 font-medium">{t('c.size')}</th><th className="p-3 text-right font-medium">{t('o.ordered')}</th>
              <th className="p-3 text-right font-medium">{t('o.allocated')}</th><th className="p-3 text-right font-medium">{t('o.delivered')}</th>
              <th className="p-3 text-right font-medium">{t('c.ratePerKg')}</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{localName(one(i.bird_sizes) as any, locale)}{i.expected_weight ? <span className="block text-xs text-ink-muted">{num(i.expected_weight)} kg</span> : null}</td>
                  <td className="tabular p-3 text-right">{i.ordered_qty}</td><td className="tabular p-3 text-right">{i.allocated_qty}</td>
                  <td className="tabular p-3 text-right">{i.delivered_qty}</td><td className="tabular p-3 text-right">{i.rate ? inr(i.rate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {trips.size > 0 && (
        <section>
          <SectionTitle>{t('nav.trips')}</SectionTitle>
          <div className="flex flex-wrap gap-2">{[...trips.values()].map((tr) => <Link key={tr.id} href={`/trips/${tr.id}`} className="press rounded-full border border-ink/15 bg-white/70 px-4 py-2 text-sm font-medium">{tr.trip_no} · {t(`t.s.${tr.status}` as any)}</Link>)}</div>
        </section>
      )}
      {o.notes && <p className="rounded-2xl bg-white/70 p-4 text-sm text-ink-soft">{o.notes}</p>}
      <OrderActions id={o.id} status={o.status} />
    </div>
  );
}
