import { getT } from '@/lib/i18n/server';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';

export const metadata = { title: 'Terms · PoulGo' };

export default async function Page() {
  const { t } = await getT();
  return (
    <div className="min-h-dvh">
      <SiteNav t={t} />
      <main className="mx-auto max-w-[70ch] px-4 py-14 text-[16px] leading-relaxed text-ink-soft sm:px-6">
        <h1 className="mb-6 text-[34px] font-semibold tracking-[-0.02em] text-ink">{t('site.terms')}</h1>
        <p>PoulGo is provided as a subscription per business. Plans are paid in advance for one, six or twelve months. If a plan is not renewed, the account becomes read-only after any grace period, and may be paused. You are responsible for the accuracy of the entries you make. Prices and features may change with notice in the app. Contact support for any question about these terms.</p>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
