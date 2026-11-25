import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { NAV, allowed } from '@/components/shell/nav-items';
import { ICONS } from '@/components/shell/icons';
import { Avatar, PageHeader } from '@/components/ui/core';
import { LanguageSwitcher } from '@/components/language-switcher';
import { signOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  const items = allowed(NAV, ctx.role, ctx.perms, ctx.plan.modules, true).filter((n) => n.href !== '/app');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={t('nav.more')} />
      <section className="card flex items-center gap-3 p-4">
        <Avatar name={ctx.name || ctx.businessName} size={52} />
        <div className="min-w-0 flex-1"><p className="break-words font-semibold">{ctx.name}</p><p className="break-words text-sm text-ink-muted">{ctx.businessName} · {t(`set.role.${ctx.role}`)}</p></div>
      </section>
      <nav className="grid grid-cols-3 gap-3">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          return (
            <Link key={n.href} href={n.href} className="card press flex flex-col items-center gap-2 px-2 py-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-aqua-soft text-aqua-deep"><Icon className="h-6 w-6" /></span>
              <span className="text-[13px] font-medium leading-tight">{t(n.key)}</span>
            </Link>
          );
        })}
      </nav>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4"><span className="font-medium">{t('c.language')}</span><LanguageSwitcher /></section>
      <form action={signOut}><button className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-bad/30 bg-white/70 py-3.5 font-medium text-bad"><LogOut className="h-5 w-5" /> {t('c.signOut')}</button></form>
    </div>
  );
}
