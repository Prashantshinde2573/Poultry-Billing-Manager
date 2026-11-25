import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { logError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook (payment.captured / order.paid / payment.failed).
 * A backup for when the browser closes before the payment is confirmed.
 * Dashboard → Settings → Webhooks → URL https://<your-domain>/api/razorpay/webhook
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature') ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const pay = evt?.payload?.payment?.entity;
  const orderId: string | undefined = pay?.order_id ?? evt?.payload?.order?.entity?.id;
  if (!orderId) return NextResponse.json({ ok: true, ignored: true });
  const admin = createServiceClient();
  if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
    const { error } = await admin.rpc('system_apply_plan_order', { p_razorpay_order_id: orderId, p_razorpay_payment_id: pay?.id ?? `pay_${orderId.slice(6)}` });
    if (error && !/NOT_FOUND/.test(error.message)) {
      await logError({ source: 'server', message: error.message, code: 'RAZORPAY_WEBHOOK', path: '/api/razorpay/webhook', meta: { order: orderId, event: evt.event } });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  } else if (evt.event === 'payment.failed') {
    await admin.rpc('system_fail_plan_order', { p_razorpay_order_id: orderId });
  }
  return NextResponse.json({ ok: true });
}
