'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { PartyPicker } from '@/components/forms/party-picker';
import type { PartyOpt } from '@/lib/data/queries';
import { tripAddOrder } from '@/app/actions/ops';

/** Take an order for this trip: party + birds per size. Stays open for the next party. */
export function QuickOrderButton({ tripId, parties, sizes, initialParty = '' }: {
  tripId: string; parties: PartyOpt[]; sizes: { id: string; name: string }[]; initialParty?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(!!initialParty);
  const [party, setParty] = useState(initialParty);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const { pending, err, run } = useSubmit();
  const total = useMemo(() => Object.values(qty).reduce((s, x) => s + Number(x || 0), 0), [qty]);
  const save = () => run(
    () => tripAddOrder(tripId, party, sizes.map((s) => ({ bird_size_id: s.id, qty: Number(qty[s.id] || 0) })), key),
    () => {
      toast(t('c.saved'));
      setParty(''); setQty({}); setKey(crypto.randomUUID());
    },
  );
  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}><Plus className="h-5 w-5" /> {t('day.takeOrder')}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('day.takeOrder')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.close')}</Button>
          <Button disabled={pending || !party || total === 0} onClick={save}>{pending ? t('c.saving') : t('c.save')}</Button></>}>
        <div className="space-y-4">
          <PartyPicker parties={parties} value={party} onChange={setParty} label={t('c.customer')} showBalance={false} add={{ kind: 'CUSTOMER', as: 'party', next: `/app/trips/${tripId}?order=1` }} />
          <div className={`grid gap-2 ${sizes.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {sizes.map((s) => (
              <label key={s.id} className="block">
                <span className="label block text-center">{s.name}</span>
                <input inputMode="numeric" placeholder="0" value={qty[s.id] ?? ''} onChange={(e) => setQty({ ...qty, [s.id]: e.target.value.replace(/\D/g, '') })}
                  className="input tabular h-16 text-center text-[24px] font-semibold" />
              </label>
            ))}
          </div>
          <p className="tabular text-center text-[15px] text-ink-muted">{t('t.totalBirds')}: <b className="text-ink">{total}</b></p>
          <ErrorBox msg={err} />
        </div>
      </Sheet>
    </>
  );
}
