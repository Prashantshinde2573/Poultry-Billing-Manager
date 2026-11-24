import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { getCtx } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';
import { signOut } from '@/app/actions/auth';

export default async function Onboarding() {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (ctx.businessId) redirect('/');
  const { t } = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, string>;
  // Staff/driver logins are created by an owner; only email sign-ups can create a business.
  const isInternal = (user?.email ?? '').endsWith(process.env.LOGIN_EMAIL_DOMAIN || 'phone.poulgo.local');
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-16">
      <h1 className="text-[30px] font-semibold leading-tight tracking-tight">{isInternal ? t('auth.noMembership') : t('auth.onboardTitle')}</h1>
      {!isInternal && <p className="mt-2 text-ink-muted">{t('auth.onboardSub')}</p>}
      {!isInternal && <OnboardingForm defaultName={meta.pending_business ?? ''} defaultPhone={meta.pending_phone ?? ''} ownerName={meta.full_name ?? ''} />}
      <form action={signOut} className="mt-8 text-center"><button className="text-ink-muted underline">{t('c.signOut')}</button></form>
    </main>
  );
}
