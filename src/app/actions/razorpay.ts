'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCtx } from '@/lib/session';
import { fromDbError, type ActionResult } from '@/lib/errors';
import { createRazorpayOrder, razorpayKeys, verifyPaymentSignature } from '@/lib/razorpay';
import { logError } from '@/lib/report-error';

export interface CheckoutOrder { keyId: string; orderId: string; amount: number; planName: string; businessName: string; email: string | null; name: string }

/** Owner starts an online payment. The price comes from the database, never the browser. */
export async function startPlanPayment(planId: string, months: number): Promise<ActionResult<CheckoutOrder>> {
  const parsed = z.object({ planId: z.string().min(1).max(40), months: z.union([z.literal(1), z.literal(6), z.literal(12)]) }).safeParse({ planId, months });
  if (!parsed.success) return { ok: false, code: 'VALIDATION', detail: 'plan' };
  const ctx = await getCtx();
  if (!ctx?.businessId) return { ok: false, code: 'UNAUTHENTICATED', detail: '' };
  if (ctx.role !== 'owner') return { ok: false, code: 'FORBIDDEN', detail: '' };
  const keys = razorpayKeys();
  if (!keys) return { ok: false, code: 'VALIDATION', detail: 'Online payment is not set up yet' };
  const supabase = await createClient();
  const q = await supabase.rpc('plan_quote', { p_business_id: ctx.businessId, p_plan_id: planId, p_months: months });
  if (q.error) return fromDbError(q.error);
  const amount = Number(q.data.amount);
  try {
    const order = await createRazorpayOrder(amount, `pg_${ctx.businessId.slice(0, 8)}_${Date.now()}`, {
      business_id: ctx.businessId, plan_id: planId, months: String(months), business: ctx.businessName.slice(0, 200),
    });
    const a = await supabase.rpc('attach_plan_order', { p_business_id: ctx.businessId, p_plan_id: planId, p_months: months, p_razorpay_order_id: order.id });
    if (a.error) return fromDbError(a.error);
    return { ok: true, data: { keyId: keys.keyId, orderId: order.id, amount: order.amount, planName: q.data.plan_name, businessName: ctx.businessName, email: ctx.email, name: ctx.name } };
  } catch (e) {
    await logError({ source: 'action', message: (e as Error).message, path: 'startPlanPayment', code: 'RAZORPAY' });
    return { ok: false, code: 'NETWORK', detail: '' };
  }
}

/** Called by the browser after Razorpay checkout succeeds. The signature is checked on the server. */
export async function confirmPlanPayment(p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<ActionResult<{ renews_at: string }>> {
  const ok = z.object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/), razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
  }).safeParse(p);
  if (!ok.success || !verifyPaymentSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) {
    await logError({ source: 'action', message: 'Razorpay signature mismatch', code: 'RAZORPAY_SIGNATURE', path: 'confirmPlanPayment', meta: { order: p?.razorpay_order_id } });
    return { ok: false, code: 'FORBIDDEN', detail: 'signature' };
  }
  const ctx = await getCtx();
  if (!ctx?.businessId) return { ok: false, code: 'UNAUTHENTICATED', detail: '' };
  const admin = createServiceClient();
  const { data: order } = await admin.from('plan_orders').select('business_id').eq('razorpay_order_id', p.razorpay_order_id).maybeSingle();
  if (!order || order.business_id !== ctx.businessId) return { ok: false, code: 'NOT_FOUND', detail: 'order' };
  const { data, error } = await admin.rpc('system_apply_plan_order', { p_razorpay_order_id: p.razorpay_order_id, p_razorpay_payment_id: p.razorpay_payment_id });
  if (error) {
    await logError({ source: 'action', message: error.message, code: 'RAZORPAY_APPLY', path: 'confirmPlanPayment', meta: { order: p.razorpay_order_id } });
    return fromDbError(error);
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { renews_at: data.renews_at } };
}
