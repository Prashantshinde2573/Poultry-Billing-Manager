'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { inr, lineAmount } from '@/lib/format';
import { Button } from '@/components/ui/core';
import { SelectInput, TextArea, TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { createDirectBill, createPurchase } from '@/app/actions/money';
import type { PartyOpt, SizeOpt } from '@/lib/data/queries';
import { PartyPicker } from './party-picker';

interface Line { k: number; bird_size_id: string; qty: string; weight_kg: string; rate: string }

/**
 * Multi-line size entry used for a counter bill (sale) and a supplier purchase.
 * The amount shown is computed with the same rounding the database uses.
 */
export function DocForm({ kind, parties, sizes, trips = [], initialParty = '', today, canOverride }: {
  kind: 'BILL' | 'PURCHASE'; parties: PartyOpt[]; sizes: SizeOpt[]; trips?: { id: string; trip_no: string }[];
  initialParty?: string; today: string; canOverride: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [party, setParty] = useState(initialParty);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [vehicleRef, setVehicleRef] = useState('');
  const [trip, setTrip] = useState('');
  const [override, setOverride] = useState(false);
  const [final, setFinal] = useState('');
  const [reason, setReason] = useState('');
  const seq = useMemo(() => ({ n: 1 }), []);
  const defaultRate = (sizeId: string, partyId = party) =>
    parties.find((p) => p.id === partyId)?.rate ?? sizes.find((s) => s.id === sizeId)?.rate ?? '';
  const [lines, setLines] = useState<Line[]>(() => [{ k: 0, bird_size_id: sizes[0]?.id ?? '', qty: '', weight_kg: '', rate: sizes[0] ? (parties.find((p) => p.id === initialParty)?.rate ?? sizes[0].rate ?? '') : '' }]);
  const { pending, err, setErr, run } = useSubmit();

  const amounts = lines.map((l) => lineAmount(l.weight_kg || '0', l.rate || '0') ?? 0);
  const calc = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  const upd = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...patch } : l)));

  const pickParty = (id: string) => {
    setParty(id);
    // refresh rates that still hold the previous default
    setLines((ls) => ls.map((l) => (l.rate === '' || l.rate === defaultRate(l.bird_size_id) ? { ...l, rate: defaultRate(l.bird_size_id, id) ?? '' } : l)));
  };

  const submit = () => {
    if (!party) return setErr(t('err.required') + ': ' + (kind === 'BILL' ? t('c.customer') : t('c.supplier')));
    const items = lines.map((l) => ({ bird_size_id: l.bird_size_id, qty: l.qty || '0', weight_kg: l.weight_kg, rate: l.rate }));
    const common = { notes, final_amount: override ? final : '', adjustment_reason: override ? reason : '', items };
    run(
      () => kind === 'BILL'
        ? createDirectBill({ ...common, customer_id: party, bill_date: date }, key)
        : createPurchase({ ...common, supplier_id: party, purchase_date: date, vehicle_ref: vehicleRef, trip_id: trip }, key),
      (d: any) => {
        toast(kind === 'BILL' ? t('b.saved', { no: d.bill_no }) : t('pu.saved', { no: d.purchase_no }));
        router.replace(kind === 'BILL' ? `/app/customers/${party}` : `/app/suppliers/${party}`);
        router.refresh();
      },
    );
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <PartyPicker parties={parties} value={party} onChange={pickParty} label={kind === 'BILL' ? t('c.customer') : t('c.supplier')} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput type="date" label={t('c.date')} value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        {kind === 'PURCHASE' && <TextInput label={t('pu.vehicleRef')} value={vehicleRef} onChange={(e) => setVehicleRef(e.target.value)} />}
      </div>
      {kind === 'PURCHASE' && trips.length > 0 && (
        <SelectInput label={`${t('c.trip')} (${t('c.optional')})`} value={trip} onChange={(e) => setTrip(e.target.value)}>
          <option value="">—</option>
          {trips.map((x) => <option key={x.id} value={x.id}>{x.trip_no}</option>)}
        </SelectInput>
      )}

      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={l.k} className="card space-y-3 p-4">
            <div className="flex items-end gap-2">
              <SelectInput className="flex-1" label={t('c.size')} value={l.bird_size_id}
                onChange={(e) => upd(l.k, { bird_size_id: e.target.value, rate: l.rate === '' || l.rate === defaultRate(l.bird_size_id) ? defaultRate(e.target.value) ?? '' : l.rate })}>
                {kind === 'BILL' && <option value="">—</option>}
                {sizes.map((s) => <option key={s.id} value={s.id}>{localName(s, locale)}</option>)}
              </SelectInput>
              {lines.length > 1 && (
                <button type="button" aria-label={t('c.remove')} onClick={() => setLines((ls) => ls.filter((x) => x.k !== l.k))} className="press mb-1 rounded-full p-2.5 text-bad hover:bg-bad/10"><Trash2 className="h-5 w-5" /></button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TextInput label={t('c.birds')} inputMode="numeric" value={l.qty} onChange={(e) => upd(l.k, { qty: e.target.value.replace(/\D/g, '') })} />
              <TextInput label={t('c.weight')} inputMode="decimal" suffix="kg" value={l.weight_kg} onChange={(e) => upd(l.k, { weight_kg: e.target.value })} required />
              <TextInput label={t('c.ratePerKg')} inputMode="decimal" prefix="₹" value={l.rate} onChange={(e) => upd(l.k, { rate: e.target.value })} required />
            </div>
            <p className="tabular text-right text-sm text-ink-muted">#{i + 1} · <span className="font-semibold text-ink">{inr(amounts[i])}</span></p>
          </div>
        ))}
        {lines.length < 20 && (
          <Button variant="outline" className="w-full" onClick={() => { const k = seq.n++; const s = sizes[Math.min(lines.length, sizes.length - 1)]?.id ?? ''; setLines((ls) => [...ls, { k, bird_size_id: s, qty: '', weight_kg: '', rate: defaultRate(s) ?? '' }]); }}>
            <Plus className="h-5 w-5" /> {t('c.addLine')}
          </Button>
        )}
      </div>

      <section className="rounded-[24px] bg-ink p-5 text-white">
        <div className="flex items-center justify-between text-white/70"><span>{t('c.calculated')}</span><span className="tabular">{inr(calc)}</span></div>
        <p className="tabular mt-1 text-[34px] font-semibold tracking-tight">{inr(override && final ? Number(final) : calc)}</p>
        {canOverride && (
          <label className="mt-3 flex items-center gap-2 text-sm text-white/85">
            <input type="checkbox" className="h-4 w-4 accent-aqua" checked={override} onChange={(e) => { setOverride(e.target.checked); setFinal(calc.toFixed(2)); }} />
            {t('c.final')}
          </label>
        )}
      </section>
      {override && (
        <div className="grid gap-3">
          <TextInput label={t('c.final')} inputMode="decimal" prefix="₹" value={final} onChange={(e) => setFinal(e.target.value)} required />
          <TextInput label={t('b.adjReason')} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        </div>
      )}
      <TextArea label={t('c.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorBox msg={err} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('c.save')}</Button>
    </form>
  );
}
