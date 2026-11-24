'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { inr } from '@/lib/format';
import { Avatar, Button, IconCircle } from '@/components/ui/core';
import { AmountPad } from '@/components/ui/keypad';
import { Segmented, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { recordPayment } from '@/app/actions/money';
import type { PartyOpt } from '@/lib/data/queries';
import { PartyPicker } from './party-picker';

type Method = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

/** Reference "Send money" screen: party avatars, big amount, chips, keypad, dark Send button. */
export function PaymentForm({ customers, suppliers, initialDir, initialParty, today }: {
  customers: PartyOpt[]; suppliers: PartyOpt[] | null; initialDir: 'IN' | 'OUT'; initialParty: string; today: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [dir, setDir] = useState<'IN' | 'OUT'>(suppliers ? initialDir : 'IN');
  const parties = dir === 'IN' ? customers : suppliers ?? [];
  const [party, setParty] = useState(initialParty);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'amount' | 'details'>('amount');
  const [over, setOver] = useState<{ due: string; extra: string } | null>(null);
  const { pending, err, setErr, run } = useSubmit();
  const sel = parties.find((p) => p.id === party);
  const due = Math.max(Number(sel?.balance ?? 0), 0);
  const recent = useMemo(() => parties.filter((p) => Number(p.balance) > 0).slice(0, 8), [parties]);

  const save = (confirm = false) => run(
    () => recordPayment({ party_id: party, direction: dir, amount, method, reference: ref, payment_date: date, notes, confirm_overpayment: confirm }, key),
    (d) => {
      toast(`${t('pay.saved')} · ${t('b.balanceNow')} ${inr(d.balance)}`);
      router.replace(dir === 'IN' ? `/app/customers/${party}` : `/app/suppliers/${party}?ledger=PAYABLE`);
      router.refresh();
    },
    (r) => {
      if (r.code === 'OVERPAYMENT_CONFIRMATION_REQUIRED') { setOver({ due: String(r.extra?.outstanding ?? due), extra: String(r.extra?.excess ?? '') }); return true; }
    },
  );

  const chips = [
    ...(due > 0 ? [{ label: `${t('pay.fullDue')} ${inr(due, { decimals: false })}`, value: due.toFixed(2).replace(/\.00$/, '') }] : []),
    { label: '₹500', value: '500' }, { label: '₹1,000', value: '1000' }, { label: '₹5,000', value: '5000' }, { label: '₹10,000', value: '10000' },
  ];

  if (step === 'details') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <header className="mb-2 flex items-center gap-3">
          <button type="button" aria-label={t('c.back')} onClick={() => setStep('amount')} className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/70"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="flex-1 text-center text-[22px] font-semibold">{dir === 'IN' ? t('pay.receive') : t('pay.paySupplier')}</h1><span className="w-12" />
        </header>
        <div className="card flex items-center gap-3 p-4">
          {sel && <Avatar name={sel.name} size={48} />}
          <div className="min-w-0 flex-1"><p className="break-words font-semibold">{sel?.name}</p><p className="text-sm text-ink-muted">{t('pay.outstanding')}: {inr(sel?.balance)}</p></div>
          <p className="tabular text-2xl font-semibold">{inr(amount)}</p>
        </div>
        <div><p className="label">{t('c.method')}</p>
          <Segmented value={method} onChange={setMethod} options={(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as Method[]).map((m) => ({ value: m, label: t(`pay.m.${m}` as any) }))} /></div>
        {method !== 'CASH' && <TextInput label={t('c.reference')} value={ref} onChange={(e) => setRef(e.target.value)} />}
        <TextInput type="date" label={t('c.date')} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        <TextInput label={`${t('c.notes')} (${t('c.optional')})`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <ErrorBox msg={err} />
        <Button size="lg" className="w-full" disabled={pending} onClick={() => save(false)}>{pending ? t('c.saving') : t('pay.save')}</Button>
        <Sheet open={!!over} onClose={() => setOver(null)} title={t('err.OVERPAYMENT_CONFIRMATION_REQUIRED')}
          footer={<><Button variant="outline" onClick={() => setOver(null)}>{t('c.cancel')}</Button>
            <Button disabled={pending} onClick={() => { setOver(null); save(true); }}>{t('c.confirm')}</Button></>}>
          <p>{t('pay.over', { due: inr(over?.due), extra: inr(over?.extra) })}</p>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="flex items-center gap-3">
        <IconCircle href={dir === 'IN' ? '/app/payments' : '/app/payments?tab=out'} label={t('c.back')}><ArrowLeft className="h-5 w-5" /></IconCircle>
        <h1 className="flex-1 text-center text-[22px] font-semibold">{dir === 'IN' ? t('pay.receive') : t('pay.paySupplier')}</h1><span className="w-12" />
      </header>
      {suppliers && (
        <Segmented value={dir} onChange={(d) => { setDir(d); setParty(''); }} options={[{ value: 'IN', label: t('pay.in') }, { value: 'OUT', label: t('pay.out') }]} />
      )}
      {recent.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {recent.map((p) => (
            <button key={p.id} type="button" onClick={() => setParty(p.id)} className="press flex w-16 shrink-0 flex-col items-center gap-1.5">
              <Avatar name={p.name} size={60} ring={party === p.id} />
              <span className="w-full truncate text-center text-xs">{p.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}
      <PartyPicker parties={parties} value={party} onChange={setParty} label={dir === 'IN' ? t('c.customer') : t('c.supplier')} />
      <AmountPad value={amount} onChange={setAmount} chips={chips} />
      <ErrorBox msg={err} />
      <Button size="lg" className="h-16 w-full rounded-[22px] text-lg" disabled={!party || !(Number(amount) > 0)}
        onClick={() => { setErr(null); setStep('details'); }}>{t('c.next')}</Button>
    </div>
  );
}
