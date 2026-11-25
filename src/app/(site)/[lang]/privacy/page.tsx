import { tFor } from '@/lib/i18n/server';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';

export const metadata = { title: 'Privacy · PoulGo' };

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { t } = tFor((await params).lang);
  return (
    <div className="min-h-dvh">
      <SiteNav t={t} />
      <main className="mx-auto max-w-[70ch] px-4 py-14 text-[16px] leading-relaxed text-ink-soft sm:px-6">
        <h1 className="mb-6 text-[34px] font-semibold tracking-[-0.02em] text-ink">{t('site.privacy')}</h1>
        <p>PoulGo stores your business records (customers, suppliers, bills, payments, trips and expenses) so that you and the team members you add can use them. Each business can see only its own data. We do not sell or share your data. Logins use a mobile number or email and a password; passwords are stored by our authentication provider in hashed form. You can ask us to export or delete your business data at any time by writing to the support contact shown in the app.</p>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
