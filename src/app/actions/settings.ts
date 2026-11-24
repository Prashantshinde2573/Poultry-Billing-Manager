'use server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCtx } from '@/lib/session';
import { loginEmailFor, normalizeMobile } from '@/lib/login-id';
import type { ActionResult } from '@/lib/errors';
import { call, invalid, zDate, zId, zMoney, zText } from './_call';

export async function updateBusiness(patch: Record<string, unknown>) {
  const v = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: zText(30), email: zText(120), address: zText(300), gstin: zText(20),
    settings: z.object({
      allow_customer_advance: z.boolean().optional(),
      driver_auto_confirm: z.boolean().optional(),
      report_footer: z.string().max(200).optional(),
      statement_note: z.string().max(300).optional(),
    }).optional(),
  }).safeParse(patch);
  if (!v.success) return invalid(v.error);
  return call('update_business', { p_patch: v.data });
}

export async function upsertBirdSize(input: { id?: string; name: string; name_mr?: string; name_hi?: string; sort_order?: number; active?: boolean }) {
  return call('upsert_bird_size', {
    p_id: input.id || null, p_name: input.name, p_name_mr: input.name_mr ?? '', p_name_hi: input.name_hi ?? '',
    p_sort_order: input.sort_order ?? 0, p_active: input.active ?? true,
  });
}

export async function setRate(sizeId: string, kind: 'SALE' | 'PURCHASE', rate: string, from: string) {
  if (!zMoney.safeParse(rate).success || !zDate.safeParse(from).success) return { ok: false as const, code: 'VALIDATION', detail: 'rate' };
  return call('set_bird_size_rate', { p_bird_size_id: zId.parse(sizeId), p_kind: kind, p_rate: rate, p_effective_from: from });
}

export async function upsertVehicle(input: { id?: string; registration_no: string; ownership: 'OWNED' | 'RENTED'; description?: string; active?: boolean }) {
  return call('upsert_vehicle', { p_id: input.id || null, p_registration_no: input.registration_no, p_ownership: input.ownership, p_description: input.description ?? '', p_active: input.active ?? true });
}

export async function upsertDriver(input: { id?: string; name: string; phone?: string; license_no?: string; active?: boolean }) {
  return call('upsert_driver', { p_id: input.id || null, p_name: input.name, p_phone: input.phone ?? '', p_license_no: input.license_no ?? '', p_active: input.active ?? true });
}

export async function upsertCategory(input: { id?: string; name: string; name_mr?: string; name_hi?: string; is_trip_cost?: boolean; active?: boolean }) {
  return call('upsert_expense_category', { p_id: input.id || null, p_name: input.name, p_name_mr: input.name_mr ?? '', p_name_hi: input.name_hi ?? '', p_is_trip_cost: input.is_trip_cost ?? false, p_active: input.active ?? true });
}

const permsSchema = z.object({
  suppliers: z.boolean().default(false), expenses: z.boolean().default(false), verify_payments: z.boolean().default(false),
  rate_override: z.boolean().default(false), reports: z.boolean().default(false),
});

const addUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  login: z.string().trim().min(5).max(120),   // mobile number or email
  password: z.string().min(8).max(72),
  role: z.enum(['owner', 'staff', 'driver']),
  permissions: permsSchema.optional(),
});

/**
 * Owner-only: creates a login for a staff member / driver and links it to the business.
 * The service-role key is used only here, server-side, after the owner check.
 */
export async function addUser(input: z.input<typeof addUserSchema>): Promise<ActionResult<{ userId: string }>> {
  const ctx = await getCtx();
  if (!ctx || ctx.role !== 'owner') return { ok: false, code: 'FORBIDDEN', detail: '' };
  const v = addUserSchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  const email = loginEmailFor(v.data.login);
  if (!email) return { ok: false, code: 'VALIDATION', detail: 'login' };
  let admin;
  try { admin = createServiceClient(); } catch { return { ok: false, code: 'SERVICE_KEY', detail: '' }; }

  const phone = v.data.login.includes('@') ? null : normalizeMobile(v.data.login);
  const created = await admin.auth.admin.createUser({
    email, password: v.data.password, email_confirm: true,
    user_metadata: { full_name: v.data.name, phone: phone ? '+' + phone : null, preferred_language: 'mr' },
  });
  let userId = created.data.user?.id;
  if (created.error) {
    // the login may already exist (e.g. re-adding someone) — find it by email
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!userId) return { ok: false, code: 'VALIDATION', detail: created.error.message };
  }
  const r = await call('upsert_member', {
    p_user_id: userId, p_role: v.data.role, p_display_name: v.data.name,
    p_permissions: v.data.role === 'staff' ? (v.data.permissions ?? {}) : {}, p_active: true,
  });
  if (!r.ok) return r;
  if (v.data.role === 'driver' && phone) {
    // keep the driver's phone on the driver profile
    await call('upsert_driver', { p_id: (await driverIdFor(userId!)), p_name: v.data.name, p_phone: '+' + phone, p_license_no: '', p_active: true });
  }
  return { ok: true, data: { userId: userId! } };
}

async function driverIdFor(userId: string): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase.from('drivers').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

export async function updateMember(input: { userId: string; name: string; role: 'owner' | 'staff' | 'driver'; permissions?: z.input<typeof permsSchema>; active: boolean }) {
  const ctx = await getCtx();
  if (!ctx || ctx.role !== 'owner') return { ok: false as const, code: 'FORBIDDEN', detail: '' };
  return call('upsert_member', {
    p_user_id: zId.parse(input.userId), p_role: input.role, p_display_name: input.name,
    p_permissions: input.role === 'staff' ? permsSchema.parse(input.permissions ?? {}) : {}, p_active: input.active,
  });
}

export async function resetPassword(userId: string, password: string): Promise<ActionResult<null>> {
  const ctx = await getCtx();
  if (!ctx || ctx.role !== 'owner') return { ok: false, code: 'FORBIDDEN', detail: '' };
  if (password.length < 8) return { ok: false, code: 'VALIDATION', detail: 'password' };
  // only for members of this owner's business
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: m } = await supabase.from('business_members').select('user_id').eq('business_id', ctx.businessId).eq('user_id', userId).maybeSingle();
  if (!m) return { ok: false, code: 'NOT_FOUND', detail: '' };
  let admin;
  try { admin = createServiceClient(); } catch { return { ok: false, code: 'SERVICE_KEY', detail: '' }; }
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, code: 'VALIDATION', detail: error.message };
  return { ok: true, data: null };
}
