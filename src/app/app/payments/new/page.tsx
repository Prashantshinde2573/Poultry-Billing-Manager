import { requireCtx } from '@/lib/session';
import { todayIST } from '@/lib/format';
import { partyOptions } from '@/lib/data/queries';
import { PaymentForm } from '@/components/forms/payment-form';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ dir?: string; party?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const sp = await searchParams;
  const sup = ctx.can('suppliers');
  const [customers, suppliers] = await Promise.all([partyOptions(ctx, 'CUSTOMER'), sup ? partyOptions(ctx, 'SUPPLIER') : Promise.resolve(null)]);
  return <PaymentForm customers={customers} suppliers={suppliers} initialDir={sp.dir === 'OUT' && sup ? 'OUT' : 'IN'} initialParty={sp.party ?? ''} today={todayIST()} />;
}
