import type { ReactNode } from 'react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { Sidebar, BottomNav } from '@/components/shell/office-nav';
import { NAV, NEW_ENTRY, allowed } from '@/components/shell/nav-items';

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={allowed(NAV, ctx.role, ctx.perms)} businessName={ctx.businessName} userName={ctx.name} roleLabel={t(`set.role.${ctx.role}`)} />
      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)] lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      <BottomNav newItems={allowed(NEW_ENTRY, ctx.role, ctx.perms)} />
    </div>
  );
}
