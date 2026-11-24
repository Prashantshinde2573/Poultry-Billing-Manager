'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCtx } from '@/lib/session';
import { logError } from '@/lib/report-error';

/** Browser errors (error boundaries, window.onerror) → super admin's error log. */
export async function reportClientError(p: { message: string; stack?: string; digest?: string; path?: string; meta?: Record<string, unknown> }) {
  const h = await headers();
  await logError({
    source: 'client', message: String(p.message ?? '').slice(0, 500), stack: p.stack?.slice(0, 4000), digest: p.digest?.slice(0, 80),
    path: p.path?.slice(0, 300), user_agent: h.get('user-agent')?.slice(0, 300) ?? undefined, meta: p.meta,
  });
}

export async function markNotificationsSeen() {
  const supabase = await createClient();
  await supabase.rpc('mark_notifications_seen');
  revalidatePath('/', 'layout');
}

/** Owner's activity log, one page at a time. */
export async function loadActivity(before: string | null, actor: string | null) {
  const ctx = await getCtx();
  if (!ctx?.businessId || ctx.role !== 'owner') return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('business_activity', { p_business_id: ctx.businessId, p_before: before, p_actor: actor, p_limit: 40 });
  return (data ?? []) as any[];
}

export async function resolveErrors(ids: number[] | null) {
  const ctx = await getCtx();
  if (!ctx?.superAdmin) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_resolve_errors', { p_ids: ids });
  revalidatePath('/admin', 'layout');
  return { ok: !error };
}
