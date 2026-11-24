import Link from 'next/link';
import { AlertTriangle, Clock, Sparkles } from 'lucide-react';
import type { Ctx } from '@/lib/session';
import type { TFn } from '@/lib/i18n';
import { fmtDate, type Locale } from '@/lib/format';

/** Plan reminder strip shown on every office screen (trial, ending soon, grace, ended). */
export function PlanBanner({ ctx, t, locale }: { ctx: Ctx; t: TFn; locale: Locale }) {
  const owner = ctx.role === 'owner';
  const date = ctx.renewsAt ? fmtDate(ctx.renewsAt, locale, false) : '';
  let tone: 'info' | 'warn' | 'bad' | null = null;
  let text = '';
  if (ctx.state === 'EXPIRED') { tone = 'bad'; text = t('plan.bannerExpired'); }
  else if (ctx.state === 'GRACE') { tone = 'bad'; text = t('plan.bannerGrace', { date, grace: ctx.graceUntil ? fmtDate(ctx.graceUntil, locale, false) : '' }); }
  else if (ctx.plan.id === 'trial' && ctx.daysLeft <= 7) { tone = 'info'; text = t('plan.bannerTrial', { n: Math.max(ctx.daysLeft, 0) }); }
  else if (ctx.daysLeft <= 7) { tone = 'warn'; text = t('plan.bannerEnding', { n: Math.max(ctx.daysLeft, 0), date }); }
  if (!tone) return null;
  const Icon = tone === 'bad' ? AlertTriangle : tone === 'info' ? Sparkles : Clock;
  const cls = { info: 'border-aqua/30 bg-aqua-soft text-[#0F5F58]', warn: 'border-[#F0D29A] bg-[#FCF3E0] text-[#7A4A08]', bad: 'border-[#F3C2B8] bg-[#FCEAE6] text-[#8E2A1C]' }[tone];
  return (
    <div className={`no-print mb-5 flex items-center gap-3 rounded-[16px] border px-4 py-3 text-[14px] ${cls}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1 leading-snug">{text}{!owner && tone === 'bad' ? ` ${t('plan.askOwner')}` : ''}</p>
      {owner && (
        <Link href="/app/plan" className="press shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white">
          {ctx.plan.id === 'trial' ? t('plan.choose') : t('plan.renew')}
        </Link>
      )}
    </div>
  );
}
