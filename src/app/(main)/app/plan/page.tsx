import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, inr } from '@/lib/format';
import { platform, publicPlans } from '@/lib/data/platform';
import { Badge, PageHeader, SectionTitle } from '@/components/ui/core';
import { PlanPicker } from '@/components/plan/plan-picker';
import { razorpayEnabled } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

function Meter({ label, used, max, t }: { label: string; used: number; max: number | null; t: (k: any) => string }) {
  const pct = max == null ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-[14px]"><span className="text-ink-soft">{label}</span><span className="tabular font-medium">{used} / {max == null ? t('plan.unlimited') : max}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-ink/[0.07]"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-bad' : 'bg-aqua'}`} style={{ width: `${max == null ? 8 : pct}%` }} /></div>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const sp = await searchParams;
  const owner = ctx.role === 'owner';
  const supabase = await createClient();
  const [plans, pf, hist] = await Promise.all([
    publicPlans(), platform(),
    owner ? supabase.rpc('my_plan_history', { p_business_id: ctx.businessId }).then((r) => r.data as any) : Promise.resolve(null),
  ]);
  const stateTone = ctx.state === 'ACTIVE' ? 'good' : ctx.state === 'GRACE' ? 'warn' : 'bad';
  const pendingReq = (hist?.requests ?? []).find((r: any) => r.status === 'NEW');
  return (
    <div className="page">
      <PageHeader title={t('plan.title')} />
      <section className="stripe-card rounded-[24px] p-6 text-white shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] text-white/70">{t('plan.current')}</p>
            <p className="mt-1 text-[28px] font-semibold tracking-[-0.02em]">{ctx.plan.id === 'trial' ? t('plan.trial') : localName(ctx.plan, locale)}</p>
          </div>
          <Badge tone={stateTone as any}>{ctx.state === 'ACTIVE' ? t('plan.daysLeft', { n: Math.max(ctx.daysLeft, 0) }) : t(`plan.state.${ctx.state}` as any)}</Badge>
        </div>
        <p className="mt-6 text-[15px] text-white/80">{t('plan.validTill', { date: fmtDate(ctx.renewsAt, locale) })}</p>
        {pendingReq && <p className="mt-2 text-[13.5px] text-aqua-light">{t('plan.pending')} · {inr(pendingReq.amount, { decimals: false })}</p>}
      </section>

      {owner && hist && (
        <section className="card space-y-4 p-5">
          <SectionTitle>{t('plan.usage')}</SectionTitle>
          <Meter label={t('plan.staff')} used={hist.usage.staff} max={ctx.plan.max_staff} t={t} />
          <Meter label={t('plan.drivers')} used={hist.usage.drivers} max={ctx.plan.max_drivers} t={t} />
          <Meter label={t('plan.vehicles')} used={hist.usage.vehicles} max={ctx.plan.max_vehicles} t={t} />
        </section>
      )}

      <section>
        <SectionTitle>{ctx.plan.id === 'trial' ? t('plan.choose') : t('plan.renew')}</SectionTitle>
        <PlanPicker plans={plans as any} current={ctx.plan.id} initial={sp.plan} business={ctx.businessName} platform={pf} canRequest={owner} online={razorpayEnabled()} />
        {!owner && <p className="mt-3 text-[14px] text-ink-muted">{t('plan.askOwner')}</p>}
      </section>

      {owner && (hist?.payments ?? []).length > 0 && (
        <section>
          <SectionTitle>{t('plan.history')}</SectionTitle>
          <div className="card divide-y divide-line px-5">
            {hist.payments.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3.5 text-[14.5px]">
                <div className="min-w-0"><p className="font-medium">{fmtDate(p.paid_on, locale, false)} · {p.months} {t('plan.months')}</p>
                  <p className="break-words text-[13px] text-ink-muted">{fmtDate(p.period_from, locale, false)} – {fmtDate(p.period_to, locale, false)}{p.reference ? ` · ${p.reference}` : ''}</p></div>
                <p className="tabular font-semibold">{inr(p.amount, { decimals: false })}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
