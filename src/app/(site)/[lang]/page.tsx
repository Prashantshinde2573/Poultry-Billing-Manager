import { BadgeCheck, Banknote, Languages, MessageCircle, Phone as PhoneIcon, ReceiptText, ShieldCheck, Users } from 'lucide-react';
import { tFor } from '@/lib/i18n/server';
import { platform, publicPlans } from '@/lib/data/platform';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';
import { DashboardMock, DriverMock, Phone, WhatsAppHisab } from '@/components/site/mockups';
import { SitePricing } from '@/components/site/site-pricing';
import { LeadForm } from '@/components/site/lead-form';


export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { t } = tFor((await params).lang);
  const [plans, pf] = await Promise.all([publicPlans(), platform()]);
  const wa = pf.whatsapp ? `https://wa.me/${pf.whatsapp}?text=${encodeURIComponent('PoulGo demo')}` : null;
  const day = [
    ['05:30', t('site.d1t'), t('site.d1')], ['07:00', t('site.d2t'), t('site.d2')], ['09:00', t('site.d3t'), t('site.d3')],
    ['17:00', t('site.d4t'), t('site.d4')], ['19:30', t('site.d5t'), t('site.d5')],
  ];
  const why = [
    [Banknote, t('site.w1t'), t('site.w1')], [ReceiptText, t('site.w2t'), t('site.w2')], [BadgeCheck, t('site.w3t'), t('site.w3')],
    [ShieldCheck, t('site.w4t'), t('site.w4')], [Users, t('site.w5t'), t('site.w5')], [Languages, t('site.w6t'), t('site.w6')],
  ] as const;
  const faq = [1, 2, 3, 4, 5, 6].map((i) => [t(`site.q${i}` as any), t(`site.a${i}` as any)]);

  return (
    <div className="min-h-dvh">
      <SiteNav t={t} />
      <main>
        {/* hero */}
        <section className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8 lg:pb-24 lg:pt-16">
          <div>
            <h1 className="max-w-[15ch] text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[52px] lg:text-[60px]">{t('site.heroTitle')}</h1>
            <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft sm:text-[18px]">{t('site.heroSub')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#demo" className="press inline-flex h-14 items-center justify-center rounded-[16px] bg-ink px-7 text-[16px] font-semibold text-white hover:bg-ink-soft">{t('site.ctaDemo')}</a>
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="press inline-flex h-14 items-center justify-center gap-2 rounded-[16px] border border-line bg-white px-6 text-[16px] font-semibold"><MessageCircle className="h-5 w-5 text-[#25D366]" /> {t('site.ctaWhatsapp')}</a>}
            </div>
            <p className="mt-5 text-[14px] text-ink-muted">{t('site.heroNote', { days: pf.trial_days })}</p>
          </div>
          <div className="relative mx-auto w-full max-w-[400px] lg:mr-0">
            <Phone className="mx-auto h-[600px] w-[296px]"><DashboardMock t={t} /></Phone>
            <WhatsAppHisab t={t} className="hisab-in absolute -left-2 bottom-10 sm:-left-14" />
          </div>
        </section>

        {/* the working day — a real sequence, so the times lead */}
        <section id="day" className="scroll-mt-20 border-y border-line bg-white">
          <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="max-w-[22ch] text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">{t('site.dayTitle')}</h2>
            <p className="mt-3 max-w-[60ch] text-[17px] text-ink-soft">{t('site.daySub')}</p>
            <ol className="mt-12 grid gap-0 lg:grid-cols-5 lg:gap-6">
              {day.map(([time, title, text], i) => (
                <li key={time} className="relative grid grid-cols-[64px_minmax(0,1fr)] gap-4 pb-8 last:pb-0 lg:block lg:pb-0">
                  <div className="relative lg:mb-5 lg:flex lg:items-center">
                    <span className="tabular inline-flex h-9 items-center rounded-full bg-ink px-3 text-[14px] font-semibold text-white">{time}</span>
                    {i < day.length - 1 && <span aria-hidden className="absolute left-[30px] top-11 h-[calc(100%+8px)] w-px bg-line lg:static lg:ml-3 lg:h-px lg:flex-1" />}
                  </div>
                  <div>
                    <h3 className="text-[18px] font-semibold">{title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* why */}
        <section className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="max-w-[22ch] text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">{t('site.whyTitle')}</h2>
          <div className="mt-10 grid gap-x-12 md:grid-cols-2">
            {why.map(([Icon, title, text]) => (
              <div key={title} className="flex gap-4 border-t border-line py-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-aqua-soft text-aqua-deep"><Icon className="h-5 w-5" /></span>
                <div><h3 className="text-[18px] font-semibold">{title}</h3><p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* driver app */}
        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div className="lg:order-2">
              <h2 className="max-w-[18ch] text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">{t('site.driverTitle')}</h2>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-white/75">{t('site.driverSub')}</p>
              <p className="mt-8 text-[15px] text-aqua-light">{t('site.langLine')}</p>
            </div>
            <Phone className="mx-auto h-[540px] w-[270px] lg:order-1"><DriverMock /></Phone>
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" className="mx-auto max-w-[1180px] scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="mb-10 text-center">
            <h2 className="text-[32px] font-semibold tracking-[-0.02em] sm:text-[40px]">{t('site.pricingTitle')}</h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-[17px] text-ink-soft">{t('site.pricingSub')}</p>
          </div>
          <SitePricing plans={plans as any} />
          <p className="mt-6 text-center text-[14px] text-ink-muted">{t('site.trialLine', { days: pf.trial_days })}</p>
        </section>

        {/* faq */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-white">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24">
            <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">{t('site.faqTitle')}</h2>
            <div className="divide-y divide-line border-y border-line">
              {faq.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                    {q}<span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-[18px] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* demo */}
        <section id="demo" className="mx-auto max-w-[1180px] scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid gap-10 rounded-[28px] border border-line bg-white p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
            <div>
              <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[36px]">{t('site.demoTitle')}</h2>
              <p className="mt-3 text-[16.5px] leading-relaxed text-ink-soft">{t('site.demoSub')}</p>
              <div className="mt-8 flex flex-col gap-3">
                {wa && <a href={wa} target="_blank" rel="noreferrer" className="press inline-flex h-12 items-center gap-2.5 self-start rounded-[14px] bg-[#25D366] px-5 font-semibold text-white"><MessageCircle className="h-5 w-5" /> {t('site.ctaWhatsapp')}</a>}
                {pf.support_phone && <a href={`tel:${pf.support_phone}`} className="press inline-flex h-12 items-center gap-2.5 self-start rounded-[14px] border border-line px-5 font-semibold"><PhoneIcon className="h-5 w-5" /> {pf.support_phone}</a>}
              </div>
            </div>
            <LeadForm />
          </div>
        </section>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
