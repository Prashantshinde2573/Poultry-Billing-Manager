import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { todayIST } from '@/lib/format';
import { partyOptions, sizesWithRates } from '@/lib/data/queries';
import { PageHeader } from '@/components/ui/core';
import { OrderForm } from '@/components/forms/order-form';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await requireCtx({ office: true, module: 'orders' });
  const { t } = await getT();
  const sp = await searchParams;
  const today = todayIST();
  const [parties, sizes] = await Promise.all([partyOptions(ctx, 'CUSTOMER'), sizesWithRates(ctx, 'SALE', today)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/app/orders" title={t('o.new')} />
      <OrderForm parties={parties} sizes={sizes} initialParty={sp.customer ?? ''} today={today} />
    </div>
  );
}
