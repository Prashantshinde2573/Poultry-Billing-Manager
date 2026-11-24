'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Pencil, Scale, Trash2, Truck, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { inr, num } from '@/lib/format';
import { Avatar, Badge, Button } from '@/components/ui/core';
import { SelectInput, Segmented, TextArea, TextInput } from '@/components/ui/fields';
import { usePerm } from '@/components/shell/perm';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { allocateToTrip, recordLoading, recordStockLoss, removeAllocation, reopenTrip, setTripStatus, settleTrip, updateTrip } from '@/app/actions/ops';
import { DELIVERY_TONE } from '@/lib/status';
import { CollectionForm, DeliveryForm, type DeliveryLine } from './delivery-form';

function useDone() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  return () => { toast(t('c.saved')); router.refresh(); };
}

/* ----------------------------------------------------------- status bar --- */
const NEXT: Record<string, string[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'], ASSIGNED: ['LOADING', 'DISPATCHED', 'CANCELLED'], LOADING: ['DISPATCHED'],
  DISPATCHED: ['IN_PROGRESS'], IN_PROGRESS: ['COMPLETED'],
};
const LABEL: Record<string, string> = { ASSIGNED: 'c.confirm', LOADING: 't.recordLoading', DISPATCHED: 't.dispatch', IN_PROGRESS: 't.start', COMPLETED: 't.complete', CANCELLED: 't.cancelTrip' };

export function TripStatusButtons({ tripId, status }: { tripId: string; status: string }) {
  const { t } = useI18n();
  const done = useDone();
  const { pending, err, run } = useSubmit();
  const next = (NEXT[status] ?? []).filter((s) => s !== 'LOADING');
  if (!next.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <Button key={s} variant={s === 'CANCELLED' ? 'outline' : 'ink'} disabled={pending} onClick={() => run(() => setTripStatus(tripId, s), done)}>
            {s === 'DISPATCHED' || s === 'IN_PROGRESS' ? <Truck className="h-5 w-5" /> : null}{t(LABEL[s] as any)}
          </Button>
        ))}
      </div>
      <ErrorBox msg={err} />
    </div>
  );
}

/* ------------------------------------------------------------- edit trip -- */
export function TripEditButton({ trip, drivers, vehicles }: {
  trip: { id: string; version: number; trip_date: string; driver_id: string | null; vehicle_id: string | null; notes: string | null };
  drivers: { id: string; name: string }[]; vehicles: { id: string; registration_no: string }[];
}) {
  const { t } = useI18n();
  const perm = usePerm();
  const done = useDone();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ trip_date: trip.trip_date, driver_id: trip.driver_id ?? '', vehicle_id: trip.vehicle_id ?? '', notes: trip.notes ?? '' });
  const { pending, err, run } = useSubmit();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('c.edit')} className="press rounded-full p-2 text-ink-muted hover:bg-ink/5"><Pencil className="h-5 w-5" /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('c.edit')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => run(() => updateTrip(trip.id, trip.version, f), () => { setOpen(false); done(); })}>{t('c.save')}</Button></>}>
        <div className="space-y-3">
          <TextInput type="date" label={t('c.date')} value={f.trip_date} onChange={(e) => setF({ ...f, trip_date: e.target.value })} />
          <SelectInput label={t('c.driver')} addNew={perm.owner ? { label: t('add.driver'), to: '/app/settings?add=driver' } : null} value={f.driver_id} onChange={(e) => setF({ ...f, driver_id: e.target.value })}>
            <option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectInput>
          <SelectInput label={t('c.vehicle')} addNew={perm.owner ? { label: t('add.vehicle'), to: '/app/settings?add=vehicle' } : null} value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}>
            <option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_no}</option>)}
          </SelectInput>
          <TextArea label={t('c.notes')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <ErrorBox msg={err} />
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------ allocation -- */
export interface OpenLine { order_item_id: string; order_no: string; customer: string; size: string; open: number; rate: string | null }

export function AllocateButton({ tripId, lines, canOverride }: { tripId: string; lines: OpenLine[]; canOverride: boolean }) {
  const { t } = useI18n();
  const done = useDone();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, { on: boolean; qty: string; rate: string }>>({});
  const { pending, err, run } = useSubmit();
  const byCustomer = lines.reduce<Record<string, OpenLine[]>>((m, l) => ((m[l.customer] ??= []).push(l), m), {});
  const chosen = Object.entries(sel).filter(([, v]) => v.on && Number(v.qty) > 0);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><PackagePlus className="h-5 w-5" /> {t('t.addOrders')}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('t.openOrders')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.cancel')}</Button>
          <Button disabled={pending || !chosen.length} onClick={() => run(
            () => allocateToTrip(tripId, chosen.map(([id, v]) => ({ order_item_id: id, qty: Number(v.qty), rate: v.rate }))),
            () => { setOpen(false); setSel({}); done(); })}>{t('t.allocate')} ({chosen.length})</Button></>}>
        {lines.length === 0 ? <p className="py-6 text-center text-ink-muted">{t('c.none')}</p> : (
          <div className="space-y-4">
            {Object.entries(byCustomer).map(([cust, ls]) => (
              <div key={cust}>
                <p className="mb-1 flex items-center gap-2 font-semibold"><Avatar name={cust} size={28} /> {cust}</p>
                <ul className="divide-y divide-line rounded-2xl bg-white/80 px-3">
                  {ls.map((l) => {
                    const s = sel[l.order_item_id] ?? { on: false, qty: String(l.open), rate: '' };
                    return (
                      <li key={l.order_item_id} className="flex items-center gap-2 py-2">
                        <input type="checkbox" className="h-5 w-5 accent-ink" checked={s.on} aria-label={l.size}
                          onChange={(e) => setSel({ ...sel, [l.order_item_id]: { ...s, on: e.target.checked } })} />
                        <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{l.size}</span> <span className="text-ink-muted">· {l.order_no} · {t('o.open')} {l.open}</span></span>
                        <input inputMode="numeric" aria-label={t('c.birds')} className="input h-10 w-20 px-2 text-center" value={s.qty}
                          onChange={(e) => setSel({ ...sel, [l.order_item_id]: { ...s, on: true, qty: e.target.value.replace(/\D/g, '') } })} />
                        {canOverride && <input inputMode="decimal" aria-label={t('c.ratePerKg')} placeholder={l.rate ?? '₹'} className="input h-10 w-20 px-2 text-center" value={s.rate}
                          onChange={(e) => setSel({ ...sel, [l.order_item_id]: { ...s, rate: e.target.value } })} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </Sheet>
    </>
  );
}

export function RemoveAllocation({ id }: { id: string }) {
  const { t } = useI18n();
  const done = useDone();
  const { pending, err, run } = useSubmit();
  return (
    <button type="button" aria-label={t('c.remove')} title={err ?? t('c.remove')} disabled={pending} onClick={() => run(() => removeAllocation(id), done)}
      className={`press rounded-full p-1.5 ${err ? 'text-bad' : 'text-ink-faint hover:text-bad'}`}><Trash2 className="h-4 w-4" /></button>
  );
}

/* --------------------------------------------------------------- loading -- */
export interface LoadRow { bird_size_id: string; size: string; allocated: number; loaded: number | null; loaded_weight: string | null }

export function LoadingButton({ tripId, rows, label }: { tripId: string; rows: LoadRow[]; label?: string }) {
  const { t } = useI18n();
  const done = useDone();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(() => rows.map((r) => ({ qty: String(r.loaded ?? r.allocated), w: r.loaded_weight ?? '' })));
  const { pending, err, run } = useSubmit();
  return (
    <>
      <Button variant="outline" size="lg" className="w-full" onClick={() => setOpen(true)}><Scale className="h-5 w-5" /> {label ?? t('t.recordLoading')}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('t.recordLoading')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => run(() => recordLoading(tripId, rows.map((r, i) => ({ bird_size_id: r.bird_size_id, loaded_qty: Number(v[i].qty || 0), loaded_weight: v[i].w }))),
            () => { setOpen(false); done(); })}>{t('c.save')}</Button></>}>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.bird_size_id} className="card p-4">
              <p className="mb-2 flex justify-between font-semibold"><span>{r.size}</span><span className="text-sm font-normal text-ink-muted">{t('d.allocated')} {r.allocated}</span></p>
              <div className="grid grid-cols-2 gap-2">
                <TextInput label={t('t.loaded')} inputMode="numeric" value={v[i].qty} onChange={(e) => setV(v.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} />
                <TextInput label={`${t('c.weight')} (${t('c.optional')})`} inputMode="decimal" suffix="kg" value={v[i].w} onChange={(e) => setV(v.map((x, j) => (j === i ? { ...x, w: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <ErrorBox msg={err} />
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------ customer delivery -- */
export interface TripCustomer {
  id: string; name: string; phone: string | null; lines: DeliveryLine[];
  delivery: { status: string; reason: string | null } | null; bill: string | null; collected: number; pending: number;
}

export function CustomerCard({ tripId, c, canDeliver, canCollect, canOverride, showMoney = true }: {
  tripId: string; c: TripCustomer; canDeliver: boolean; canCollect: boolean; canOverride: boolean; showMoney?: boolean;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'deliver' | 'collect' | null>(null);
  const st = c.delivery?.status ?? 'PENDING';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={c.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[17px] font-semibold">{c.name}</p>
          <p className="break-words text-sm text-ink-muted">{c.lines.map((l) => `${l.size} ${l.allocated_qty}`).join(' · ')}</p>
        </div>
        <Badge tone={DELIVERY_TONE[st]}>{t(`d.s.${st}` as any)}</Badge>
      </div>
      {c.delivery?.reason && <p className="mt-2 text-sm text-ink-muted">{c.delivery.reason}</p>}
      {(c.bill !== null || c.collected > 0) && showMoney && (
        <div className="tabular mt-3 grid grid-cols-2 gap-2 text-sm">
          {c.bill !== null && <p className="rounded-xl bg-mint px-3 py-2">{t('b.amount')}<br /><span className="text-base font-semibold">{inr(c.bill)}</span></p>}
          <p className="rounded-xl bg-mint px-3 py-2">{t('d.collect')}<br /><span className="text-base font-semibold">{inr(c.collected)}</span>{c.pending > 0 && <span className="ml-1 text-xs text-[#9A5E0B]">({t('s.pending')})</span>}</p>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {!c.delivery && canDeliver && <Button size="lg" className="flex-1" onClick={() => setMode('deliver')}>{t('d.record')}</Button>}
        {c.delivery && canCollect && <Button variant="outline" className="flex-1" onClick={() => setMode('collect')}><Wallet className="h-5 w-5" /> {t('d.collectLater')}</Button>}
      </div>
      <Sheet open={mode !== null} onClose={() => setMode(null)} title={`${mode === 'collect' ? t('d.collectLater') : t('d.record')} · ${c.name}`}>
        {mode === 'deliver' && <DeliveryForm tripId={tripId} customer={{ id: c.id, name: c.name }} lines={c.lines} canOverride={canOverride} onDone={() => setMode(null)} />}
        {mode === 'collect' && <CollectionForm tripId={tripId} customerId={c.id} onDone={() => setMode(null)} />}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------ settlement -- */
export function SettlementPanel({ tripId, pv, sizes }: { tripId: string; pv: any; sizes: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const done = useDone();
  const [cash, setCash] = useState(String(pv.cash_expected ?? '0'));
  const [note, setNote] = useState('');
  const [loss, setLoss] = useState<{ size: string; qty: string; kind: 'DEATH' | 'DAMAGE' | 'SHORTAGE'; note: string } | null>(null);
  const { pending, err, run } = useSubmit();
  const lossRun = useSubmit();
  const unaccounted = (pv.sizes as any[]).some((s) => s.unaccounted !== null && s.unaccounted !== 0);
  const cashDiff = Number(cash || 0) !== Number(pv.cash_expected);
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead className="text-ink-muted"><tr className="border-b border-line text-right">
            <th className="p-2.5 text-left font-medium">{t('c.size')}</th><th className="p-2.5 font-medium">{t('t.loaded')}</th><th className="p-2.5 font-medium">{t('o.delivered')}</th>
            <th className="p-2.5 font-medium">{t('d.returned')}</th><th className="p-2.5 font-medium">{t('d.damaged')}</th><th className="p-2.5 font-medium">{t('s.losses')}</th><th className="p-2.5 font-medium">{t('s.unaccounted')}</th></tr></thead>
          <tbody>
            {(pv.sizes as any[]).map((s) => (
              <tr key={s.bird_size_id} className="border-b border-line text-right last:border-0">
                <td className="p-2.5 text-left font-medium">{s.name}</td><td className="p-2.5">{s.loaded ?? '—'}</td><td className="p-2.5">{s.delivered}<span className="block text-xs text-ink-muted">{num(s.delivered_weight)} kg</span></td>
                <td className="p-2.5">{s.returned}</td><td className="p-2.5">{s.damaged}</td><td className="p-2.5">{s.losses_recorded}</td>
                <td className={`p-2.5 font-semibold ${s.unaccounted ? 'text-bad' : 'text-good'}`}>{s.unaccounted ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={() => setLoss({ size: sizes[0]?.id ?? '', qty: '', kind: 'DEATH', note: '' })}>{t('s.recordLoss')}</Button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[[t('s.sales'), pv.sales_amount], [t('s.reported'), pv.collections_reported], [t('s.verified'), pv.collections_verified], [t('s.pending'), pv.collections_pending],
          [t('s.cashExpected'), pv.cash_expected], [t('s.expenses'), pv.expenses_amount]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-white/70 p-3"><p className="text-xs text-ink-muted">{l}</p><p className="tabular font-semibold">{inr(v as string)}</p></div>
        ))}
      </div>
      {Number(pv.collections_pending) > 0 && <p className="rounded-2xl bg-[#FCF0DC] px-4 py-3 text-sm text-[#7A4A08]">{t('s.blockedPending')}</p>}
      <TextInput label={t('s.cashHandover')} inputMode="decimal" prefix="₹" value={cash} onChange={(e) => setCash(e.target.value)} />
      {(unaccounted || cashDiff) && <TextArea label={t('s.differenceNote')} value={note} onChange={(e) => setNote(e.target.value)} />}
      <ErrorBox msg={err} />
      <Button size="lg" className="w-full" disabled={pending} onClick={() => run(() => settleTrip(tripId, cash, note), done)}>{t('s.close')}</Button>

      <Sheet open={!!loss} onClose={() => setLoss(null)} title={t('s.recordLoss')}
        footer={<><Button variant="outline" onClick={() => setLoss(null)}>{t('c.cancel')}</Button>
          <Button disabled={lossRun.pending || !loss || !(Number(loss.qty) > 0) || loss.note.trim().length < 3}
            onClick={() => loss && lossRun.run(() => recordStockLoss(tripId, loss.size, Number(loss.qty), loss.kind, loss.note), () => { setLoss(null); done(); })}>{t('c.save')}</Button></>}>
        {loss && (
          <div className="space-y-3">
            <SelectInput label={t('c.size')} value={loss.size} onChange={(e) => setLoss({ ...loss, size: e.target.value })}>{sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>
            <Segmented value={loss.kind} onChange={(k) => setLoss({ ...loss, kind: k })} options={(['DEATH', 'DAMAGE', 'SHORTAGE'] as const).map((k) => ({ value: k, label: t(`s.loss.${k}`) }))} />
            <TextInput label={t('c.birds')} inputMode="numeric" value={loss.qty} onChange={(e) => setLoss({ ...loss, qty: e.target.value.replace(/\D/g, '') })} />
            <TextInput label={t('c.notes')} value={loss.note} onChange={(e) => setLoss({ ...loss, note: e.target.value })} />
            <ErrorBox msg={lossRun.err} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function ReopenTrip({ tripId }: { tripId: string }) {
  const { t } = useI18n();
  const done = useDone();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, err, run } = useSubmit();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>{t('t.reopen')}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('t.reopen')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.cancel')}</Button>
          <Button disabled={pending || reason.trim().length < 3} onClick={() => run(() => reopenTrip(tripId, reason), () => { setOpen(false); done(); })}>{t('t.reopen')}</Button></>}>
        <div className="space-y-3"><TextInput label={t('c.reason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /><ErrorBox msg={err} /></div>
      </Sheet>
    </>
  );
}
