'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { TextInput } from '@/components/ui/fields';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { changePassword } from '@/app/actions/auth';

export function ChangePasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const { pending, err, setErr, run } = useSubmit();
  return (
    <form className="mt-7 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (a !== b) return setErr(t('auth.mismatch'));
      run(() => changePassword(a), (d) => { router.replace(d.to); router.refresh(); });
    }}>
      <TextInput label={t('auth.newPassword')} type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} hint={t('auth.passwordHint')} minLength={8} required />
      <TextInput label={t('auth.confirmPassword')} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} minLength={8} required />
      <ErrorBox msg={err} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('auth.savePassword')}</Button>
    </form>
  );
}
