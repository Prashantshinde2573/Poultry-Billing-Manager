'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronRight, Crown, History, LogOut, Settings } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Sheet } from '@/components/ui/sheet';
import { Avatar } from '@/components/ui/core';
import { Logo } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { signOut } from '@/app/actions/auth';

export interface TopBarProps {
  businessName: string;
  userName: string;
  roleLabel: string;
  planLabel: string;
  planNote: string;
  planTone: 'good' | 'warn' | 'bad';
  owner: boolean;
  unread: number;
  home?: string;
  notificationsHref?: string;
}

/** Phone: logo + business, bell, avatar menu. Desktop: just bell + avatar (the sidebar carries the rest). */
export function TopBar({ businessName, userName, roleLabel, planLabel, planNote, planTone, owner, unread, home = '/app', notificationsHref = '/app/notifications' }: TopBarProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tone = planTone === 'good' ? 'text-good' : planTone === 'warn' ? 'text-[#9A5B05]' : 'text-bad';
  const item = (href: string, label: string, Icon: typeof Bell, right?: React.ReactNode) => (
    <Link href={href} onClick={() => setOpen(false)} className="press flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 hover:bg-mint">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-mint text-ink"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1 text-[15px] font-medium">{label}</span>
      {right}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
  return (
    <>
      <div className="no-print sticky top-0 z-30 -mx-4 mb-5 border-b border-transparent bg-canvas/90 px-4 pb-2.5 pt-[max(env(safe-area-inset-top),10px)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mb-6 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex h-11 items-center gap-3">
          <Link href={home} className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden" aria-label={businessName}>
            <Logo size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[16px] font-semibold">{businessName}</span>
              <span className={`block truncate text-[12px] ${tone}`}>{planNote}</span>
            </span>
          </Link>
          <div className="hidden flex-1 lg:block" />
          <Link href={notificationsHref} aria-label={unread ? `${t('nav.notifications')} (${unread})` : t('nav.notifications')}
            className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white ring-2 ring-canvas">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <button type="button" onClick={() => setOpen(true)} aria-label={t('nav.account')} className="press shrink-0 rounded-full">
            <Avatar name={userName || businessName || '?'} size={44} />
          </button>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('nav.account')}>
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3 rounded-[18px] bg-mint p-3.5">
            <Avatar name={userName || '?'} size={48} />
            <div className="min-w-0 flex-1 leading-snug">
              <p className="break-words text-[16px] font-semibold">{userName || businessName}</p>
              <p className="break-words text-[13.5px] text-ink-muted">{businessName} · {roleLabel}</p>
            </div>
          </div>
          <div className="space-y-1">
            {owner && item('/app/plan', t('plan.title'), Crown, <span className={`shrink-0 text-right text-[13px] ${tone}`}>{planLabel}<br />{planNote}</span>)}
            {owner && item('/app/activity', t('nav.activity'), History)}
            {item(notificationsHref, t('nav.notifications'), Bell, unread > 0 ? <span className="tabular rounded-full bg-bad px-2 text-[12px] font-semibold text-white">{unread}</span> : undefined)}
            {home === '/app' && item('/app/settings', t('nav.settings'), Settings)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-line px-3.5 py-3">
            <span className="text-[15px] font-medium">{t('c.language')}</span>
            <LanguageSwitcher />
          </div>
          <form action={signOut}>
            <button className="press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-bad/25 text-[15px] font-medium text-bad hover:bg-[#FCE7E3]">
              <LogOut className="h-5 w-5" /> {t('c.signOut')}
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
