type Tone = 'aqua' | 'warn' | 'good' | 'slate' | 'violet' | 'bad' | 'ink';
export const ORDER_TONE: Record<string, Tone> = {
  DRAFT: 'slate', CONFIRMED: 'aqua', PARTIALLY_ALLOCATED: 'warn', ALLOCATED: 'violet', COMPLETED: 'good', CANCELLED: 'bad',
};
export const TRIP_TONE: Record<string, Tone> = {
  DRAFT: 'slate', ASSIGNED: 'aqua', LOADING: 'warn', DISPATCHED: 'violet', IN_PROGRESS: 'violet', COMPLETED: 'good', SETTLED: 'ink', CANCELLED: 'bad',
};
export const DELIVERY_TONE: Record<string, Tone> = { PENDING: 'slate', PARTIAL: 'warn', DELIVERED: 'good', FAILED: 'bad' };
export const PAY_TONE: Record<string, Tone> = { PENDING_VERIFICATION: 'warn', CONFIRMED: 'good', REJECTED: 'bad', VOID: 'slate' };
