import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { ErrorLog } from '@/components/admin/error-log';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const resolved = sp.show === 'resolved';
  const supabase = await createClient();
  const { data } = await supabase.rpc('admin_errors', { p_resolved: resolved, p_limit: 200 });
  return <ErrorLog data={(data ?? { open: 0, today: 0, items: [] }) as any} resolved={resolved} />;
}
