'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { Sheet } from '@/components/ui/sheet';
import { TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { verifyPayment } from '@/app/actions/money';

export function VerifyButtons({ id }: { id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [rej, setRej] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, err, run } = useSubmit();
  const done = () => { toast(t('c.saved')); setRej(false); router.refresh(); };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRej(true)} aria-label={t('pay.reject')}><X className="h-4 w-4" /></Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => verifyPayment(id, true), done)}><Check className="h-4 w-4" /> {t('pay.verify')}</Button>
      </div>
      {!rej && err && <p className="text-xs text-bad">{err}</p>}
      <Sheet open={rej} onClose={() => setRej(false)} title={t('pay.reject')}
        footer={<><Button variant="outline" onClick={() => setRej(false)}>{t('c.cancel')}</Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={() => run(() => verifyPayment(id, false, reason), done)}>{t('pay.reject')}</Button></>}>
        <div className="space-y-3"><TextInput label={t('pay.rejectReason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /><ErrorBox msg={err} /></div>
      </Sheet>
    </div>
  );
}
