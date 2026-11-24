import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { todayIST } from '@/lib/format';
import { partyOptions, sizesWithRates, tripOptions } from '@/lib/data/queries';
import { PageHeader } from '@/components/ui/core';
import { DocForm } from '@/components/forms/doc-form';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  const ctx = await requireCtx({ office: true, perm: 'suppliers' });
  const { t } = await getT();
  const sp = await searchParams;
  const today = todayIST();
  const [parties, sizes, trips] = await Promise.all([partyOptions(ctx, 'SUPPLIER'), sizesWithRates(ctx, 'PURCHASE', today), tripOptions(ctx)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/purchases" title={t('pu.new')} />
      <DocForm kind="PURCHASE" parties={parties} sizes={sizes} trips={trips} initialParty={sp.supplier ?? ''} today={today} canOverride={ctx.can('rate_override')} />
    </div>
  );
}
