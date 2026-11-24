'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { Button } from '@/components/ui/core';
import { SelectInput, TextArea, TextInput } from '@/components/ui/fields';
import { usePerm, nav } from '@/components/shell/perm';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { createOrder } from '@/app/actions/ops';
import type { PartyOpt, SizeOpt } from '@/lib/data/queries';
import { PartyPicker } from './party-picker';

interface Line { k: number; bird_size_id: string; qty: string; expected_weight: string; rate: string }

export function OrderForm({ parties, sizes, initialParty = '', today }: { parties: PartyOpt[]; sizes: SizeOpt[]; initialParty?: string; today: string }) {
  const { t, locale } = useI18n();
  const perm = usePerm();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [party, setParty] = useState(initialParty);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>(() => sizes.slice(0, 1).map((s, i) => ({ k: i, bird_size_id: s.id, qty: '', expected_weight: '', rate: '' })));
  const { pending, err, setErr, run } = useSubmit();
  const used = new Set(lines.map((l) => l.bird_size_id));
  const upd = (k: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));

  const submit = (draft: boolean) => {
    if (!party) return setErr(t('err.required') + ': ' + t('c.customer'));
    const items = lines.filter((l) => l.qty).map((l) => ({ bird_size_id: l.bird_size_id, qty: Number(l.qty), expected_weight: l.expected_weight, rate: l.rate }));
    if (!items.length) return setErr(t('err.required') + ': ' + t('c.birds'));
    run(() => createOrder({ customer_id: party, order_date: date, notes, draft, items }, key), (d) => {
      toast(t('o.saved', { no: d.order_no }));
      nav(router, 'replace', `/app/orders/${d.id}`);
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <PartyPicker parties={parties} value={party} onChange={setParty} label={t('c.customer')} add={{ kind: 'CUSTOMER', as: 'customer' }} />
      <TextInput type="date" label={t('c.date')} value={date} onChange={(e) => setDate(e.target.value)} required />
      {lines.map((l) => (
        <div key={l.k} className="card flex items-end gap-2 p-4">
          <SelectInput className="min-w-0 flex-1" label={t('c.size')} addNew={perm.owner ? { label: t('add.size'), to: '/app/settings?add=size' } : null} value={l.bird_size_id} onChange={(e) => upd(l.k, { bird_size_id: e.target.value })}>
            {sizes.filter((x) => x.id === l.bird_size_id || !used.has(x.id)).map((x) => <option key={x.id} value={x.id}>{localName(x, locale)}</option>)}
          </SelectInput>
          <TextInput className="w-28" label={t('c.birds')} inputMode="numeric" value={l.qty} onChange={(e) => upd(l.k, { qty: e.target.value.replace(/\D/g, '') })} required />
          {lines.length > 1 && <button type="button" aria-label={t('c.remove')} onClick={() => setLines((ls) => ls.filter((x) => x.k !== l.k))} className="press mb-1 rounded-full p-2.5 text-bad hover:bg-bad/10"><Trash2 className="h-5 w-5" /></button>}
        </div>
      ))}
      {lines.length < sizes.length && (
        <Button variant="outline" className="w-full" onClick={() => { const s = sizes.find((x) => !used.has(x.id)); if (s) setLines((ls) => [...ls, { k: Date.now(), bird_size_id: s.id, qty: '', expected_weight: '', rate: '' }]); }}>
          <Plus className="h-5 w-5" /> {t('c.addLine')}
        </Button>
      )}
      <TextArea label={t('c.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorBox msg={err} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" disabled={pending} onClick={() => submit(true)}>{t('o.saveDraft')}</Button>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t('c.saving') : t('c.save')}</Button>
      </div>
    </form>
  );
}
