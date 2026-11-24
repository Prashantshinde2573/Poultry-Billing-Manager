'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { TextInput } from '@/components/ui/fields';
import { Button } from '@/components/ui/core';
import { createBusiness } from '@/app/actions/auth';
import { errorKey } from '@/lib/errors';

export function OnboardingForm({ defaultName, defaultPhone, ownerName }: { defaultName: string; defaultPhone: string; ownerName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [address, setAddress] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-7 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await createBusiness({ name, phone, address, ownerName });
        if (!r.ok) { setErr(t(errorKey(r.code), { detail: r.detail })); return; }
        router.replace('/');
        router.refresh();
      });
    }}>
      <TextInput label={t('auth.businessName')} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      <TextInput label={t('c.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      <TextInput label={t('c.address')} value={address} onChange={(e) => setAddress(e.target.value)} />
      {err && <p className="rounded-2xl bg-[#FCE7E3] px-4 py-3 text-sm text-bad">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('c.next')}</Button>
    </form>
  );
}
