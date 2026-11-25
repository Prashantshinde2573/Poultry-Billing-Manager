import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { Leads } from '@/components/admin/leads';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc('admin_leads');
  return <Leads rows={(data ?? []) as any[]} />;
}
