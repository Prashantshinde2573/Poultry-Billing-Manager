import type { ReactNode } from 'react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { Sidebar, BottomNav } from '@/components/shell/office-nav';
import { TopBar } from '@/components/shell/top-bar';
import { NAV, NEW_ENTRY, allowed } from '@/components/shell/nav-items';
import { PlanBanner } from '@/components/shell/plan-banner';
import { myNotifications, planNote, prefetchNotifications } from '@/lib/data/notifications';
import { PermProvider } from '@/components/shell/perm';

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  prefetchNotifications(1);
  const ctx = await requireCtx({ office: true });
  const [{ t, locale }, notes] = await Promise.all([getT(), myNotifications(ctx, 1)]);
  const planLabel = ctx.plan.id === 'trial' ? t('plan.trial') : localName(ctx.plan, locale);
  const note = planNote(ctx, t);
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={allowed(NAV, ctx.role, ctx.perms, ctx.plan.modules, true)} businessName={ctx.businessName} userName={ctx.name}
        roleLabel={t(`set.role.${ctx.role}`)} planLabel={planLabel} />
      <main className="mx-auto w-full min-w-0 max-w-[1120px] px-4 pb-32 sm:px-6 lg:px-10 lg:pb-16 lg:pt-6">
        <TopBar businessName={ctx.businessName} userName={ctx.name} roleLabel={t(`set.role.${ctx.role}`)} planLabel={planLabel}
          planNote={note.text} planTone={note.tone} owner={ctx.role === 'owner'} unread={notes.unread} />
        <PlanBanner ctx={ctx} t={t} locale={locale} />
        <PermProvider value={{ owner: ctx.role === 'owner', modules: ctx.plan.modules, perms: ctx.perms }}>{children}</PermProvider>
      </main>
      <BottomNav newItems={allowed(NEW_ENTRY, ctx.role, ctx.perms, ctx.plan.modules)} showTrips={ctx.has('trips')} />
    </div>
  );
}
