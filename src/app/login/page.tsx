import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { getCtx } from '@/lib/session';
import { Logo } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const ctx = await getCtx().catch(() => null);
  if (ctx) redirect('/');
  const { t } = await getT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <div className="mt-10 flex items-center gap-3">
        <Logo size={52} />
        <div>
          <p className="text-2xl font-semibold tracking-tight">{t('app.name')}</p>
          <p className="text-ink-muted">{t('app.tagline')}</p>
        </div>
      </div>
      <h1 className="mt-10 text-[32px] font-semibold leading-tight tracking-tight">{t('auth.signInTitle')}</h1>
      <p className="mt-1 text-ink-muted">{t('auth.signInSub')}</p>
      <LoginForm />
      <p className="mt-8 text-center text-ink-muted">
        {t('auth.noAccount')}{' '}
        <Link href="/signup" className="font-medium text-aqua-deep underline-offset-4 hover:underline">{t('auth.createBusiness')}</Link>
      </p>
    </main>
  );
}
