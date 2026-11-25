import Link from 'next/link';
import { tFor } from '@/lib/i18n/server';
import { AuthShell, HisabBubble } from '@/components/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ params }: { params: Promise<{ lang: string }> }) {
  const { t } = tFor((await params).lang);
  return (
    <AuthShell back={{ href: '/', label: t('auth.backToSite') }} aside={
      <div className="space-y-6">
        <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">{t('site.loginAside')}</h2>
        <HisabBubble title={t('site.demoBubbleTitle')} lines={[[t('site.demoBirds'), '60 · 132.4 kg'], [t('site.demoBill'), '₹15,358'], [t('site.demoPaid'), '₹10,000'], [t('site.demoDue'), '₹9,858']]} />
      </div>
    }>
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">{t('auth.signInTitle')}</h1>
      <p className="mt-1 text-[15px] text-ink-muted">{t('auth.signInSub')}</p>
      <LoginForm />
      <p className="mt-6 text-[13.5px] leading-relaxed text-ink-muted">{t('auth.forgot')}</p>
      <p className="mt-8 border-t border-line pt-6 text-[15px] text-ink-soft">
        {t('auth.noAccountYet')}{' '}
        <Link href="/#demo" className="font-semibold text-aqua-deep underline-offset-4 hover:underline">{t('auth.bookDemo')}</Link>
      </p>
    </AuthShell>
  );
}
