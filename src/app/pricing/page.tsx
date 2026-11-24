import { getT } from '@/lib/i18n/server';
import { platform, publicPlans } from '@/lib/data/platform';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';
import { SitePricing } from '@/components/site/site-pricing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pricing · PoulGo' };

export default async function Page() {
  const { t } = await getT();
  const [plans, pf] = await Promise.all([publicPlans(), platform()]);
  return (
    <div className="min-h-dvh">
      <SiteNav t={t} />
      <main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 lg:py-20">
        <div className="mb-10 text-center">
          <h1 className="text-[36px] font-semibold tracking-[-0.02em] sm:text-[48px]">{t('site.pricingTitle')}</h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-[17px] text-ink-soft">{t('site.pricingSub')}</p>
        </div>
        <SitePricing plans={plans as any} />
        <p className="mt-6 text-center text-[14px] text-ink-muted">{t('site.trialLine', { days: pf.trial_days })}</p>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
