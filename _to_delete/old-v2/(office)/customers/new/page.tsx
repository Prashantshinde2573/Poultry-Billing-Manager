import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/core';
import { PartyForm } from '@/components/party/party-form';

export default async function Page() {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/customers" title={t('p.addCustomer')} />
      <PartyForm kind="CUSTOMER" canSuppliers={ctx.can('suppliers')} isOwner={ctx.role === 'owner'} />
    </div>
  );
}
