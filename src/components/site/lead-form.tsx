'use client';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { TextInput, TextArea } from '@/components/ui/fields';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { submitLead } from '@/app/actions/auth';

export function LeadForm() {
  const { t } = useI18n();
  const [f, setF] = useState({ name: '', phone: '', business_name: '', city: '', message: '', website: '' });
  const [sent, setSent] = useState(false);
  const { pending, err, run } = useSubmit();
  if (sent) {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <CheckCircle2 className="h-12 w-12 text-good" />
        <p className="mt-3 max-w-xs text-[17px] font-medium">{t('site.fThanks')}</p>
      </div>
    );
  }
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => submitLead(f), () => setSent(true)); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label={t('site.fName')} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        <TextInput label={t('site.fPhone')} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required minLength={10} />
        <TextInput label={t('site.fBusiness')} autoComplete="organization" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} />
        <TextInput label={t('site.fCity')} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      <TextArea label={t('site.fMessage')} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      <ErrorBox msg={err} />
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>{t('site.fSend')}</Button>
    </form>
  );
}
