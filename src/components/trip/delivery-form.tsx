'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MessageCircle, Minus, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { inr, lineAmount, num } from '@/lib/format';
import { Button } from '@/components/ui/core';
import { Segmented, TextInput } from '@/components/ui/fields';
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
 * Delivery for one customer: weigh, rate, bill. Shows today's bill + previous due = total,
 * takes any money paid, and ends with a bill the driver can send on WhatsApp.
 * Fewer / returned / dead birds are behind one link so the usual case stays short.
 */
export function DeliveryForm({ tripId, customer, lines, canOverride, onDone }: {
  tripId: string; customer: { id: string; name: string; phone?: string | null; balance?: number }; lines: DeliveryLine[]; canOverride: boolean; onDone?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const noRate = (l: DeliveryLine) => !(Number(l.rate) > 0);
  const [v, setV] = useState(() => lines.map((l) => ({ delivered: l.allocated_qty, returned: 0, damaged: 0, weight: '', rate: noRate(l) ? '' : l.rate })));
  const [fewer, setFewer] = useState(false);
  const [reason, setReason] = useState('');
  const [collect, setCollect] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [ref, setRef] = useState('');
  const [result, setResult] = useState<any>(null);
  const { pending, err, setErr, run } = useSubmit();

  const amounts = v.map((x) => (x.delivered > 0 ? lineAmount(x.weight || '0', x.rate || '0') ?? 0 : 0));
  const total = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  const kg = v.reduce((s, x) => s + (x.delivered > 0 ? Number(x.weight || 0) : 0), 0);
  // what was owed before this delivery (frozen: after saving, the refreshed balance includes today's bill)
  const [prev] = useState(() => Number(customer.balance ?? 0));
  const grand = Math.round((prev + total) * 100) / 100;
  const paid = Number(collect || 0);
  const delivered = v.reduce((s, x) => s + x.delivered, 0);
  const allocated = lines.reduce((s, l) => s + l.allocated_qty, 0);
  const status = delivered === 0 ? 'FAILED' : delivered === allocated ? 'DELIVERED' : 'PARTIAL';
  const set = (i: number, p: Partial<(typeof v)[number]>) => setV((xs) => xs.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, ...p };
    const max = lines[i].allocated_qty;
    if (n.delivered + n.returned + n.damaged > max) {
      if ('delivered' in p) { n.returned = Math.max(0, Math.min(n.returned, max - n.delivered)); n.damaged = Math.max(0, max - n.delivered - n.returned); }
      else n.delivered = Math.max(0, max - n.returned - n.damaged);
    }
    return n;
  }));

  const save = () => {
    setErr(null);
    for (let i = 0; i < v.length; i++) {
      if (v[i].delivered > 0 && !(Number(v[i].weight) > 0)) return setErr(`${lines[i].size}: ${t('d.weight')} — ${t('err.required')}`);
      if (v[i].delivered > 0 && !(Number(v[i].rate) > 0)) return setErr(`${lines[i].size}: ${t('c.ratePerKg')} — ${t('err.required')}`);
    }
    if (status !== 'DELIVERED' && reason.trim().length < 2) return setErr(t('d.reason') + ' — ' + t('err.required'));
    if (collect && !(paid > 0)) return setErr(t('err.positive'));
    const fill = lines.map((l, i) => (noRate(l) && v[i].delivered > 0 ? { allocation_id: l.allocation_id, rate: v[i].rate } : null)).filter(Boolean) as { allocation_id: string; rate: string }[];
    run(
      () => recordDelivery(tripId, customer.id, {
        items: lines.map((l, i) => ({ allocation_id: l.allocation_id, delivered_qty: v[i].delivered, returned_qty: v[i].returned, damaged_qty: v[i].damaged,
          weight_kg: v[i].delivered > 0 ? v[i].weight : '', rate: !noRate(l) && v[i].rate !== l.rate ? v[i].rate : '' })),
        reason, notes: '', final_amount: '', adjustment_reason: '',
        collection: paid > 0 ? { amount: collect, method, reference: ref } : undefined,
      }, key, fill),
      (d) => { setResult(d); toast(t('d.saved')); },
    );
  };

  const billText = () => [
    `*${customer.name}*`,
    ...lines.map((l, i) => v[i].delivered > 0 ? `${l.size}: ${v[i].delivered} ${t('c.birds')} · ${v[i].weight} kg × ₹${v[i].rate} = ${inr(amounts[i])}` : null).filter(Boolean),
    `${t('d.todayBill')}: ${inr(total)}`,
    `${t('d.prevDue')}: ${inr(prev)}`,
    `${t('d.totalDue')}: ${inr(grand)}`,
    ...(paid > 0 ? [`${t('d.collect')}: ${inr(paid)}`, `${t('d.leftDue')}: ${inr(grand - paid)}`] : []),
  ].join('\n');

  if (result) {
    const phone = (customer.phone ?? '').replace(/\D/g, '');
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center pt-2 text-center">
          <CheckCircle2 className="h-12 w-12 text-good" />
          <p className="mt-2 text-lg font-semibold">{t('d.saved')}</p>
        </div>
        <BillBox t={t} kg={kg} total={total} prev={prev} grand={grand} paid={paid} />
        {phone && (
          <a href={`https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(billText())}`} target="_blank" rel="noreferrer"
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#1FA855] text-[16px] font-semibold text-white">
            <MessageCircle className="h-5 w-5" /> {t('d.sendBill')}
          </a>
        )}
        <Button variant="outline" size="lg" className="w-full" onClick={onDone}>{t('c.done')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lines.map((l, i) => (
        <div key={l.allocation_id} className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-semibold">{l.size}</p>
            <p className="tabular text-[15px]"><span className="font-semibold">{v[i].delivered}</span> <span className="text-ink-muted">{t('c.birds')}</span></p>
          </div>
          {fewer && (
            <div className="space-y-2">
              <Stepper label={t('d.delivered')} value={v[i].delivered} max={l.allocated_qty} onChange={(n) => set(i, { delivered: n })} />
              <div className="grid grid-cols-2 gap-2">
                <Stepper label={t('d.returned')} value={v[i].returned} max={l.allocated_qty} onChange={(n) => set(i, { returned: n })} />
                <Stepper label={t('d.damaged')} value={v[i].damaged} max={l.allocated_qty} onChange={(n) => set(i, { damaged: n })} />
              </div>
            </div>
          )}
          {v[i].delivered > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={t('d.weight')} inputMode="decimal" suffix="kg" value={v[i].weight} onChange={(e) => set(i, { weight: e.target.value.replace(/[^\d.]/g, '') })} className="text-lg" />
              <TextInput label={t('c.ratePerKg')} inputMode="decimal" prefix="₹" value={v[i].rate} readOnly={!canOverride && !noRate(l)}
                onChange={(e) => set(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
          )}
          {v[i].delivered > 0 && <p className="tabular text-right text-[15px]">{inr(amounts[i])}</p>}
        </div>
      ))}

      {!fewer && <button type="button" onClick={() => setFewer(true)} className="press w-full text-center text-[15px] font-medium text-aqua-deep">{t('d.fewer')}</button>}
      {status !== 'DELIVERED' && <TextInput label={t('d.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />}

      <BillBox t={t} kg={kg} total={total} prev={prev} grand={grand} />

      <div className="space-y-3">
        <p className="label">{t('d.collect')}</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {[{ l: t('d.collectNone'), v: '' }, ...(total > 0 ? [{ l: inr(total, { decimals: false }), v: total.toFixed(2) }] : []), ...(grand > total && grand > 0 ? [{ l: inr(grand, { decimals: false }), v: grand.toFixed(2) }] : [])].map((c) => (
            <button key={c.l + c.v} type="button" onClick={() => setCollect(c.v)} className={`press h-11 shrink-0 rounded-full px-5 text-[15px] font-medium ${collect === c.v ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{c.l}</button>
          ))}
        </div>
        <TextInput inputMode="decimal" prefix="₹" value={collect} onChange={(e) => setCollect(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" aria-label={t('c.amount')} />
        {paid > 0 && (
          <>
            <Segmented value={method} onChange={setMethod} options={(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as Method[]).map((m) => ({ value: m, label: t(`pay.m.${m}` as any) }))} />
            {method !== 'CASH' && <TextInput label={t('c.reference')} value={ref} onChange={(e) => setRef(e.target.value)} />}
          </>
        )}
      </div>

      <ErrorBox msg={err} />
      <Button size="lg" className="w-full" onClick={save} disabled={pending}>{pending ? t('c.saving') : t('d.makeBill')}</Button>
    </div>
  );
}

function BillBox({ t, kg, total, prev, grand, paid }: { t: (k: any, p?: any) => string; kg: number; total: number; prev: number; grand: number; paid?: number }) {
  const row = (l: string, v: string, strong = false) => (
    <div className={`tabular flex items-baseline justify-between gap-3 ${strong ? 'border-t border-white/15 pt-2 text-[20px] font-semibold' : 'text-[15px] text-white/80'}`}><span>{l}</span><span className={strong ? '' : 'text-white'}>{v}</span></div>
  );
  return (
    <section className="space-y-2 rounded-[22px] bg-ink p-5 text-white">
      {row(t('d.todayWeight'), `${num(kg)} kg`)}
      {row(t('d.todayBill'), inr(total))}
      {row(t('d.prevDue'), inr(prev))}
      {row(t('d.totalDue'), inr(grand), true)}
      {paid != null && paid > 0 && <>{row(t('d.collect'), inr(paid))}{row(t('d.leftDue'), inr(grand - paid), true)}</>}
    </section>
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
          toast(d.status === 'PENDING_VERIFICATION' ? t('d.pendingVerify') : t('pay.saved')); onDone?.();
        })}>{pending ? t('c.saving') : t('pay.save')}</Button>
    </div>
  );
}
