'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { inr, lineAmount } from '@/lib/format';
import { Button, Badge } from '@/components/ui/core';
import { Segmented, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { recordCollection, recordDelivery } from '@/app/actions/ops';

export interface DeliveryLine { allocation_id: string; size: string; allocated_qty: number; rate: string }
type Method = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

function Stepper({ value, onChange, max, label }: { value: number; onChange: (n: number) => void; max: number; label: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex h-14 items-center rounded-2xl border border-line bg-white/80">
        <button type="button" aria-label="−" className="press flex h-full w-14 items-center justify-center" onClick={() => onChange(Math.max(0, value - 1))}><Minus className="h-5 w-5" /></button>
        <input inputMode="numeric" aria-label={label} value={String(value)} onChange={(e) => onChange(Math.min(max, Number(e.target.value.replace(/\D/g, '') || 0)))}
          className="tabular h-full min-w-0 flex-1 bg-transparent text-center text-xl font-semibold outline-none" />
        <button type="button" aria-label="+" className="press flex h-full w-14 items-center justify-center" onClick={() => onChange(Math.min(max, value + 1))}><Plus className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

/**
 * Delivery entry for one customer on a trip. Large controls for drivers; explicit
 * confirmation before saving because saving posts the customer's bill.
 */
export function DeliveryForm({ tripId, customer, lines, canOverride, onDone }: {
  tripId: string; customer: { id: string; name: string }; lines: DeliveryLine[]; canOverride: boolean; onDone?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [v, setV] = useState(() => lines.map((l) => ({ delivered: l.allocated_qty, returned: 0, damaged: 0, weight: '', rate: l.rate })));
  const [reason, setReason] = useState('');
  const [collect, setCollect] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [ref, setRef] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { pending, err, setErr, run } = useSubmit();

  const amounts = v.map((x) => (x.delivered > 0 ? lineAmount(x.weight || '0', x.rate || '0') ?? 0 : 0));
  const total = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  const delivered = v.reduce((s, x) => s + x.delivered, 0);
  const allocated = lines.reduce((s, l) => s + l.allocated_qty, 0);
  const status = delivered === 0 ? 'FAILED' : delivered === allocated ? 'DELIVERED' : 'PARTIAL';
  const set = (i: number, p: Partial<(typeof v)[number]>) => setV((xs) => xs.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, ...p };
    const max = lines[i].allocated_qty;
    // keep delivered + returned + damaged within the allocation
    if (n.delivered + n.returned + n.damaged > max) {
      if ('delivered' in p) { n.returned = Math.max(0, Math.min(n.returned, max - n.delivered)); n.damaged = Math.max(0, max - n.delivered - n.returned); }
      else n.delivered = Math.max(0, max - n.returned - n.damaged);
    }
    return n;
  }));

  const check = () => {
    setErr(null);
    for (let i = 0; i < v.length; i++) if (v[i].delivered > 0 && !(Number(v[i].weight) > 0)) return setErr(`${lines[i].size}: ${t('d.weight')} — ${t('err.required')}`);
    if (status !== 'DELIVERED' && reason.trim().length < 2) return setErr(t('d.reason') + ' — ' + t('err.required'));
    if (collect && !(Number(collect) > 0)) return setErr(t('err.positive'));
    setConfirm(true);
  };

  const save = () => run(
    () => recordDelivery(tripId, customer.id, {
      items: lines.map((l, i) => ({ allocation_id: l.allocation_id, delivered_qty: v[i].delivered, returned_qty: v[i].returned, damaged_qty: v[i].damaged,
        weight_kg: v[i].delivered > 0 ? v[i].weight : '', rate: v[i].rate !== l.rate ? v[i].rate : '' })),
      reason, notes: '', final_amount: '', adjustment_reason: '',
      collection: collect && Number(collect) > 0 ? { amount: collect, method, reference: ref } : undefined,
    }, key),
    (d) => { setConfirm(false); setResult(d); toast(t('d.saved')); router.refresh(); },
    () => { setConfirm(false); },
  );

  if (result) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-good" />
        <p className="mt-3 text-lg font-semibold">{t('d.saved')}</p>
        {result.bill_no && <p className="mt-1 text-ink-muted">{t('d.billCreated', { no: result.bill_no, amount: inr(result.bill_amount) })}</p>}
        {result.payment_status === 'PENDING_VERIFICATION' && <p className="mt-2"><Badge tone="warn">{t('d.pendingVerify')}</Badge></p>}
        <Button className="mt-5" onClick={onDone}>{t('c.done')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lines.map((l, i) => (
        <div key={l.allocation_id} className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">{l.size}</p>
            <p className="text-sm text-ink-muted">{t('d.allocated')}: <span className="font-semibold text-ink">{l.allocated_qty}</span></p>
          </div>
          <Stepper label={t('d.delivered')} value={v[i].delivered} max={l.allocated_qty} onChange={(n) => set(i, { delivered: n })} />
          <div className="grid grid-cols-2 gap-2">
            <Stepper label={t('d.returned')} value={v[i].returned} max={l.allocated_qty} onChange={(n) => set(i, { returned: n })} />
            <Stepper label={t('d.damaged')} value={v[i].damaged} max={l.allocated_qty} onChange={(n) => set(i, { damaged: n })} />
          </div>
          {v[i].delivered > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={t('d.weight')} inputMode="decimal" suffix="kg" value={v[i].weight} onChange={(e) => set(i, { weight: e.target.value })} className="text-lg" />
              <TextInput label={t('c.ratePerKg')} inputMode="decimal" prefix="₹" value={v[i].rate} readOnly={!canOverride} onChange={(e) => set(i, { rate: e.target.value })} />
            </div>
          )}
          <p className="tabular text-right text-sm text-ink-muted">{t('c.amount')}: <span className="font-semibold text-ink">{inr(amounts[i])}</span></p>
        </div>
      ))}

      <div className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
        <span className="text-ink-muted">{t('c.status')}</span>
        <Badge tone={status === 'DELIVERED' ? 'good' : status === 'PARTIAL' ? 'warn' : 'bad'}>{t(`d.s.${status}` as any)}</Badge>
      </div>
      {status !== 'DELIVERED' && <TextInput label={t('d.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />}

      <section className="rounded-[24px] bg-ink p-5 text-white">
        <p className="text-white/70">{t('b.amount')}</p>
        <p className="tabular text-[34px] font-semibold tracking-tight">{inr(total)}</p>
      </section>

      <div className="space-y-3">
        <p className="label">{t('d.collect')}</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {[{ l: t('d.collectNone'), v: '' }, ...(total > 0 ? [{ l: inr(total), v: total.toFixed(2) }] : [])].map((c) => (
            <button key={c.l} type="button" onClick={() => setCollect(c.v)} className={`press h-11 shrink-0 rounded-full px-5 text-[15px] font-medium ${collect === c.v ? 'bg-ink text-white' : 'border border-ink/15 bg-white/60'}`}>{c.l}</button>
          ))}
        </div>
        <TextInput inputMode="decimal" prefix="₹" value={collect} onChange={(e) => setCollect(e.target.value)} placeholder="0" aria-label={t('c.amount')} />
        {collect && Number(collect) > 0 && (
          <>
            <Segmented value={method} onChange={setMethod} options={(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as Method[]).map((m) => ({ value: m, label: t(`pay.m.${m}` as any) }))} />
            {method !== 'CASH' && <TextInput label={t('c.reference')} value={ref} onChange={(e) => setRef(e.target.value)} />}
          </>
        )}
      </div>

      <ErrorBox msg={err} />
      <Button size="lg" className="w-full" onClick={check} disabled={pending}>{t('d.record')}</Button>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t('d.confirmTitle')} locked={pending}
        footer={<><Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>{t('c.back')}</Button>
          <Button onClick={save} disabled={pending}>{pending ? t('c.saving') : t('c.confirm')}</Button></>}>
        <div className="space-y-2 text-[15px]">
          <p>{t('d.confirmText', { customer: customer.name })}</p>
          <ul className="divide-y divide-line rounded-2xl bg-white/80 px-4">
            {lines.map((l, i) => (
              <li key={l.allocation_id} className="tabular flex justify-between py-2"><span>{l.size} · {v[i].delivered}{v[i].delivered > 0 ? ` · ${v[i].weight} kg` : ''}</span><span>{inr(amounts[i])}</span></li>
            ))}
          </ul>
          <p className="tabular flex justify-between font-semibold"><span>{t('c.total')}</span><span>{inr(total)}</span></p>
          {collect && Number(collect) > 0 && <p className="tabular flex justify-between"><span>{t('d.collect')} ({t(`pay.m.${method}` as any)})</span><span>{inr(collect)}</span></p>}
        </div>
      </Sheet>
    </div>
  );
}

/** A later collection (customer paid after the delivery was saved). */
export function CollectionForm({ tripId, customerId, onDone }: { tripId: string; customerId: string; onDone?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [ref, setRef] = useState('');
  const { pending, err, run } = useSubmit();
  return (
    <div className="space-y-3">
      <TextInput label={t('c.amount')} inputMode="decimal" prefix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      <Segmented value={method} onChange={setMethod} options={(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as Method[]).map((m) => ({ value: m, label: t(`pay.m.${m}` as any) }))} />
      {method !== 'CASH' && <TextInput label={t('c.reference')} value={ref} onChange={(e) => setRef(e.target.value)} />}
      <ErrorBox msg={err} />
      <Button size="lg" className="w-full" disabled={pending || !(Number(amount) > 0)}
        onClick={() => run(() => recordCollection(tripId, customerId, { amount, method, reference: ref }, key), (d: any) => {
          toast(d.status === 'PENDING_VERIFICATION' ? t('d.pendingVerify') : t('pay.saved'));
          router.refresh(); onDone?.();
        })}>{pending ? t('c.saving') : t('pay.save')}</Button>
    </div>
  );
}
