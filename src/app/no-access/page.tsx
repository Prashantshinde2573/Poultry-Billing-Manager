import { redirect } from 'next/navigation';
import { UserX } from 'lucide-react';
import { getCtx, homeFor } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { platform } from '@/lib/data/platform';
import { LockScreen } from '@/components/lock-screen';

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (ctx.businessId || ctx.superAdmin) redirect(ctx.businessId ? homeFor(ctx) : '/admin');
  const { t } = await getT();
  return <LockScreen icon={<UserX className="h-8 w-8" />} title={t('plan.noAccessTitle')} sub={t('plan.noAccessSub')} pf={await platform()} signOutLabel={t('c.signOut')} />;
}
