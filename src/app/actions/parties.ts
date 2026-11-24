'use server';
import { z } from 'zod';
import { call, invalid, zKey, zMoneyOpt, zSignedMoney, zText, zId, zDate, zMoney } from './_call';

const partySchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional().default(''),
  address: zText(200),
  notes: zText(500),
  is_customer: z.boolean().default(false),
  is_supplier: z.boolean().default(false),
  customer_type: z.enum(['TRADER', 'RETAILER', 'HOTEL', 'SHOP', 'OTHER']).optional(),
  default_rate: zMoneyOpt,
  default_purchase_rate: zMoneyOpt,
  opening_receivable: z.union([zSignedMoney, z.literal('')]).optional(),
  opening_payable: z.union([zSignedMoney, z.literal('')]).optional(),
  allow_duplicate: z.boolean().optional(),
});

export async function createParty(input: z.input<typeof partySchema>, key: string) {
  const v = partySchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  if (!zKey.safeParse(key).success) return invalid(new z.ZodError([]));
  return call<{ id: string; duplicate: boolean }>('create_party', { p: v.data, p_idempotency_key: key });
}

export async function updateParty(partyId: string, version: number, input: Partial<z.input<typeof partySchema>>) {
  const v = partySchema.partial().safeParse(input);
  if (!v.success) return invalid(v.error);
  const p = Object.fromEntries(Object.entries(v.data).filter(([, x]) => x !== undefined));
  return call('update_party', { p_party_id: zId.parse(partyId), p_expected_version: version, p });
}

export async function setPartyStatus(partyId: string, status: 'ACTIVE' | 'INACTIVE') {
  return call('set_party_status', { p_party_id: zId.parse(partyId), p_status: status });
}

const adjSchema = z.object({
  party_id: zId, ledger: z.enum(['RECEIVABLE', 'PAYABLE']), direction: z.enum(['INCREASE', 'DECREASE']),
  amount: zMoney, date: zDate, reason: z.string().trim().min(3).max(300),
});
export async function ledgerAdjustment(input: z.input<typeof adjSchema>) {
  const v = adjSchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  const d = v.data;
  return call('record_ledger_adjustment', { p_party_id: d.party_id, p_ledger: d.ledger, p_direction: d.direction, p_amount: d.amount, p_date: d.date, p_reason: d.reason });
}

export async function logWhatsapp(partyId: string | null, type: string, date: string | null, phone: string, preview: string) {
  return call('log_whatsapp_share', { p_party_id: partyId, p_type: type, p_date: date, p_phone: phone, p_preview: preview.slice(0, 2000) });
}
