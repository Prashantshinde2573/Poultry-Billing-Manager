import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Ctx } from '@/lib/session';

export interface Notice { id: string; kind: string; params: Record<string, any>; link: string | null; at: string; unread: boolean }

/** Notifications for the signed-in person, plus a "plan ending" reminder for owners. */
export const myNotifications = cache(async (ctx: Ctx | null, limit = 30): Promise<{ items: Notice[]; unread: number }> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_notifications', { p_limit: limit });
  const items = ((data?.items ?? []) as Notice[]).slice();
  let unread = Number(data?.unread ?? 0);
  if (ctx?.businessId && ctx.role === 'owner' && ctx.plan.id && ctx.state !== 'SUSPENDED' && ctx.daysLeft <= 7) {
    items.unshift({ id: 'plan-ending', kind: 'PLAN_ENDING', params: { n: Math.max(ctx.daysLeft, 0) }, link: '/app/plan', at: new Date().toISOString(), unread: true });
    unread += 1;
  }
  return { items, unread };
});

export function planNote(ctx: Ctx, t: (k: any, p?: any) => string): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (ctx.state === 'ACTIVE') {
    const n = Math.max(ctx.daysLeft, 0);
    return { text: n === 0 ? t('plan.lastDay') : t('plan.daysLeft', { n }), tone: n <= 7 ? 'warn' : 'good' };
  }
  return { text: t(`plan.state.${ctx.state}`), tone: ctx.state === 'GRACE' ? 'warn' : 'bad' };
}
