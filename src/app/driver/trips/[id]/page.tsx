import { notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { fmtDate } from '@/lib/format';
import { loadTrip } from '@/lib/data/trip';
import { TRIP_TONE } from '@/lib/status';
import { Badge, PageHeader, SectionTitle } from '@/components/ui/core';
import { CustomerCard, LoadingButton, TripLossButton, WeightLossCard } from '@/components/trip/trip-office';
import { DriverTripActions } from '@/components/trip/driver-nav';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { t, locale } = await getT();
  const { id } = await params;
  const data = await loadTrip(ctx, id, locale);
  if (!data) notFound();
  const { trip, customers, loadRows, weight, tripSizes } = data;
  const running = ['LOADING', 'DISPATCHED', 'IN_PROGRESS'].includes(trip.status);
  return (
    <div className="space-y-6">
      <PageHeader back="/driver" title={trip.trip_no} sub={`${fmtDate(trip.trip_date, locale)} · ${trip.vehicle?.registration_no ?? ''}`}
        right={<Badge tone={TRIP_TONE[trip.status]}>{t(`t.s.${trip.status}` as any)}</Badge>} />
      <section>
        <SectionTitle>{t('t.loadingSummary')}</SectionTitle>
        <div className="card mb-3 grid grid-cols-2 gap-px overflow-hidden bg-line">
          {loadRows.map((r) => (
            <div key={r.bird_size_id} className="bg-white p-4">
              <p className="text-ink-muted">{r.size}</p>
              <p className="tabular text-2xl font-semibold">{r.loaded ?? '—'} <span className="text-base font-normal text-ink-muted">/ {r.allocated}</span></p>
            </div>
          ))}
        </div>
        {weight.loadedWeight ? <div className="mb-3"><WeightLossCard {...weight} /></div> : null}
        <div className="space-y-2">
          {['ASSIGNED', 'LOADING', 'DISPATCHED'].includes(trip.status) && <LoadingButton tripId={trip.id} rows={loadRows} totalWeight={trip.loaded_weight != null ? String(trip.loaded_weight) : null} />}
          {(running || trip.status === 'COMPLETED') && <TripLossButton tripId={trip.id} sizes={tripSizes} />}
        </div>
      </section>
      <DriverTripActions tripId={trip.id} status={trip.status} />
      <section className="space-y-3">
        <SectionTitle>{t('t.customers')}</SectionTitle>
        {customers.map((c) => (
          <CustomerCard key={c.id} tripId={trip.id} c={c} canDeliver={running} canCollect={!['SETTLED', 'CANCELLED'].includes(trip.status)} canOverride={false} />
        ))}
      </section>
    </div>
  );
}
