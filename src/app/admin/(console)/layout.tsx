import type { ReactNode } from 'react';
import Link from 'next/link';
import { Bell, LogOut } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/brand';
import { AdminTabs } from '@/components/admin/admin-nav';
import { signOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: ov }, { data: er }, { data: nt }] = await Promise.all([
    supabase.rpc('admin_overview'),
    supabase.rpc('admin_errors', { p_resolved: false, p_limit: 0 }),
    supabase.rpc('my_notifications', { p_limit: 1 }),
  ]);
  const unread = Number(nt?.unread ?? 0);
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-[1180px] px-4 pt-[max(env(safe-area-inset-top),12px)] sm:px-6">
          <div className="flex items-center gap-3 pb-2">
            <Logo size={34} />
            <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">PoulGo <span className="font-normal text-white/60">Admin</span></p>
            <span className="hidden truncate text-[13px] text-white/60 md:block">{ctx.email}</span>
            <Link href="/admin/notifications" aria-label={`Notifications${unread ? ` (${unread})` : ''}`} className="press relative rounded-full p-2.5 text-white/80 hover:bg-white/10 hover:text-white">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="tabular absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-aqua px-1 text-[10.5px] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <form action={signOut}><button aria-label="Sign out" title="Sign out" className="press rounded-full p-2.5 text-white/80 hover:bg-white/10 hover:text-white"><LogOut className="h-5 w-5" /></button></form>
          </div>
          <AdminTabs badges={{ '/admin/requests': Number(ov?.requests_new ?? 0), '/admin/leads': Number(ov?.leads_new ?? 0), '/admin/errors': Number(er?.open ?? 0) }} />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-6 lg:pt-8">{children}</main>
    </div>
  );
}
