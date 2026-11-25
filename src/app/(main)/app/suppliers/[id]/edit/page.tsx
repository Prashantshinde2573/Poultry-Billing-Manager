import { notFound } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/core';
import { PartyForm } from '@/components/party/party-form';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx({ office: true, module: 'suppliers', perm: 'suppliers' });
  const { t } = await getT();
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from('parties').select('*, customers(customer_type, default_rate, opening_receivable), suppliers(default_purchase_rate, opening_payable)').eq('id', id).maybeSingle();
  if (!p) notFound();
  const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
  const s = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back={`/app/suppliers/${id}`} title={t('p.editParty')} />
      <PartyForm kind="SUPPLIER" canSuppliers={ctx.can('suppliers')} isOwner={ctx.role === 'owner'} initial={{
        id: p.id, version: p.version, name: p.name, phone: p.phone, address: p.address, notes: p.notes,
        is_customer: p.is_customer, is_supplier: p.is_supplier, customer_type: c?.customer_type, default_rate: c?.default_rate ?? '',
        default_purchase_rate: s?.default_purchase_rate ?? '', opening_receivable: c ? String(c.opening_receivable) : '', opening_payable: s ? String(s.opening_payable) : '',
      }} />
    </div>
  );
}
