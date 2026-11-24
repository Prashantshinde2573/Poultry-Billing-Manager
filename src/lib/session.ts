import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Role = 'owner' | 'staff' | 'driver';
export type Perm = 'suppliers' | 'expenses' | 'verify_payments' | 'rate_override' | 'reports';

export interface Ctx {
  userId: string;
  email: string | null;
  name: string;
  businessId: string;
  businessName: string;
  role: Role;
  perms: Record<Perm, boolean>;
  settings: Record<string, unknown>;
  can: (p: Perm) => boolean;
}

/** The signed-in user's membership. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: m } = await supabase
    .from('business_members')
    .select('business_id, role, permissions, display_name, businesses(name, settings)')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!m) return { userId: user.id, email: user.email ?? null, name: '', businessId: '', businessName: '', role: 'staff', perms: {} as Ctx['perms'], settings: {}, can: () => false };
  const biz = (Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name: string; settings: Record<string, unknown> } | null;
  const role = m.role as Role;
  const raw = (m.permissions ?? {}) as Record<string, boolean>;
  const perms = Object.fromEntries((['suppliers', 'expenses', 'verify_payments', 'rate_override', 'reports'] as Perm[])
    .map((p) => [p, role === 'owner' || (role === 'staff' && raw[p] === true)])) as Ctx['perms'];
  return {
    userId: user.id, email: user.email ?? null, name: m.display_name || (user.user_metadata?.full_name as string) || '',
    businessId: m.business_id, businessName: biz?.name ?? '', role, perms, settings: biz?.settings ?? {},
    can: (p) => perms[p],
  };
});

/** For pages: requires a business member; redirects otherwise. */
export async function requireCtx(opts: { office?: boolean; owner?: boolean; perm?: Perm } = {}): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (!ctx.businessId) redirect('/onboarding');
  if (opts.office && ctx.role === 'driver') redirect('/driver');
  if (opts.owner && ctx.role !== 'owner') redirect('/');
  if (opts.perm && !ctx.can(opts.perm)) redirect('/');
  return ctx;
}
