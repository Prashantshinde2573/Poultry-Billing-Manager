import { redirect } from 'next/navigation';
import { PauseCircle } from 'lucide-react';
import { getCtx, homeFor } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { platform } from '@/lib/data/platform';
import { LockScreen } from '@/components/lock-screen';

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (ctx.businessId && ctx.state !== 'SUSPENDED') redirect(homeFor(ctx));
  const { t } = await getT();
  return <LockScreen icon={<PauseCircle className="h-8 w-8" />} title={t('plan.suspendedTitle')} sub={t('plan.suspendedSub')} pf={await platform()} signOutLabel={t('c.signOut')} />;
}
