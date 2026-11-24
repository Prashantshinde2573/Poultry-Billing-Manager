import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Ctx } from '@/lib/session';

export async function rpc<T = any>(fn: string, ctx: Ctx, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_business_id: ctx.businessId, ...args });
  if (error) throw new Error(error.message);
  return data as T;
}

export interface PartyRow {
  id: string; name: string; phone: string | null; address: string | null; status: string; customer_type: string | null;
  is_customer: boolean; is_supplier: boolean; default_rate: string | null; receivable: string | null; payable: string | null;
  last_activity: string | null; version: number;
}

export async function listParties(ctx: Ctx, kind: 'CUSTOMER' | 'SUPPLIER') {
  return rpc<PartyRow[]>('list_parties', ctx, { p_kind: kind });
}

export async function sizes(ctx: Ctx) {
  const supabase = await createClient();
  const { data } = await supabase.from('bird_sizes').select('id, name, name_mr, name_hi, sort_order, active').eq('business_id', ctx.businessId).order('sort_order');
  return data ?? [];
}

export async function recentLedger(ctx: Ctx, limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ledger_transactions')
    .select('id, party_id, ledger, txn_date, entry_type, debit, credit, description, created_at, parties(name)')
    .eq('business_id', ctx.businessId)
    .neq('entry_type', 'OPENING')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({ ...r, party_name: Array.isArray(r.parties) ? r.parties[0]?.name : r.parties?.name }));
}

export interface SizeOpt { id: string; name: string; name_mr: string | null; name_hi: string | null; rate: string | null }

/** Active bird sizes with today's rate of the given kind (latest effective_from ≤ today). */
export async function sizesWithRates(ctx: Ctx, kind: 'SALE' | 'PURCHASE', today: string): Promise<SizeOpt[]> {
  const supabase = await createClient();
  const [{ data: s }, { data: r }] = await Promise.all([
    supabase.from('bird_sizes').select('id, name, name_mr, name_hi, sort_order').eq('business_id', ctx.businessId).eq('active', true).order('sort_order'),
    supabase.from('bird_size_rates').select('bird_size_id, rate, effective_from').eq('business_id', ctx.businessId).eq('kind', kind)
      .lte('effective_from', today).order('effective_from', { ascending: false }),
  ]);
  const latest = new Map<string, string>();
  for (const x of r ?? []) if (!latest.has(x.bird_size_id)) latest.set(x.bird_size_id, String(x.rate));
  return (s ?? []).map((x) => ({ id: x.id, name: x.name, name_mr: x.name_mr, name_hi: x.name_hi, rate: latest.get(x.id) ?? null }));
}

export interface PartyOpt { id: string; name: string; phone: string | null; balance: string; rate: string | null }

export async function partyOptions(ctx: Ctx, kind: 'CUSTOMER' | 'SUPPLIER'): Promise<PartyOpt[]> {
  const rows = await listParties(ctx, kind);
  return rows.filter((r) => r.status === 'ACTIVE').map((r) => ({
    id: r.id, name: r.name, phone: r.phone, rate: r.default_rate,
    balance: String((kind === 'CUSTOMER' ? r.receivable : r.payable) ?? '0'),
  }));
}

export async function tripOptions(ctx: Ctx, openOnly = true) {
  const supabase = await createClient();
  let q = supabase.from('trips').select('id, trip_no, trip_date, status').eq('business_id', ctx.businessId).order('trip_date', { ascending: false }).limit(40);
  if (openOnly) q = q.not('status', 'in', '(SETTLED,CANCELLED)');
  const { data } = await q;
  return data ?? [];
}

export async function fleet(ctx: Ctx) {
  const supabase = await createClient();
  const [{ data: drivers }, { data: vehicles }] = await Promise.all([
    supabase.from('drivers').select('id, name, phone, license_no, active, user_id').eq('business_id', ctx.businessId).order('name'),
    supabase.from('vehicles').select('id, registration_no, ownership, description, active').eq('business_id', ctx.businessId).order('registration_no'),
  ]);
  return { drivers: drivers ?? [], vehicles: vehicles ?? [] };
}

export async function categories(ctx: Ctx) {
  const supabase = await createClient();
  const { data } = await supabase.from('expense_categories').select('id, name, name_mr, name_hi, is_trip_cost, active').eq('business_id', ctx.businessId).order('name');
  return data ?? [];
}

/** First element of a to-one embed (supabase-js may return object or array). */
export function one<T>(x: T | T[] | null | undefined): T | null {
  return Array.isArray(x) ? x[0] ?? null : x ?? null;
}
