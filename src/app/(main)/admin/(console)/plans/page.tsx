import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { PlansEditor } from '@/components/admin/plans-editor';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc('admin_plans');
  return <PlansEditor plans={(data ?? []) as any[]} />;
}
