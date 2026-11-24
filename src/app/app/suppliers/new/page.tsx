import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/core';
import { PartyForm } from '@/components/party/party-form';

export default async function Page() {
  const ctx = await requireCtx({ office: true, module: 'suppliers', perm: 'suppliers' });
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/app/suppliers" title={t('p.addSupplier')} />
      <PartyForm kind="SUPPLIER" canSuppliers={ctx.can('suppliers')} isOwner={ctx.role === 'owner'} />
    </div>
  );
}
