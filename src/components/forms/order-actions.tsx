'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { Sheet } from '@/components/ui/sheet';
import { TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { setOrderStatus } from '@/app/actions/ops';

export function OrderActions({ id, status }: { id: string; status: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, err, run } = useSubmit();
  const done = () => { toast(t('c.saved')); setOpen(false); };
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'DRAFT' && <Button disabled={pending} onClick={() => run(() => setOrderStatus(id, 'CONFIRMED'), done)}>{t('c.confirm')}</Button>}
      {!['COMPLETED', 'CANCELLED'].includes(status) && <Button variant="outline" onClick={() => setOpen(true)}>{t('o.cancel')}</Button>}
      {!open && <ErrorBox msg={err} />}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('o.cancel')}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.close')}</Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={() => run(() => setOrderStatus(id, 'CANCELLED', reason), done)}>{t('o.cancel')}</Button></>}>
        <div className="space-y-3"><TextInput label={t('c.reason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /><ErrorBox msg={err} /></div>
      </Sheet>
    </div>
  );
}
