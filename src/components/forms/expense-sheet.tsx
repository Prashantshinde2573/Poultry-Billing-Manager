'use client';
import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { Button } from '@/components/ui/core';
import { SelectInput, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { createExpense } from '@/app/actions/money';

type Cat = { id: string; name: string; name_mr: string | null; name_hi: string | null; is_trip_cost: boolean; active: boolean };

export function ExpenseSheet({ cats, trips, today, startOpen, startTrip }: {
  cats: Cat[]; trips: { id: string; trip_no: string }[]; today: string; startOpen: boolean; startTrip: string;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(startOpen);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const active = useMemo(() => cats.filter((c) => c.active), [cats]);
  const blank = () => ({ expense_date: today, category_id: active[0]?.id ?? '', amount: '', trip_id: startTrip, note: '' });
  const [f, setF] = useState(blank);
  const [dup, setDup] = useState(false);
  const { pending, err, run } = useSubmit();
  const close = () => { setOpen(false); if (startOpen) router.replace(path); };
  const save = (confirm: boolean) => run(() => createExpense({ ...f, confirm_duplicate: confirm }, key), () => {
    toast(t('e.saved')); setF(blank()); setKey(crypto.randomUUID()); setDup(false); close(); router.refresh();
  }, (r) => { if (r.code === 'POSSIBLE_DUPLICATE') { setDup(true); return true; } });
  return (
    <>
      <button type="button" aria-label={t('e.add')} onClick={() => setOpen(true)} className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white"><Plus className="h-5 w-5" /></button>
      <Sheet open={open} onClose={close} title={t('e.add')}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending || !(Number(f.amount) > 0) || !f.category_id} onClick={() => save(false)}>{pending ? t('c.saving') : t('c.save')}</Button></>}>
        <div className="space-y-3">
          <TextInput label={t('c.amount')} inputMode="decimal" prefix="₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus className="text-lg" />
          <div className="grid grid-cols-2 gap-2">
            <SelectInput label={t('e.category')} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              {active.map((c) => <option key={c.id} value={c.id}>{localName(c, locale)}</option>)}
            </SelectInput>
            <TextInput type="date" label={t('c.date')} value={f.expense_date} max={today} onChange={(e) => setF({ ...f, expense_date: e.target.value })} />
          </div>
          <SelectInput label={t('e.tripOptional')} value={f.trip_id} onChange={(e) => setF({ ...f, trip_id: e.target.value })}>
            <option value="">—</option>{trips.map((x) => <option key={x.id} value={x.id}>{x.trip_no}</option>)}
          </SelectInput>
          <TextInput label={t('c.notes')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          {dup && (
            <div className="rounded-2xl bg-[#FCF0DC] p-4 text-sm text-[#7A4A08]">
              <p>{t('e.dup')}</p>
              <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => save(true)}>{t('p.saveAnyway')}</Button>
            </div>
          )}
          <ErrorBox msg={err} />
        </div>
      </Sheet>
    </>
  );
}
