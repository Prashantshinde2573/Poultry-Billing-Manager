import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { BusinessList } from '@/components/admin/business-list';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string; f?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: list }, { data: plans }] = await Promise.all([supabase.rpc('admin_businesses'), supabase.rpc('admin_plans')]);
  return <BusinessList list={(list ?? []) as any} plans={((plans ?? []) as any[]).filter((p) => p.active)} startNew={sp.new === '1'} startFilter={sp.f ?? 'all'} />;
}
