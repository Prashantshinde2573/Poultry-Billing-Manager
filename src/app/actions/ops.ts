'use server';
import { z } from 'zod';
import { call, invalid, zDate, zId, zKey, zKg, zMoney, zMoneyOpt, zQty, zText } from './_call';

const orderSchema = z.object({
  customer_id: zId, order_date: zDate, notes: zText(500), draft: z.boolean().optional(),
  items: z.array(z.object({ bird_size_id: zId, qty: z.coerce.number().int().min(1).max(1000000), expected_weight: z.union([zKg, z.literal('')]).optional(), rate: zMoneyOpt })).min(1).max(20),
});
export async function createOrder(input: z.input<typeof orderSchema>, key: string) {
  const v = orderSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call<{ id: string; order_no: string }>('create_order', { p: v.data, p_idempotency_key: key });
}

export async function setOrderStatus(orderId: string, status: 'CONFIRMED' | 'CANCELLED', reason?: string) {
  return call('set_order_status', { p_order_id: zId.parse(orderId), p_status: status, p_reason: reason ?? null });
}

const tripSchema = z.object({ trip_date: zDate, vehicle_id: z.union([zId, z.literal('')]).optional(), driver_id: z.union([zId, z.literal('')]).optional(), notes: zText(500) });
export async function createTrip(input: z.input<typeof tripSchema>, key: string) {
  const v = tripSchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  return call<{ id: string; trip_no: string }>('create_trip', { p: v.data, p_idempotency_key: key });
}

export async function updateTrip(tripId: string, version: number, input: z.input<typeof tripSchema>) {
  const v = tripSchema.partial().safeParse(input);
  if (!v.success) return invalid(v.error);
  return call('update_trip', { p_trip_id: zId.parse(tripId), p_expected_version: version, p: v.data });
}

export async function allocateToTrip(tripId: string, lines: { order_item_id: string; qty: number; rate?: string }[]) {
  const v = z.array(z.object({ order_item_id: zId, qty: z.coerce.number().int().min(1), rate: zMoneyOpt })).min(1).safeParse(lines);
  if (!v.success) return invalid(v.error);
  return call('allocate_to_trip', { p_trip_id: zId.parse(tripId), p_allocations: v.data.map((l) => ({ ...l, rate: l.rate || null })) });
}

export async function removeAllocation(allocationId: string) {
  return call('remove_allocation', { p_allocation_id: zId.parse(allocationId) });
}

export async function recordLoading(tripId: string, entries: { bird_size_id: string; loaded_qty: number; loaded_weight?: string }[]) {
  const v = z.array(z.object({ bird_size_id: zId, loaded_qty: zQty, loaded_weight: z.union([zKg, z.literal('')]).optional() })).safeParse(entries);
  if (!v.success) return invalid(v.error);
  return call('record_loading', { p_trip_id: zId.parse(tripId), p_entries: v.data });
}

/** Birds per size + one total weight for the whole load. */
export async function recordLoad(tripId: string, entries: { bird_size_id: string; loaded_qty: number }[], totalWeight: string) {
  const w = z.union([zKg, z.literal('')]).safeParse(totalWeight.trim());
  if (!w.success) return { ok: false as const, code: 'VALIDATION', detail: 'weight' };
  const r = await recordLoading(tripId, entries);
  if (!r.ok) return r;
  return call('set_trip_load_weight', { p_trip_id: zId.parse(tripId), p_weight: w.data === '' ? null : w.data });
}

/** Dead / damaged birds reported during the trip (driver or office). */
export async function reportTripLoss(tripId: string, sizeId: string, qty: number, kind: 'DEATH' | 'DAMAGE', note: string) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return { ok: false as const, code: 'VALIDATION', detail: 'birds' };
  return call('report_trip_loss', { p_trip_id: zId.parse(tripId), p_bird_size_id: zId.parse(sizeId), p_qty: qty, p_kind: kind, p_note: note.slice(0, 300) });
}

export async function setTripStatus(tripId: string, status: string) {
  return call('set_trip_status', { p_trip_id: zId.parse(tripId), p_status: status });
}

const deliverySchema = z.object({
  items: z.array(z.object({
    allocation_id: zId, delivered_qty: zQty, returned_qty: zQty.optional(), damaged_qty: zQty.optional(),
    weight_kg: z.union([zKg, z.literal('')]).optional(), rate: zMoneyOpt,
  })).min(1),
  reason: zText(300), notes: zText(500), final_amount: zMoneyOpt, adjustment_reason: zText(300),
  collection: z.object({ amount: zMoney, method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']), reference: zText(60) }).optional(),
});
export async function recordDelivery(tripId: string, customerId: string, input: z.input<typeof deliverySchema>, key: string) {
  const v = deliverySchema.safeParse(input);
  if (!v.success || !zKey.safeParse(key).success) return invalid(v.error ?? new z.ZodError([]));
  const p = { ...v.data, items: v.data.items.map((i) => ({ ...i, weight_kg: i.weight_kg || (i.delivered_qty > 0 ? i.weight_kg : '0'), rate: i.rate || null })) };
  return call<{ delivery_id: string; status: string; bill_no: string | null; bill_amount: string | null; payment_status: string | null; balance: string | null }>(
    'record_delivery', { p_trip_id: zId.parse(tripId), p_customer_id: zId.parse(customerId), p, p_idempotency_key: key });
}

export async function recordCollection(tripId: string, customerId: string, input: { amount: string; method: string; reference?: string }, key: string) {
  const v = z.object({ amount: zMoney, method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']), reference: zText(60) }).safeParse(input);
  if (!v.success) return invalid(v.error);
  return call('record_collection', { p_trip_id: zId.parse(tripId), p_customer_id: zId.parse(customerId), p: v.data, p_idempotency_key: key });
}

export async function recordStockLoss(tripId: string, sizeId: string, qty: number, kind: 'DEATH' | 'DAMAGE' | 'SHORTAGE', note: string) {
  return call('record_stock_loss', { p_trip_id: zId.parse(tripId), p_bird_size_id: zId.parse(sizeId), p_qty: qty, p_kind: kind, p_note: note });
}

export async function settleTrip(tripId: string, cashHandover: string, note: string) {
  if (!zMoney.safeParse(cashHandover || '0').success) return { ok: false as const, code: 'VALIDATION', detail: 'cash' };
  return call('settle_trip', { p_trip_id: zId.parse(tripId), p: { cash_handover: cashHandover || '0', differences_note: note } });
}

export async function reopenTrip(tripId: string, reason: string) {
  return call('reopen_trip', { p_trip_id: zId.parse(tripId), p_reason: reason });
}
