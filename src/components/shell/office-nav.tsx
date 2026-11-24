'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2x2, Home, Lock, LogOut, Plus, Truck, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Sheet } from '@/components/ui/sheet';
import { Logo } from '@/components/brand';
import { Avatar } from '@/components/ui/core';
import { ICONS } from './icons';
import type { NavItem } from './nav-items';
import { signOut } from '@/app/actions/auth';

function isActive(path: string, href: string) {
  return href === '/app' ? path === '/app' : path === href || path.startsWith(href + '/');
}
const target = (n: NavItem) => (n.locked ? `/app/upgrade?m=${n.module}` : n.href);

export function Sidebar({ items, businessName, userName, roleLabel, planLabel }: { items: NavItem[]; businessName: string; userName: string; roleLabel: string; planLabel: string }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-white/70 px-3 py-5 backdrop-blur lg:flex">
      <Link href="/app" className="flex items-center gap-3 px-2.5 pb-5">
        <Logo size={38} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold">{businessName}</p>
          <p className="text-[12.5px] text-ink-muted">PoulGo · {planLabel}</p>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          const active = !n.locked && isActive(path, n.href);
          return (
            <Link key={n.href} href={target(n)} aria-current={active ? 'page' : undefined}
              className={`press flex h-10 items-center gap-3 rounded-[12px] px-3 text-[14.5px] font-medium ${active ? 'bg-ink text-white' : n.locked ? 'text-ink-faint hover:bg-mint' : 'text-ink-soft hover:bg-mint hover:text-ink'}`}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{t(n.key)}</span>
              {n.locked && <Lock className="h-3.5 w-3.5" aria-label={t('plan.locked')} />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-3 flex items-center gap-2.5 rounded-[14px] border border-line bg-white p-2.5">
        <Avatar name={userName || '?'} size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13.5px] font-medium">{userName}</p>
          <p className="text-[12px] text-ink-muted">{roleLabel}</p>
        </div>
        <form action={signOut}>
          <button aria-label={t('c.signOut')} title={t('c.signOut')} className="press rounded-full p-2 text-ink-muted hover:bg-[#FCE7E3] hover:text-bad"><LogOut className="h-4 w-4" /></button>
        </form>
      </div>
    </aside>
  );
}

export function BottomNav({ newItems, showTrips }: { newItems: NavItem[]; showTrips: boolean }) {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const tab = (href: string, label: string, Icon: typeof Home) => {
    const active = isActive(path, href);
    return (
      <Link href={href} aria-current={active ? 'page' : undefined}
        className={`press flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-medium ${active ? 'text-ink' : 'text-ink-faint'}`}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.8} />
        <span className="max-w-full truncate px-1">{label}</span>
      </Link>
    );
  };
  return (
    <>
      <nav className="no-print safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white lg:hidden" aria-label="Main">
        <div className="mx-auto flex h-[64px] max-w-xl items-stretch">
          {tab('/app', t('nav.home'), Home)}
          {tab('/app/customers', t('nav.customers'), Users)}
          <div className="flex flex-1 items-center justify-center">
            <button type="button" onClick={() => setOpen(true)} aria-label={t('nav.newEntry')}
              className="press flex h-12 w-12 items-center justify-center rounded-[16px] bg-ink text-white shadow-lift">
              <Plus className="h-6 w-6" strokeWidth={2.4} />
            </button>
          </div>
          {showTrips ? tab('/app/trips', t('nav.trips'), Truck) : tab('/app/payments', t('nav.payments'), ICONS.wallet)}
          {tab('/app/more', t('nav.more'), Grid2x2)}
        </div>
      </nav>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('nav.newEntry')}>
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 pb-2 pt-1">
          {newItems.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="press flex flex-col items-center gap-2 rounded-[16px] px-1 py-2 text-center hover:bg-mint">
                <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-mint text-ink"><Icon className="h-6 w-6" /></span>
                <span className="text-[13px] font-medium leading-tight">{t(n.key)}</span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
