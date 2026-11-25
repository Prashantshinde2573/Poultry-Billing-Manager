import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { getCtx } from '@/lib/session';
import { AuthShell } from '@/components/auth-shell';
import { ChangePasswordForm } from './form';

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  return (
    <AuthShell aside={<h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">{t('auth.changeTitle')}</h2>}>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{t('auth.changeTitle')}</h1>
      <p className="mt-1 text-[15px] text-ink-muted">{t('auth.changeSub')}</p>
      <ChangePasswordForm />
    </AuthShell>
  );
}
