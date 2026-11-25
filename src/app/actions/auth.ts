'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { loginEmailFor } from '@/lib/login-id';
import { LANG_COOKIE } from '@/lib/i18n/server';
import { isLocale } from '@/lib/i18n';
import { getCtx, homeFor } from '@/lib/session';
import { fromDbError, type ActionResult } from '@/lib/errors';

export async function signIn(identifier: string, password: string, area: 'app' | 'admin' = 'app'): Promise<ActionResult<{ to: string }>> {
  const email = loginEmailFor(identifier);
  if (!email || !password) return { ok: false, code: 'AUTH', detail: '' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, code: 'AUTH', detail: '' };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, code: 'AUTH', detail: '' };
  if (area === 'admin' && !ctx.superAdmin) {
    await supabase.auth.signOut();
    return { ok: false, code: 'NOT_ADMIN', detail: '' };
  }
  return { ok: true, data: { to: area === 'admin' ? (ctx.mustChangePassword ? '/change-password' : '/admin') : homeFor(ctx) } };
}

export async function signOut() {
  const supabase = await createClient();
  const ctx = await getCtx();
  await supabase.auth.signOut();
  redirect(ctx?.superAdmin && !ctx.businessId ? '/admin/login' : '/login');
}

/** First sign-in with a temporary password, or a voluntary change. */
export async function changePassword(password: string): Promise<ActionResult<{ to: string }>> {
  if (password.length < 8 || password.length > 72) return { ok: false, code: 'VALIDATION', detail: 'password' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) return { ok: false, code: 'VALIDATION', detail: error.message };
  const ctx = await getCtx();
  return { ok: true, data: { to: ctx ? (ctx.superAdmin && !ctx.businessId ? '/admin' : homeFor({ ...ctx, mustChangePassword: false })) : '/login' } };
}

/**
 * One-time super admin setup. Only emails listed in SUPER_ADMIN_EMAILS (server env)
 * can be made super admin; works only while that email has no admin row yet.
 */
export async function setupSuperAdmin(email: string, password: string, name: string): Promise<ActionResult<null>> {
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const e = email.trim().toLowerCase();
  if (!allowed.includes(e)) return { ok: false, code: 'NOT_ADMIN', detail: '' };
  if (password.length < 10) return { ok: false, code: 'VALIDATION', detail: 'password' };
  let admin;
  try { admin = createServiceClient(); } catch { return { ok: false, code: 'SERVICE_KEY', detail: '' }; }
  const { count } = await admin.from('platform_admins').select('user_id', { count: 'exact', head: true }).eq('email', e);
  if ((count ?? 0) > 0) return { ok: false, code: 'CONFLICT', detail: 'exists' };
  const created = await admin.auth.admin.createUser({ email: e, password, email_confirm: true, user_metadata: { full_name: name || 'Admin' } });
  let uid = created.data.user?.id;
  if (!uid) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    uid = data?.users.find((u) => u.email?.toLowerCase() === e)?.id;
    if (!uid) return { ok: false, code: 'VALIDATION', detail: created.error?.message ?? '' };
    await admin.auth.admin.updateUserById(uid, { password });
  }
  const { error } = await admin.from('platform_admins').insert({ user_id: uid, email: e });
  if (error) return fromDbError(error);
  return { ok: true, data: null };
}

export async function setLanguage(lang: string) {
  if (!isLocale(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  // remember it on the account too (silently does nothing when signed out)
  const supabase = await createClient();
  await supabase.rpc('set_my_language', { p_language: lang }).then(() => {}, () => {});
}

const leadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(16),
  business_name: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  message: z.string().trim().max(500).optional().default(''),
  plan_id: z.string().max(30).optional().default(''),
  website: z.string().max(0).optional().default(''), // honeypot
});

/** Website enquiry / demo request. Anyone can send one (rate limited in the database). */
export async function submitLead(input: z.input<typeof leadSchema>): Promise<ActionResult<null>> {
  const v = leadSchema.safeParse(input);
  if (!v.success) return { ok: false, code: 'VALIDATION', detail: v.error.issues[0]?.path.join('.') ?? '' };
  const { website, ...lead } = v.data;
  if (website) return { ok: true, data: null };
  const lang = (await cookies()).get(LANG_COOKIE)?.value ?? 'mr';
  void (await headers());
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_lead', { p: { ...lead, lang } });
  if (error) return fromDbError(error);
  return { ok: true, data: null };
}
