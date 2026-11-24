'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { inr } from '@/lib/format';
import { Button } from '@/components/ui/core';
import { Segmented, TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { requestPlan } from '@/app/actions/plan';
import { confirmPlanPayment, startPlanPayment } from '@/app/actions/razorpay';
import { fmtDate } from '@/lib/format';

declare global { interface Window { Razorpay?: any } }

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => res(true); s.onerror = () => res(false);
    document.body.appendChild(s);
  });
}

type Plan = {
  id: string; name: string; name_mr: string | null; name_hi: string | null; blurb: string | null; blurb_mr: string | null; blurb_hi: string | null;
  monthly: number | null; half_yearly: number | null; yearly: number | null; features: { en: string; mr: string; hi: string }[]; highlight: boolean;
};
type Months = 1 | 6 | 12;
const price = (p: Plan, m: Months) => (m === 1 ? p.monthly : m === 6 ? p.half_yearly : p.yearly);

/** Choose plan + period, pay by UPI QR, then send the UTR (and optionally WhatsApp) to PoulGo. */
export function PlanPicker({ plans, current, initial, business, platform, canRequest, online = false }: {
  plans: Plan[]; current: string; initial?: string; business: string;
  platform: { whatsapp: string | null; upi_id: string | null; payee_name: string | null; brand_name: string }; canRequest: boolean; online?: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [planId, setPlanId] = useState(initial && plans.some((p) => p.id === initial) ? initial : plans.find((p) => p.id === current)?.id ?? plans.find((p) => p.highlight)?.id ?? plans[0]?.id);
  const [months, setMonths] = useState<Months>(12);
  const [utr, setUtr] = useState('');
  const [qr, setQr] = useState('');
  const [sent, setSent] = useState(false);
  const { pending, err, run } = useSubmit();
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [manual, setManual] = useState(!online);

  const payOnline = async () => {
    setPayErr(''); setPaying(true);
    try {
      const [ok, r] = await Promise.all([loadCheckout(), startPlanPayment(plan.id, months)]);
      if (!r.ok) { setPayErr(t(('err.' + r.code) as any) + (r.detail && r.code === 'VALIDATION' ? ` (${r.detail})` : '')); setPaying(false); return; }
      if (!ok || !window.Razorpay) { setPayErr(t('err.NETWORK')); setPaying(false); return; }
      const o = r.data;
      const rz = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: 'INR', name: platform.brand_name,
        description: `${o.planName} · ${months} ${t('plan.months')}`, prefill: { name: o.name, email: o.email ?? undefined },
        notes: { business: o.businessName }, theme: { color: '#0E2A2F' },
        modal: { ondismiss: () => { setPaying(false); toast(t('plan.payCancelled')); } },
        handler: async (resp: any) => {
          const c = await confirmPlanPayment(resp);
          setPaying(false);
          if (c.ok) { toast(t('plan.paidOk', { date: fmtDate(c.data.renews_at, locale) })); router.refresh(); }
          else setPayErr(t(('err.' + c.code) as any));
        },
      });
      rz.on('payment.failed', (e: any) => setPayErr(e?.error?.description ?? t('plan.payCancelled')));
      rz.open();
    } catch { setPayErr(t('err.NETWORK')); setPaying(false); }
  };
  const plan = plans.find((p) => p.id === planId)!;
  const amount = plan ? price(plan, months) : null;
  const blurb = (p: Plan) => (locale === 'mr' ? p.blurb_mr : locale === 'hi' ? p.blurb_hi : p.blurb) ?? p.blurb ?? '';
  const upi = useMemo(() => (platform.upi_id && amount ? `upi://pay?pa=${encodeURIComponent(platform.upi_id)}&pn=${encodeURIComponent(platform.payee_name ?? platform.brand_name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`${platform.brand_name} ${plan.name} ${business}`.slice(0, 50))}` : ''), [platform, amount, plan, business]);
  useEffect(() => { if (upi) QRCode.toString(upi, { type: 'svg', margin: 1, color: { dark: '#0E2A2F', light: '#ffffff' } }).then(setQr).catch(() => setQr('')); else setQr(''); }, [upi]);
  const wa = platform.whatsapp
    ? `https://wa.me/${platform.whatsapp}?text=${encodeURIComponent(`${platform.brand_name}: ${business}\n${plan?.name} · ${months} ${months === 1 ? 'month' : 'months'} · ${amount != null ? inr(amount) : ''}\nUTR: ${utr || '-'}`)}`
    : null;

  return (
    <div className="space-y-6">
      <Segmented value={String(months) as '1' | '6' | '12'} onChange={(v) => setMonths(Number(v) as Months)}
        options={[{ value: '1', label: t('plan.m1') }, { value: '6', label: t('plan.m6') }, { value: '12', label: t('plan.m12') }]} />

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const on = p.id === planId;
          const pr = price(p, months);
          return (
            <button key={p.id} type="button" onClick={() => setPlanId(p.id)} aria-pressed={on}
              className={`press relative flex flex-col rounded-[20px] border p-5 text-left ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/30'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[18px] font-semibold">{localName(p, locale)}</span>
                {p.id === current && <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${on ? 'bg-white/15' : 'bg-aqua-soft text-aqua-deep'}`}>{t('plan.yourPlan')}</span>}
              </span>
              <span className={`mt-1 text-[13.5px] leading-snug ${on ? 'text-white/70' : 'text-ink-muted'}`}>{blurb(p)}</span>
              <span className="tabular mt-4 text-[28px] font-semibold tracking-[-0.02em]">{pr != null ? inr(pr, { decimals: false }) : t('plan.contact')}</span>
              {pr != null && months > 1 && p.monthly != null && <span className={`tabular text-[13px] ${on ? 'text-white/60' : 'text-ink-muted'}`}>{inr(Math.round(pr / months), { decimals: false })}{t('plan.perMonth')}</span>}
              <ul className="mt-4 space-y-2">
                {p.features.slice(0, 7).map((f) => (
                  <li key={f.en} className="flex gap-2 text-[13.5px] leading-snug">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-aqua-light' : 'text-aqua-deep'}`} />{f[locale] ?? f.en}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {canRequest && amount != null && online && (
        <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center md:p-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{t('plan.payOnline')}</h2>
            <p className="mt-1 text-[14px] text-ink-muted">{t('plan.payOnlineSub')}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted"><ShieldCheck className="h-4 w-4 text-good" /> {t('plan.secure')}</p>
            {payErr && <p role="alert" className="mt-3 rounded-[12px] bg-[#FCEAE6] px-3 py-2 text-[14px] text-bad">{payErr}</p>}
          </div>
          <Button size="lg" disabled={paying} onClick={payOnline} className="w-full sm:w-auto">{t('plan.payNow', { amount: inr(amount, { decimals: false }) })}</Button>
        </section>
      )}

      {canRequest && amount != null && online && (
        <button type="button" onClick={() => setManual((m) => !m)} aria-expanded={manual} className="press flex w-full items-center justify-between gap-3 rounded-[14px] px-1 text-left text-[15px] font-medium text-ink-soft">
          {t('plan.orManual')} <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${manual ? 'rotate-180' : ''}`} />
        </button>
      )}

      {canRequest && amount != null && manual && (
        <section className="card grid gap-6 p-5 md:grid-cols-[220px_1fr] md:p-6">
          <div className="flex flex-col items-center gap-3">
            {qr ? <div className="w-[200px] rounded-[16px] border border-line p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label="UPI QR" />
              : <div className="flex h-[200px] w-[200px] items-center justify-center rounded-[16px] bg-mint text-center text-[13px] text-ink-muted">UPI</div>}
            {upi && <a href={upi} className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-aqua-deep md:hidden"><Smartphone className="h-4 w-4" /> {t('plan.openUpi')}</a>}
          </div>
          <div className="min-w-0 space-y-4">
            <h2 className="text-[18px] font-semibold">{t('plan.payTitle')}</h2>
            <ol className="space-y-2 text-[14.5px] text-ink-soft">
              <li><span className="font-semibold text-ink">1.</span> {t('plan.payStep1', { amount: inr(amount, { decimals: false }), payee: platform.payee_name ?? platform.upi_id ?? platform.brand_name })}{platform.upi_id && <span className="ml-1 font-medium text-ink">({platform.upi_id})</span>}</li>
              <li><span className="font-semibold text-ink">2.</span> {t('plan.payStep2')}</li>
              <li><span className="font-semibold text-ink">3.</span> {t('plan.payStep3')}</li>
            </ol>
            {sent ? (
              <p className="rounded-[14px] bg-[#E3F6EC] px-4 py-3 text-[14px] text-good">{t('plan.requestSent')}</p>
            ) : (
              <>
                <TextInput label={t('plan.utr')} value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="4321 1234 5678" />
                <ErrorBox msg={err} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || utr.trim().length < 4} onClick={() => run(() => requestPlan(plan.id, months, utr), () => { setSent(true); toast(t('plan.requestSent')); })}>
                    {t('plan.sendRequest')}
                  </Button>
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="press inline-flex h-12 items-center gap-2 rounded-[14px] bg-[#25D366] px-5 text-[15px] font-medium text-white"><MessageCircle className="h-5 w-5" /> {t('plan.whatsapp')}</a>}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
