'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { TextInput, SelectInput, TextArea } from '@/components/ui/fields';
import { Button } from '@/components/ui/core';
import { useToast } from '@/components/ui/toast';
import { createParty, updateParty } from '@/app/actions/parties';
import { errorKey } from '@/lib/errors';
import { safeNext, nav } from '@/components/shell/perm';

type Kind = 'CUSTOMER' | 'SUPPLIER';
export interface PartyFormInitial {
  id?: string; version?: number; name?: string; phone?: string | null; address?: string | null; notes?: string | null;
  is_customer?: boolean; is_supplier?: boolean; customer_type?: string | null; default_rate?: string | null; default_purchase_rate?: string | null;
  opening_receivable?: string | null; opening_payable?: string | null;
}

export function PartyForm({ kind, initial, canSuppliers, isOwner, next, as }: { kind: Kind; initial?: PartyFormInitial; canSuppliers: boolean; isOwner: boolean; next?: string | null; as?: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const editing = !!initial?.id;
  const key = useMemo(() => crypto.randomUUID(), []);
  const [f, setF] = useState({
    name: initial?.name ?? '', phone: initial?.phone ?? '', address: initial?.address ?? '', notes: initial?.notes ?? '',
    is_customer: initial?.is_customer ?? kind === 'CUSTOMER', is_supplier: initial?.is_supplier ?? kind === 'SUPPLIER',
    customer_type: initial?.customer_type ?? 'TRADER', default_rate: initial?.default_rate ?? '', default_purchase_rate: initial?.default_purchase_rate ?? '',
    opening_receivable: initial?.opening_receivable ?? '', opening_payable: initial?.opening_payable ?? '',
  });
  const [dups, setDups] = useState<{ name: string; phone: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (allowDuplicate = false) => start(async () => {
    setErr(null);
    const payload = {
      ...f, phone: f.phone ?? '', allow_duplicate: allowDuplicate,
      customer_type: f.is_customer ? (f.customer_type as any) : undefined,
      default_rate: f.is_customer ? f.default_rate ?? '' : undefined,
      default_purchase_rate: f.is_supplier ? f.default_purchase_rate ?? '' : undefined,
      opening_receivable: f.is_customer ? f.opening_receivable ?? '' : undefined,
      opening_payable: f.is_supplier ? f.opening_payable ?? '' : undefined,
    };
    const r = editing ? await updateParty(initial!.id!, initial!.version!, payload) : await createParty(payload, key);
    if (!r.ok) {
      if (r.code === 'DUPLICATE_PARTY') { setDups((r.extra?.matches as any[]) ?? []); return; }
      setErr(t(errorKey(r.code), { detail: r.detail }));
      return;
    }
    toast(t('c.saved'));
    const id = editing ? initial!.id : (r.data as any).id;
    const back = !editing ? safeNext(next) : null;
    if (back) {
      const u = new URL(back, location.origin);
      if (as && /^[a-z_]{2,20}$/.test(as)) u.searchParams.set(as, id!);
      nav(router, 'replace', u.pathname + u.search);
    } else nav(router, 'replace', `/app/${kind === 'CUSTOMER' ? 'customers' : 'suppliers'}/${id}`);
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <TextInput label={t('c.name')} value={f.name} onChange={set('name')} required minLength={2} autoComplete="off" />
      <TextInput label={t('c.phone')} value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" placeholder="98765 43210" />
      <TextInput label={t('c.address')} value={f.address ?? ''} onChange={set('address')} />
      {f.is_customer && (
        <div className="grid grid-cols-2 gap-3">
          <SelectInput label={t('p.type')} value={f.customer_type ?? 'TRADER'} onChange={set('customer_type')}>
            {['TRADER', 'RETAILER', 'HOTEL', 'SHOP', 'OTHER'].map((x) => <option key={x} value={x}>{t(`p.type.${x}` as any)}</option>)}
          </SelectInput>
          <TextInput label={t('p.defaultRate')} value={f.default_rate ?? ''} onChange={set('default_rate')} inputMode="decimal" prefix="₹" />
        </div>
      )}
      {f.is_customer && (
        <TextInput label={t('p.openingReceivable')} value={f.opening_receivable ?? ''} onChange={set('opening_receivable')} inputMode="decimal" prefix="₹"
          disabled={editing && !isOwner} hint={t('p.openingHint')} />
      )}
      {f.is_supplier && canSuppliers && (
        <>
          <TextInput label={t('p.defaultPurchaseRate')} value={f.default_purchase_rate ?? ''} onChange={set('default_purchase_rate')} inputMode="decimal" prefix="₹" />
          <TextInput label={t('p.openingPayable')} value={f.opening_payable ?? ''} onChange={set('opening_payable')} inputMode="decimal" prefix="₹" disabled={editing && !isOwner} />
        </>
      )}
      {canSuppliers && (
        <label className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-ink" checked={kind === 'CUSTOMER' ? f.is_supplier : f.is_customer}
            disabled={editing && (kind === 'CUSTOMER' ? initial?.is_supplier : initial?.is_customer)}
            onChange={(e) => setF(kind === 'CUSTOMER' ? { ...f, is_supplier: e.target.checked } : { ...f, is_customer: e.target.checked })} />
          {kind === 'CUSTOMER' ? t('p.alsoSupplier') : t('p.alsoCustomer')}
        </label>
      )}
      <TextArea label={t('c.notes')} value={f.notes ?? ''} onChange={set('notes')} />
      {dups && (
        <div className="rounded-2xl bg-[#FCF0DC] p-4 text-sm text-[#7A4A08]">
          <p className="font-medium">{t('p.duplicate')}</p>
          <ul className="mt-1 list-disc pl-5">{dups.map((d, i) => <li key={i}>{d.name} · {d.phone}</li>)}</ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => submit(true)} disabled={pending}>{t('p.saveAnyway')}</Button>
        </div>
      )}
      {err && <p className="rounded-2xl bg-[#FCE7E3] px-4 py-3 text-sm text-bad" role="alert">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('c.save')}</Button>
    </form>
  );
}
