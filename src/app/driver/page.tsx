import Link from 'next/link';
import { Truck } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { fmtDate, inr } from '@/lib/format';
import { rpc } from '@/lib/data/queries';
import { TRIP_TONE } from '@/lib/status';
import { Avatar, Badge, Empty, SectionTitle } from '@/components/ui/core';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await requireCtx();
  const { t, locale } = await getT();
  const trips = await rpc<any[]>('driver_trips', ctx);
  const open = trips.filter((x) => !['SETTLED', 'CANCELLED', 'COMPLETED'].includes(x.status));
  const done = trips.filter((x) => ['COMPLETED', 'SETTLED'].includes(x.status)).slice(0, 10);
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3.5 pt-2">
        <Avatar name={ctx.name || '?'} size={56} />
        <div className="min-w-0 flex-1 leading-tight"><p className="text-[17px] text-ink-muted">{t('c.welcome')}</p><p className="truncate text-[22px] font-semibold">{ctx.name}</p></div>
      </header>
      <SectionTitle>{t('nav.myTrips')}</SectionTitle>
      {open.length === 0 ? <Empty icon={<Truck className="h-6 w-6" />} title={t('dash.noTrips')} /> : open.map((x) => (
        <Link key={x.id} href={`/driver/trips/${x.id}`} className="press stripe-card block rounded-[28px] p-6 text-white shadow-float">
          <div className="flex items-center justify-between"><p className="text-xl font-semibold">{x.trip_no}</p><Badge tone={TRIP_TONE[x.status]}>{t(`t.s.${x.status}` as any)}</Badge></div>
          <p className="mt-1 text-white/75">{fmtDate(x.trip_date, locale)} · {x.vehicle ?? '—'}</p>
          <div className="tabular mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('c.birds')}</p><p className="text-lg font-semibold">{x.birds}</p></div>
            <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('dash.delivered')}</p><p className="text-lg font-semibold">{x.delivered}/{x.customers}</p></div>
            <div className="rounded-2xl bg-white/10 p-2.5"><p className="text-xs text-white/70">{t('d.collect')}</p><p className="text-lg font-semibold">{inr(x.collected, { decimals: false })}</p></div>
          </div>
        </Link>
      ))}
      {done.length > 0 && (
        <section>
          <SectionTitle>{t('c.recent')}</SectionTitle>
          <div className="card divide-y divide-line px-4">
            {done.map((x) => (
              <Link key={x.id} href={`/driver/trips/${x.id}`} className="press flex items-center justify-between py-3">
                <span><span className="font-medium">{x.trip_no}</span> <span className="text-sm text-ink-muted">· {fmtDate(x.trip_date, locale, false)}</span></span>
                <Badge tone={TRIP_TONE[x.status]}>{t(`t.s.${x.status}` as any)}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
