'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { TextInput } from '@/components/ui/fields';
import { Button } from '@/components/ui/core';
import { signUp } from '@/app/actions/auth';
import { errorKey } from '@/lib/errors';

export function SignupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '', businessName: '', phone: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="mt-7 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      setMsg(null);
      start(async () => {
        const r = await signUp(f);
        if (!r.ok) { setMsg({ tone: 'err', text: r.detail && r.code === 'VALIDATION' ? t('err.VALIDATION', { detail: r.detail }) : t(errorKey(r.code)) }); return; }
        if (r.data.needsConfirm) { setMsg({ tone: 'ok', text: t('auth.checkEmail') }); return; }
        router.replace('/');
        router.refresh();
      });
    }}>
      <TextInput label={t('auth.businessName')} value={f.businessName} onChange={set('businessName')} required minLength={2} placeholder="Shinde Poultry" />
      <TextInput label={t('auth.yourName')} value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" />
      <TextInput label={t('c.phone')} value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
      <TextInput label={t('auth.email')} type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
      <TextInput label={t('auth.password')} type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" hint={t('auth.passwordHint')} />
      {msg && <p className={`rounded-2xl px-4 py-3 text-sm ${msg.tone === 'ok' ? 'bg-aqua-soft text-aqua-deep' : 'bg-[#FCE7E3] text-bad'}`} role="status">{msg.text}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? t('c.saving') : t('auth.createAccount')}</Button>
    </form>
  );
}
