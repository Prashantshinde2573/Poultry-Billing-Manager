import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && secret ? { keyId, secret } : null;
}

export const razorpayEnabled = () => razorpayKeys() !== null;

/** Creates a Razorpay order. Amount is in rupees; Razorpay wants paise. */
export async function createRazorpayOrder(amountRupees: number, receipt: string, notes: Record<string, string>) {
  const k = razorpayKeys();
  if (!k) throw new Error('Razorpay is not configured');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt: receipt.slice(0, 40), notes }),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.id) throw new Error(`Razorpay order failed (${res.status}): ${body?.error?.description ?? 'unknown'}`);
  return body as { id: string; amount: number; currency: string };
}

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout success handler signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const k = razorpayKeys();
  if (!k) return false;
  const expected = createHmac('sha256', k.secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
