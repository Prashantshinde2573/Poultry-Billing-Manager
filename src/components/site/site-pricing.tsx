'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { inr } from '@/lib/format';
import { Segmented } from '@/components/ui/fields';

type Plan = {
  id: string; name: string; name_mr: string | null; name_hi: string | null; blurb: string | null; blurb_mr: string | null; blurb_hi: string | null;
  monthly: number | null; half_yearly: number | null; yearly: number | null; features: { en: string; mr: string; hi: string }[]; highlight: boolean;
};
type M = '1' | '6' | '12';

export function SitePricing({ plans }: { plans: Plan[] }) {
  const { t, locale } = useI18n();
  const [m, setM] = useState<M>('1');
  const price = (p: Plan) => (m === '1' ? p.monthly : m === '6' ? p.half_yearly : p.yearly);
  const per = m === '1' ? t('plan.perMonth') : m === '6' ? t('site.per6') : t('site.per12');
  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-md"><Segmented value={m} onChange={setM} options={[{ value: '1', label: t('plan.m1') }, { value: '6', label: t('plan.m6') }, { value: '12', label: t('plan.m12') }]} /></div>
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const dark = p.highlight;
          const pr = price(p);
          return (
            <article key={p.id} className={`flex flex-col rounded-[24px] p-6 lg:p-7 ${dark ? 'stripe-card text-white shadow-lift' : 'border border-line bg-white'}`}>
              <h3 className="text-[20px] font-semibold">{localName(p, locale)}</h3>
              <p className={`mt-1.5 min-h-[44px] text-[14.5px] leading-snug ${dark ? 'text-white/70' : 'text-ink-muted'}`}>{(locale === 'mr' ? p.blurb_mr : locale === 'hi' ? p.blurb_hi : p.blurb) ?? p.blurb}</p>
              <p className="mt-6 flex items-end gap-1.5">
                {pr != null
                  ? <><span className="tabular text-[40px] font-semibold leading-none tracking-[-0.03em]">{inr(pr, { decimals: false })}</span><span className={`pb-1 text-[14px] ${dark ? 'text-white/60' : 'text-ink-muted'}`}>{per}</span></>
                  : <span className="text-[34px] font-semibold leading-none">{t('plan.contact')}</span>}
              </p>
              <p className={`mt-1.5 text-[13px] ${dark ? 'text-white/55' : 'text-ink-faint'}`}>{t('site.perBusiness')}</p>
              <a href={`/#demo`} data-plan={p.id}
                className={`press mt-6 inline-flex h-12 items-center justify-center rounded-[14px] text-[15px] font-semibold ${dark ? 'bg-white text-ink hover:bg-mint' : 'bg-ink text-white hover:bg-ink-soft'}`}>
                {t('site.getStarted')}
              </a>
              <ul className={`mt-6 space-y-3 border-t pt-6 ${dark ? 'border-white/10' : 'border-line'}`}>
                {p.features.map((f) => (
                  <li key={f.en} className="flex gap-2.5 text-[14.5px] leading-snug">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? 'text-aqua-light' : 'text-aqua-deep'}`} strokeWidth={2.6} />{f[locale] ?? f.en}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
