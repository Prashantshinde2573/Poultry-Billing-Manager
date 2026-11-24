import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/brand';
import { AdminTabs } from '@/components/admin/admin-nav';
import { signOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSuperAdmin();
  const supabase = await createClient();
  const { data: ov } = await supabase.rpc('admin_overview');
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-[1180px] px-4 pt-[max(env(safe-area-inset-top),14px)] sm:px-6">
          <div className="flex items-center gap-3 pb-2">
            <Logo size={34} />
            <p className="flex-1 text-[16px] font-semibold">PoulGo <span className="font-normal text-white/60">Super admin</span></p>
            <span className="hidden text-[13px] text-white/60 sm:block">{ctx.email}</span>
            <form action={signOut}><button aria-label="Sign out" title="Sign out" className="press rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button></form>
          </div>
          <AdminTabs badges={{ '/admin/requests': Number(ov?.requests_new ?? 0), '/admin/leads': Number(ov?.leads_new ?? 0) }} />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-6 lg:pt-8">{children}</main>
    </div>
  );
}
