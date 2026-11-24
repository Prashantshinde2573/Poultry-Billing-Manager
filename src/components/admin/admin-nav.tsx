'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/requests', label: 'Renewals' },
  { href: '/admin/leads', label: 'Enquiries' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminTabs({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Admin">
      {TABS.map((t) => {
        const active = t.href === '/admin' ? path === '/admin' : path.startsWith(t.href);
        const n = badges[t.href] ?? 0;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={`press relative flex h-11 shrink-0 items-center gap-2 px-3 text-[14.5px] font-medium ${active ? 'text-white' : 'text-white/60 hover:text-white'}`}>
            {t.label}
            {n > 0 && <span className="rounded-full bg-aqua px-1.5 text-[11.5px] font-semibold text-ink">{n}</span>}
            {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-aqua" />}
          </Link>
        );
      })}
    </nav>
  );
}
