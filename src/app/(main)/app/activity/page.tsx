import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/data/queries';
import { PageHeader } from '@/components/ui/core';
import { ActivityFeed } from '@/components/notify/activity-feed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity' };

export default async function Page() {
  const ctx = await requireCtx({ office: true, owner: true });
  const { t } = await getT();
  const supabase = await createClient();
  const [first, members] = await Promise.all([
    rpc<any[]>('business_activity', ctx, { p_limit: 40 }),
    supabase.from('business_members').select('user_id, display_name, role').eq('business_id', ctx.businessId).order('created_at').then((r) => r.data ?? []),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('act.title')} />
      <ActivityFeed first={first} members={members.map((m: any) => ({ id: m.user_id, name: m.display_name || t(`set.role.${m.role}` as any) }))} />
    </div>
  );
}
