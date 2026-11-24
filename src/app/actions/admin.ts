'use server';
import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCtx } from '@/lib/session';
import { loginEmailFor, normalizeMobile } from '@/lib/login-id';
import { fromDbError, type ActionResult } from '@/lib/errors';

/** Every admin action: super admin session required, then the RPC re-checks in the database. */
async function adminRpc<T = any>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const ctx = await getCtx();
  if (!ctx?.superAdmin) return { ok: false, code: 'FORBIDDEN', detail: '' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fromDbError(error);
  revalidatePath('/admin', 'layout');
  return { ok: true, data: data as T };
}

const tempPassword = () => {
  const w = ['Poul', 'Kombdi', 'Khata', 'Hisab', 'Gaadi', 'Pakshi'];
  const a = 'abcdefghjkmnpqrstuvwxyz';
  return `${w[randomInt(w.length)]}-${randomInt(1000, 9999)}-${a[randomInt(a.length)]}${a[randomInt(a.length)]}${a[randomInt(a.length)]}`;
};

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(60).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
  owner_name: z.string().trim().min(2).max(80),
  owner_login: z.string().trim().min(5).max(120),
  plan_id: z.string().min(2).max(30),
  months: z.coerce.number().int().min(0).max(24).optional().default(1),
  trial_days: z.coerce.number().int().min(0).max(90).optional(),
  amount: z.string().optional().default(''),
  method: z.string().optional().default('UPI'),
  reference: z.string().max(80).optional().default(''),
  notes: z.string().max(500).optional().default(''),
});

/** Creates the owner's login (temporary password) and the business. */
export async function adminCreateBusiness(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; login: string; password: string }>> {
  const ctx = await getCtx();
  if (!ctx?.superAdmin) return { ok: false, code: 'FORBIDDEN', detail: '' };
  const v = createSchema.safeParse(input);
  if (!v.success) return { ok: false, code: 'VALIDATION', detail: v.error.issues[0]?.path.join('.') ?? '' };
  const email = loginEmailFor(v.data.owner_login);
  if (!email) return { ok: false, code: 'VALIDATION', detail: 'owner_login' };
  let admin;
  try { admin = createServiceClient(); } catch { return { ok: false, code: 'SERVICE_KEY', detail: '' }; }
  const password = tempPassword();
  const mobile = v.data.owner_login.includes('@') ? null : normalizeMobile(v.data.owner_login);
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: v.data.owner_name, phone: mobile ? '+' + mobile : null, preferred_language: 'mr', must_change_password: true },
  });
  if (created.error || !created.data.user) return { ok: false, code: 'CONFLICT', detail: 'login exists' };
  const uid = created.data.user.id;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_create_business', {
    p_owner: uid,
    p: { ...v.data, owner_login: mobile ? '+' + mobile : email, amount: v.data.amount || '0' },
  });
  if (error) {
    await admin.auth.admin.deleteUser(uid); // don't leave an orphan login behind
    return fromDbError(error);
  }
  revalidatePath('/admin', 'layout');
  return { ok: true, data: { id: (data as any).id, login: mobile ? mobile.slice(2) : email, password } };
}

export async function adminResetOwnerPassword(userId: string): Promise<ActionResult<{ password: string }>> {
  const ctx = await getCtx();
  if (!ctx?.superAdmin) return { ok: false, code: 'FORBIDDEN', detail: '' };
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, code: 'VALIDATION', detail: '' };
  let admin;
  try { admin = createServiceClient(); } catch { return { ok: false, code: 'SERVICE_KEY', detail: '' }; }
  const password = tempPassword();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const { error } = await admin.auth.admin.updateUserById(userId, { password, user_metadata: { ...(u.user?.user_metadata ?? {}), must_change_password: true } });
  if (error) return { ok: false, code: 'VALIDATION', detail: error.message };
  return { ok: true, data: { password } };
}

export const adminUpdateBusiness = async (id: string, patch: Record<string, unknown>) => adminRpc('admin_update_business', { p_business_id: id, p: patch });
export const adminRenew = async (id: string, p: { plan_id: string; months: number; amount: string; method: string; reference: string; paid_on: string; note: string; request_id?: string }) =>
  adminRpc('admin_renew', { p_business_id: id, p });
export const adminSetRequest = async (id: string, status: 'DONE' | 'REJECTED') => adminRpc('admin_set_request', { p_request_id: id, p_status: status });
export const adminUpdateLead = async (id: string, status: string, notes: string) => adminRpc('admin_update_lead', { p_id: id, p_status: status, p_notes: notes });
export const adminUpsertPlan = async (p: Record<string, unknown>) => adminRpc('admin_upsert_plan', { p });
export const adminSaveSettings = async (p: Record<string, unknown>) => adminRpc('admin_settings', { p });
