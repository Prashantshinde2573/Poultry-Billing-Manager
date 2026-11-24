import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fromDbError, type ActionResult } from '@/lib/errors';
import { getCtx, type Ctx } from '@/lib/session';

/** Runs an RPC as the signed-in user. business_id always comes from the session, never the client. */
export async function call<T = any>(fn: string, args: Record<string, unknown>, opts: { business?: boolean } = { business: true }): Promise<ActionResult<T>> {
  let ctx: Ctx | null = null;
  if (opts.business !== false) {
    ctx = await getCtx();
    if (!ctx?.businessId) return { ok: false, code: 'UNAUTHENTICATED', detail: '' };
  }
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.rpc(fn, ctx ? { p_business_id: ctx.businessId, ...args } : args);
    if (error) return fromDbError(error);
    revalidatePath('/', 'layout');
    return { ok: true, data: data as T };
  } catch (e) {
    return fromDbError({ message: (e as Error).message });
  }
}

export function invalid(err: z.ZodError): ActionResult<never> {
  const first = err.issues[0];
  return { ok: false, code: 'VALIDATION', detail: `${first?.path.join('.') || 'input'}: ${first?.message ?? ''}` };
}

// shared field schemas (strings are passed to Postgres as exact decimals)
export const zMoney = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/);
export const zMoneyOpt = z.union([zMoney, z.literal('')]).optional();
export const zSignedMoney = z.string().trim().regex(/^-?\d{1,10}(\.\d{1,2})?$/);
export const zKg = z.string().trim().regex(/^\d{1,7}(\.\d{1,3})?$/);
export const zQty = z.coerce.number().int().min(0).max(1000000);
export const zId = z.string().uuid();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zKey = z.string().min(8).max(80);
export const zText = (max = 500) => z.string().trim().max(max).optional().default('');
