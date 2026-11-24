import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/core';
import { PartyForm } from '@/components/party/party-form';

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; as?: string; name?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx({ office: true, module: 'suppliers', perm: 'suppliers' });
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back={sp.next?.startsWith('/app/') ? sp.next : '/app/suppliers'} title={t('p.addSupplier')} />
      <PartyForm kind="SUPPLIER" next={sp.next} as={sp.as} initial={sp.name ? { name: sp.name.slice(0, 80) } : undefined} canSuppliers={ctx.can('suppliers')} isOwner={ctx.role === 'owner'} />
    </div>
  );
}
