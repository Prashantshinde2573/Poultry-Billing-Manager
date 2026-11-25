import { LogOut } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { Avatar, PageHeader } from '@/components/ui/core';
import { LanguageSwitcher } from '@/components/language-switcher';
import { signOut } from '@/app/actions/auth';

export default async function Page() {
  const ctx = await requireCtx();
  const { t } = await getT();
  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.profile')} />
      <section className="flex flex-col items-center text-center">
        <Avatar name={ctx.name || '?'} size={84} ring />
        <p className="mt-3 text-xl font-semibold">{ctx.name}</p>
        <p className="text-ink-muted">{ctx.businessName} · {t('set.role.driver')}</p>
      </section>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4"><span className="font-medium">{t('c.language')}</span><LanguageSwitcher /></section>
      <form action={signOut}><button className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-bad/30 bg-white/70 py-4 text-lg font-medium text-bad"><LogOut className="h-5 w-5" /> {t('c.signOut')}</button></form>
    </div>
  );
}
