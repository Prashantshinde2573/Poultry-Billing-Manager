import type { MessageKey } from './i18n';

/** Result shape every server action returns. */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; detail: string; extra?: Record<string, unknown> };

const KNOWN = new Set([
  'FORBIDDEN', 'UNAUTHENTICATED', 'NOT_FOUND', 'VALIDATION', 'CONFLICT', 'DUPLICATE', 'DUPLICATE_PARTY',
  'OVERPAYMENT_NOT_ALLOWED', 'OVERPAYMENT_CONFIRMATION_REQUIRED', 'OVER_ALLOCATION', 'RATE_MISSING',
  'STOCK_CONSUMED', 'SETTLEMENT_BLOCKED', 'POSSIBLE_DUPLICATE', 'IMMUTABLE',
]);

/** Turns a Postgres/Supabase error ("CODE: detail", optional JSON detail) into an ActionResult. */
export function fromDbError(err: { message?: string; details?: string | null; code?: string } | null | undefined): ActionResult<never> {
  const msg = err?.message ?? '';
  const m = /^([A-Z_]+):\s*(.*)$/s.exec(msg);
  let extra: Record<string, unknown> | undefined;
  if (err?.details) {
    try { const parsed = JSON.parse(err.details); extra = Array.isArray(parsed) ? { matches: parsed } : parsed; } catch { /* plain text */ }
  }
  if (m && KNOWN.has(m[1])) return { ok: false, code: m[1], detail: m[2], extra };
  if (/permission denied/i.test(msg)) return { ok: false, code: 'FORBIDDEN', detail: msg };
  if (/fetch failed|network/i.test(msg)) return { ok: false, code: 'NETWORK', detail: msg };
  if (err?.code === '23505') return { ok: false, code: 'DUPLICATE', detail: msg };
  console.error('[db]', msg);
  return { ok: false, code: 'UNKNOWN', detail: '' };
}

export function errorKey(code: string): MessageKey {
  return (`err.${KNOWN.has(code) || code === 'NETWORK' ? code : 'UNKNOWN'}`) as MessageKey;
}
