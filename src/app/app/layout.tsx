import type { ReactNode } from 'react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { Sidebar, BottomNav } from '@/components/shell/office-nav';
import { NAV, NEW_ENTRY, allowed } from '@/components/shell/nav-items';
import { PlanBanner } from '@/components/shell/plan-banner';

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={allowed(NAV, ctx.role, ctx.perms, ctx.plan.modules, true)} businessName={ctx.businessName} userName={ctx.name}
        roleLabel={t(`set.role.${ctx.role}`)} planLabel={ctx.plan.id === 'trial' ? t('plan.trial') : localName(ctx.plan, locale)} />
      <main className="mx-auto w-full min-w-0 max-w-[1120px] px-4 pb-32 pt-[max(env(safe-area-inset-top),20px)] sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">
        <PlanBanner ctx={ctx} t={t} locale={locale} />
        {children}
      </main>
      <BottomNav newItems={allowed(NEW_ENTRY, ctx.role, ctx.perms, ctx.plan.modules)} showTrips={ctx.has('trips')} />
    </div>
  );
}
