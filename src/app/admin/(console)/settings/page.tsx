import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { AdminSettings } from '@/components/admin/settings-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc('admin_settings', { p: null });
  return <AdminSettings s={data ?? {}} />;
}
