import { UserPlus } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { listParties } from '@/lib/data/queries';
import { inr } from '@/lib/format';
import { IconCircle, PageHeader } from '@/components/ui/core';
import { PartyList } from '@/components/party/party-list';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  const rows = await listParties(ctx, 'CUSTOMER');
  const total = rows.reduce((s, r) => s + Math.max(Number(r.receivable) || 0, 0), 0);
  return (
    <div>
      <PageHeader title={t('nav.customers')} sub={`${rows.length} · ${inr(total)}`} right={<IconCircle href="/customers/new" label={t('p.addCustomer')} dark><UserPlus className="h-5 w-5" /></IconCircle>} />
      <PartyList rows={rows} kind="CUSTOMER" />
    </div>
  );
}
