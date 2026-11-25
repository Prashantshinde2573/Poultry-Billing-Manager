'use client';
import { nav } from '@/components/shell/perm';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { TextInput } from '@/components/ui/fields';
import { Button } from '@/components/ui/core';
import { signIn } from '@/app/actions/auth';

export function LoginForm({ area = 'app' }: { area?: 'app' | 'admin' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-7 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      setErr(null);
      start(async () => {
        const r = await signIn(id, pw, area);
        if (!r.ok) { setErr(t(r.code === 'NOT_ADMIN' ? 'err.NOT_ADMIN' : 'auth.invalid')); return; }
        nav(router, 'replace', r.data.to);
        router.refresh();
      });
    }}>
      <TextInput label={t('auth.identifier')} autoComplete="username" inputMode="email" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} placeholder="98765 43210" required />
      <TextInput label={t('auth.password')} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      {err && <p className="rounded-[14px] bg-[#FCE7E3] px-4 py-3 text-[14px] text-bad" role="alert">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.loading') : t('auth.signIn')}</Button>
    </form>
  );
}
