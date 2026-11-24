'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { SelectInput, TextArea, TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { createTrip } from '@/app/actions/ops';
import { safeNext, usePerm, nav } from '@/components/shell/perm';

export function TripNewForm({ drivers, vehicles, today }: { drivers: { id: string; name: string }[]; vehicles: { id: string; registration_no: string; ownership: string }[]; today: string }) {
  const { t } = useI18n();
  const perm = usePerm();
  const toast = useToast();
  const router = useRouter();
  const key = useMemo(() => crypto.randomUUID(), []);
  const [f, setF] = useState({ trip_date: today, driver_id: drivers[0]?.id ?? '', vehicle_id: vehicles[0]?.id ?? '', notes: '' });
  const { pending, err, run } = useSubmit();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => createTrip(f, key), (d) => { toast(t('t.saved', { no: d.trip_no })); const back = safeNext(new URLSearchParams(location.search).get('next')); nav(router, 'replace', back ?? `/app/trips/${d.id}`); }); }}>
      <TextInput type="date" label={t('c.date')} value={f.trip_date} onChange={(e) => setF({ ...f, trip_date: e.target.value })} required />
      <SelectInput label={t('c.driver')} addNew={perm.owner ? { label: t('add.driver'), to: '/app/settings?add=driver' } : null} value={f.driver_id} onChange={(e) => setF({ ...f, driver_id: e.target.value })}>
        <option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectInput>
      <SelectInput label={t('c.vehicle')} addNew={perm.owner ? { label: t('add.vehicle'), to: '/app/settings?add=vehicle' } : null} value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}>
        <option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_no} · {v.ownership === 'OWNED' ? t('set.owned') : t('set.rented')}</option>)}
      </SelectInput>
      <TextArea label={t('c.notes')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <ErrorBox msg={err} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('t.new')}</Button>
    </form>
  );
}
