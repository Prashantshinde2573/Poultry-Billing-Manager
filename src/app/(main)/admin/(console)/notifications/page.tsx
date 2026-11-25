import { requireSuperAdmin } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { myNotifications } from '@/lib/data/notifications';
import { PageHeader } from '@/components/ui/core';
import { NoticeList } from '@/components/notify/notice-list';
import { MarkSeen } from '@/components/notify/mark-seen';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireSuperAdmin();
  const [{ t, locale }, n] = await Promise.all([getT(), myNotifications(null, 80)]);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t('nav.notifications')} />
      <NoticeList items={n.items} t={t} locale={locale} />
      <MarkSeen unread={n.unread} />
    </div>
  );
}
