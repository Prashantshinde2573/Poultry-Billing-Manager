import { Lock } from 'lucide-react';
import { requireCtx, MODULES, type Module } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { publicPlans } from '@/lib/data/platform';
import { LinkButton } from '@/components/ui/core';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const m = (MODULES.includes((await searchParams).m as Module) ? (await searchParams).m : 'pnl') as Module;
  const plans = await publicPlans();
  const target = plans.find((p) => p.modules.includes(m));
  const feature = t(`plan.mod.${m}` as any);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-ink text-white"><Lock className="h-7 w-7" /></span>
      <h1 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.02em]">{t('plan.upgradeTitle', { feature, plan: target ? localName(target, locale) : 'Pro' })}</h1>
      <p className="mt-2 text-[15px] text-ink-muted">{t('plan.upgradeSub')}</p>
      {target && (
        <ul className="mt-6 w-full space-y-2 rounded-[20px] border border-line bg-white p-5 text-left text-[14.5px]">
          {target.features.slice(0, 6).map((f) => <li key={f.en} className="flex gap-2"><span className="text-aqua-deep">✓</span>{f[locale] ?? f.en}</li>)}
        </ul>
      )}
      {ctx.role === 'owner'
        ? <LinkButton href={`/app/plan${target ? `?plan=${target.id}` : ''}`} size="lg" className="mt-6 w-full">{t('plan.upgrade')}</LinkButton>
        : <p className="mt-6 text-[14px] text-ink-muted">{t('plan.askOwner')}</p>}
    </div>
  );
}
