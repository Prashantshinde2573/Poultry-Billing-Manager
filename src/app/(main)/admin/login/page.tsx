import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/session';
import { createServiceClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { SetupForm } from './setup-form';

export const metadata = { title: 'Super admin · PoulGo', robots: { index: false } };
export const dynamic = 'force-dynamic';

async function setupOpen() {
  if (!(process.env.SUPER_ADMIN_EMAILS ?? '').trim()) return false;
  try {
    const { count } = await createServiceClient().from('platform_admins').select('user_id', { count: 'exact', head: true });
    return (count ?? 0) === 0;
  } catch { return false; }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getCtx().catch(() => null);
  if (ctx?.superAdmin) redirect('/admin');
  const setup = await setupOpen();
  const sp = await searchParams;
  return (
    <AuthShell aside={<h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">Every PoulGo business, plan and payment in one place.</h2>}>
      <p className="text-[13px] font-semibold text-aqua-deep">Super admin</p>
      <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.02em]">{setup ? 'Create the super admin' : 'Sign in'}</h1>
      {sp.e === 'not_admin' && <p className="mt-4 rounded-[14px] bg-[#FCE7E3] px-4 py-3 text-[14px] text-bad">That login is not a super admin.</p>}
      {setup ? <SetupForm /> : <LoginForm area="admin" />}
    </AuthShell>
  );
}
