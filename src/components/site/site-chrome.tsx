import Link from 'next/link';
import { SiteMenu } from './site-menu';
import type { TFn } from '@/lib/i18n';
import { Wordmark } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';

export function SiteNav({ t }: { t: TFn }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="PoulGo home">
          <Wordmark height={34} />
        </Link>
        <nav className="ml-6 hidden items-center gap-6 text-[15px] font-medium text-ink-soft md:flex" aria-label="Website">
          <a href="/#day" className="hover:text-ink">{t('site.navFeatures')}</a>
          <a href="/#pricing" className="hover:text-ink">{t('site.navPricing')}</a>
          <a href="/#faq" className="hover:text-ink">{t('site.navFaq')}</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <Link href="/login" className="press inline-flex h-10 items-center rounded-[12px] px-3.5 text-[15px] font-medium text-ink hover:bg-white">{t('site.signIn')}</Link>
          <a href="/#demo" className="press hidden h-10 items-center rounded-[12px] bg-ink px-4 text-[15px] font-medium text-white sm:inline-flex">{t('site.ctaDemo')}</a>
          <SiteMenu links={[{ href: '/#day', label: t('site.navFeatures') }, { href: '/#pricing', label: t('site.navPricing') }, { href: '/#faq', label: t('site.navFaq') }]}
            cta={{ href: '/#demo', label: t('site.ctaDemo') }} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ t }: { t: TFn }) {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div><Wordmark height={36} /><p className="mt-2 text-[14px] text-ink-muted">{t('site.footer')}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-ink-soft">
          <Link href="/pricing" className="hover:text-ink">{t('site.navPricing')}</Link>
          <Link href="/privacy" className="hover:text-ink">{t('site.privacy')}</Link>
          <Link href="/terms" className="hover:text-ink">{t('site.terms')}</Link>
          <Link href="/login" className="hover:text-ink">{t('site.signIn')}</Link>
          <div className="sm:hidden"><LanguageSwitcher /></div>
        </div>
      </div>
      <p className="pb-8 text-center text-[12.5px] text-ink-faint">© {new Date().getFullYear()} PoulGo</p>
    </footer>
  );
}
