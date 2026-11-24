import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Role = 'owner' | 'staff' | 'driver';
export type Perm = 'suppliers' | 'expenses' | 'verify_payments' | 'rate_override' | 'reports';
export type Module = 'suppliers' | 'orders' | 'trips' | 'expenses' | 'pnl' | 'reports';
export type PlanState = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED';
export const MODULES: Module[] = ['suppliers', 'orders', 'trips', 'expenses', 'pnl', 'reports'];

export interface PlanInfo {
  id: string; name: string; name_mr: string | null; name_hi: string | null; modules: Module[];
  max_staff: number | null; max_drivers: number | null; max_vehicles: number | null; monthly: number | null;
}

export interface Ctx {
  userId: string;
  email: string | null;
  name: string;
  superAdmin: boolean;
  mustChangePassword: boolean;
  businessId: string;
  businessName: string;
  role: Role;
  perms: Record<Perm, boolean>;
  settings: Record<string, unknown>;
  plan: PlanInfo;
  state: PlanState;
  renewsAt: string;
  graceUntil: string | null;
  daysLeft: number;
  /** permission (staff ticks) AND plan module where one applies */
  can: (p: Perm) => boolean;
  /** module included in the plan */
  has: (m: Module) => boolean;
  /** expired / suspended → read only */
  locked: boolean;
}

const PERM_MODULE: Partial<Record<Perm, Module>> = { suppliers: 'suppliers', expenses: 'expenses' };

/** The signed-in user's account (membership + plan). Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: a } = await supabase.rpc('my_account');
  const acc = (a ?? {}) as any;
  const base = {
    userId: user.id, email: user.email ?? null, superAdmin: !!acc.super_admin,
    mustChangePassword: !!acc.must_change_password || user.user_metadata?.must_change_password === true,
  };
  if (!acc.business_id) {
    return {
      ...base, name: (user.user_metadata?.full_name as string) ?? '', businessId: '', businessName: '', role: 'staff', perms: {} as Ctx['perms'], settings: {},
      plan: { id: '', name: '', name_mr: null, name_hi: null, modules: [], max_staff: 0, max_drivers: 0, max_vehicles: 0, monthly: null },
      state: 'SUSPENDED', renewsAt: '', graceUntil: null, daysLeft: 0, can: () => false, has: () => false, locked: true,
    };
  }
  const role = acc.role as Role;
  const plan = acc.plan as PlanInfo;
  const has = (m: Module) => plan.modules.includes(m);
  const raw = (acc.permissions ?? {}) as Record<string, boolean>;
  const perms = Object.fromEntries((['suppliers', 'expenses', 'verify_payments', 'rate_override', 'reports'] as Perm[])
    .map((p) => [p, (role === 'owner' || (role === 'staff' && raw[p] === true)) && (!PERM_MODULE[p] || has(PERM_MODULE[p]!))])) as Ctx['perms'];
  const state = acc.state as PlanState;
  return {
    ...base, name: acc.display_name || (user.user_metadata?.full_name as string) || '',
    businessId: acc.business_id, businessName: acc.business_name ?? '', role, perms, settings: acc.settings ?? {},
    plan, state, renewsAt: acc.renews_at, graceUntil: acc.grace_until, daysLeft: Number(acc.days_left ?? 0),
    can: (p) => perms[p], has, locked: state === 'EXPIRED' || state === 'SUSPENDED',
  };
});

/** Where a signed-in person belongs. */
export function homeFor(ctx: Ctx): string {
  if (ctx.mustChangePassword) return '/change-password';
  if (!ctx.businessId) return ctx.superAdmin ? '/admin' : '/no-access';
  if (ctx.state === 'SUSPENDED') return '/suspended';
  return ctx.role === 'driver' ? '/driver' : '/app';
}

/** For pages: requires a business member; redirects otherwise. */
export async function requireCtx(opts: { office?: boolean; owner?: boolean; perm?: Perm; module?: Module } = {}): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (ctx.mustChangePassword) redirect('/change-password');
  if (!ctx.businessId) redirect(ctx.superAdmin ? '/admin' : '/no-access');
  if (ctx.state === 'SUSPENDED') redirect('/suspended');
  if (opts.office && ctx.role === 'driver') redirect('/driver');
  if (opts.module && !ctx.has(opts.module)) redirect(`/app/upgrade?m=${opts.module}`);
  if (opts.owner && ctx.role !== 'owner') redirect('/app');
  if (opts.perm && !ctx.can(opts.perm)) redirect('/app');
  return ctx;
}

/** For /admin pages. */
export async function requireSuperAdmin(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/admin/login');
  if (!ctx.superAdmin) redirect('/admin/login?e=not_admin');
  if (ctx.mustChangePassword) redirect('/change-password');
  return ctx;
}
