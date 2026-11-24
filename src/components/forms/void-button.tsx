'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/core';
import { TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { voidBill, voidExpense, voidPayment, voidPurchase } from '@/app/actions/money';

const ACTIONS = { bill: voidBill, purchase: voidPurchase, payment: voidPayment, expense: voidExpense };

/** Owner-only void with a mandatory reason. Posts reversals; never deletes history. */
export function VoidButton({ kind, id, label, compact = true }: { kind: keyof typeof ACTIONS; id: string; label: string; compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, err, run } = useSubmit();
  return (
    <>
      {compact ? (
        <button type="button" aria-label={label} title={label} onClick={() => setOpen(true)} className="press rounded-full p-2 text-ink-faint hover:bg-bad/10 hover:text-bad"><Ban className="h-[18px] w-[18px]" /></button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Ban className="h-4 w-4" /> {label}</Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={label} locked={pending}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t('c.cancel')}</Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 3}
            onClick={() => run(() => ACTIONS[kind](id, reason), () => { toast(t('c.saved')); setOpen(false); router.refresh(); })}>{t('c.void')}</Button>
        </>}>
        <div className="space-y-3">
          <TextInput label={t('c.reason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <ErrorBox msg={err} />
        </div>
      </Sheet>
    </>
  );
}
