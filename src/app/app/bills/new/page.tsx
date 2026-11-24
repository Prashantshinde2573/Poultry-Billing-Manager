import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { todayIST } from '@/lib/format';
import { partyOptions, sizesWithRates } from '@/lib/data/queries';
import { PageHeader } from '@/components/ui/core';
import { DocForm } from '@/components/forms/doc-form';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  const sp = await searchParams;
  const today = todayIST();
  const [parties, sizes] = await Promise.all([partyOptions(ctx, 'CUSTOMER'), sizesWithRates(ctx, 'SALE', today)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back={sp.customer ? `/app/customers/${sp.customer}` : '/app'} title={t('b.title')} sub={t('b.sub')} />
      <DocForm kind="BILL" parties={parties} sizes={sizes} initialParty={sp.customer ?? ''} today={today} canOverride={ctx.can('rate_override')} />
    </div>
  );
}
