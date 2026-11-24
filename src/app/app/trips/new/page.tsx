import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { todayIST } from '@/lib/format';
import { fleet } from '@/lib/data/queries';
import { LinkButton, PageHeader } from '@/components/ui/core';
import { TripNewForm } from '@/components/trip/trip-new-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await requireCtx({ office: true, module: 'trips' });
  const { t } = await getT();
  const { drivers, vehicles } = await fleet(ctx);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/app/trips" title={t('t.new')} />
      <TripNewForm drivers={drivers.filter((d) => d.active)} vehicles={vehicles.filter((v) => v.active)} today={todayIST()} />
      {(drivers.length === 0 || vehicles.length === 0) && ctx.role === 'owner' && (
        <div className="mt-4 flex gap-2"><LinkButton href="/app/settings#fleet" variant="outline" size="sm">{t('set.drivers')} / {t('set.vehicles')}</LinkButton></div>
      )}
    </div>
  );
}
