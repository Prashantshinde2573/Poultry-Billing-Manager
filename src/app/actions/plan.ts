'use server';
import { call } from './_call';

export async function requestPlan(planId: string, months: 1 | 6 | 12, reference: string, note = '') {
  if (![1, 6, 12].includes(months)) return { ok: false as const, code: 'VALIDATION', detail: 'months' };
  return call('request_plan', { p_plan_id: planId, p_months: months, p_reference: reference.slice(0, 80), p_note: note.slice(0, 300) });
}
