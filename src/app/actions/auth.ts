'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { loginEmailFor } from '@/lib/login-id';
import { LANG_COOKIE } from '@/lib/i18n/server';
import { isLocale } from '@/lib/i18n';
import { call } from './_call';
import type { ActionResult } from '@/lib/errors';

export async function signIn(identifier: string, password: string): Promise<ActionResult<{ to: string }>> {
  const email = loginEmailFor(identifier);
  if (!email || !password) return { ok: false, code: 'AUTH', detail: '' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, code: 'AUTH', detail: '' };
  return { ok: true, data: { to: '/' } };
}

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  businessName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional().default(''),
});

export async function signUp(input: z.input<typeof signupSchema>): Promise<ActionResult<{ needsConfirm: boolean }>> {
  const v = signupSchema.safeParse(input);
  if (!v.success) return { ok: false, code: 'VALIDATION', detail: v.error.issues[0]?.path.join('.') ?? '' };
  const supabase = await createClient();
  const lang = (await cookies()).get(LANG_COOKIE)?.value ?? 'mr';
  const { data, error } = await supabase.auth.signUp({
    email: v.data.email,
    password: v.data.password,
    options: { data: { full_name: v.data.name, preferred_language: lang, pending_business: v.data.businessName, pending_phone: v.data.phone } },
  });
  if (error) return { ok: false, code: 'VALIDATION', detail: error.message };
  if (!data.session) return { ok: true, data: { needsConfirm: true } };
  const r = await call('create_business', { p_name: v.data.businessName, p_phone: v.data.phone, p_owner_name: v.data.name }, { business: false });
  if (!r.ok) return r;
  return { ok: true, data: { needsConfirm: false } };
}

export async function createBusiness(input: { name: string; phone?: string; address?: string; ownerName?: string }) {
  const name = (input.name ?? '').trim();
  if (name.length < 2) return { ok: false as const, code: 'VALIDATION', detail: 'name' };
  return call('create_business', { p_name: name, p_phone: input.phone ?? '', p_address: input.address ?? '', p_owner_name: input.ownerName ?? '' }, { business: false });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setLanguage(lang: string) {
  if (!isLocale(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.rpc('set_my_language', { p_language: lang });
}
