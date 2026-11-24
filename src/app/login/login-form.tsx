'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { TextInput } from '@/components/ui/fields';
import { Button } from '@/components/ui/core';
import { signIn } from '@/app/actions/auth';

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-8 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      setErr(null);
      start(async () => {
        const r = await signIn(id, pw);
        if (!r.ok) { setErr(t('auth.invalid')); return; }
        router.replace(r.data.to);
        router.refresh();
      });
    }}>
      <TextInput label={t('auth.identifier')} autoComplete="username" inputMode="email" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} placeholder="98765 43210" required />
      <TextInput label={t('auth.password')} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      {err && <p className="rounded-2xl bg-[#FCE7E3] px-4 py-3 text-sm text-bad" role="alert">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.loading') : t('auth.signIn')}</Button>
    </form>
  );
}
