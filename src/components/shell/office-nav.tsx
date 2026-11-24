'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2x2, Home, LogOut, Plus, Truck, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Sheet } from '@/components/ui/sheet';
import { Logo } from '@/components/brand';
import { ICONS } from './icons';
import type { NavItem } from './nav-items';
import { signOut } from '@/app/actions/auth';

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

export function Sidebar({ items, businessName, userName, roleLabel }: { items: NavItem[]; businessName: string; userName: string; roleLabel: string }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col px-4 py-6 lg:flex">
      <div className="flex items-center gap-3 px-2 pb-6">
        <Logo size={42} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{businessName}</p>
          <p className="text-xs text-ink-muted">PoulGo</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          const active = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} className={`press flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-medium ${active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white/70'}`}>
              <Icon className="h-[19px] w-[19px]" /> {t(n.key)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 rounded-2xl bg-white/70 p-3">
        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="text-xs text-ink-muted">{roleLabel}</p>
        <form action={signOut}><button className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-bad"><LogOut className="h-4 w-4" /> {t('c.signOut')}</button></form>
      </div>
    </aside>
  );
}

export function BottomNav({ newItems }: { newItems: NavItem[] }) {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const tab = (href: string, label: string, Icon: typeof Home) => {
    const active = isActive(path, href) && (href !== '/more' || path === '/more');
    return (
      <Link href={href} className={`press flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2.5 text-[11px] font-medium ${active ? 'text-ink' : 'text-ink-faint'}`}>
        <Icon className="h-[23px] w-[23px]" strokeWidth={active ? 2.4 : 1.9} />
        {label}
      </Link>
    );
  };
  return (
    <>
      <nav className="no-print safe-b fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className="flex items-end">
          {tab('/', t('nav.home'), Home)}
          {tab('/customers', t('nav.customers'), Users)}
          <div className="flex flex-1 justify-center">
            <button type="button" onClick={() => setOpen(true)} aria-label={t('nav.newEntry')}
              className="press -mt-7 flex h-[60px] w-[60px] items-center justify-center rounded-[22px] bg-ink text-white shadow-float ring-[5px] ring-[#F6FBF9]">
              <Plus className="h-7 w-7" strokeWidth={2.4} />
            </button>
          </div>
          {tab('/trips', t('nav.trips'), Truck)}
          {tab('/more', t('nav.more'), Grid2x2)}
        </div>
      </nav>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('nav.newEntry')}>
        <div className="grid grid-cols-3 gap-2 pb-2">
          {newItems.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="press flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center hover:bg-mint">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white"><Icon className="h-6 w-6" /></span>
                <span className="text-[13px] font-medium leading-tight">{t(n.key)}</span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
