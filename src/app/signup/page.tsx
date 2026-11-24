import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { IconCircle } from '@/components/ui/core';
import { ArrowLeft } from 'lucide-react';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create account' };

export default async function SignupPage() {
  const { t } = await getT();
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="flex items-center justify-between">
        <IconCircle href="/login" label={t('c.back')}><ArrowLeft className="h-5 w-5" /></IconCircle>
        <LanguageSwitcher />
      </div>
      <h1 className="mt-8 text-[30px] font-semibold leading-tight tracking-tight">{t('auth.signupTitle')}</h1>
      <p className="mt-1 text-ink-muted">{t('auth.signupSub')}</p>
      <SignupForm />
      <p className="mt-8 text-center text-ink-muted">{t('auth.haveAccount')} <Link href="/login" className="font-medium text-aqua-deep">{t('auth.signIn')}</Link></p>
    </main>
  );
}
