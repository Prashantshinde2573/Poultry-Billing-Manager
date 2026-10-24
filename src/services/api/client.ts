import type { ApiErrorBody, ApiResponse } from '@/types/api';
import { clearSession, getSessionToken } from './session';

/**
 * Low-level client for the Apps Script Web App.
 *
 * - POST with Content-Type text/plain: a "simple" CORS request, so the
 *   browser sends no preflight (Apps Script cannot answer OPTIONS).
 * - Apps Script always replies HTTP 200; the JSON `success` flag decides.
 * - Create actions carry a requestId, so retrying them is safe (the server
 *   returns the original record instead of creating a duplicate).
 */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

export function isApiConfigured(): boolean {
  return /^https?:\/\//.test(API_URL);
}

export class ApiRequestError extends Error {
  code: string;
  field?: string;
  details?: Record<string, unknown>;
  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.code = body.code;
    this.field = body.field;
    this.details = body.details;
  }
}

const RETRYABLE_ACTIONS = new Set([
  'healthCheck', 'me', 'getDashboard', 'getDashboardSummary', 'getDashboardChartData', 'listCustomers',
  'getCustomer', 'listTransactions', 'getTransaction', 'getCustomerStatement', 'getReports',
  'getOutstandingReport', 'getSettings', 'getSystemStatus', 'listUsers', 'getAuditLog',
  // idempotent thanks to requestId:
  'createCustomer', 'createBill', 'createPayment', 'createAdjustment',
]);

type Listener = () => void;
const authListeners = new Set<Listener>();
export function onAuthExpired(fn: Listener) {
  authListeners.add(fn);
  return () => {
    authListeners.delete(fn);
  };
}

export interface CallOptions {
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function once<T>(action: string, payload: unknown, opts: CallOptions): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiRequestError({ code: 'NOT_CONFIGURED', message: 'The backend URL is not configured. Set VITE_API_URL and rebuild the app.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getSessionToken(), requestId: opts.requestId, payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw new ApiRequestError({ code: 'ABORTED', message: 'Request cancelled.' });
    if (controller.signal.aborted) {
      throw new ApiRequestError({ code: 'TIMEOUT', message: 'The server took too long to respond. Please check your connection and try again.' });
    }
    throw new ApiRequestError({ code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your internet connection and try again.' });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError({
      code: 'BAD_RESPONSE',
      message: `The server returned an unexpected response (HTTP ${res.status}). Check that VITE_API_URL points to the deployed Web App "/exec" URL.`,
    });
  }
  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new ApiRequestError({ code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' });
  }
  if (!body.success) {
    if (body.error.code === 'UNAUTHENTICATED') {
      clearSession();
      authListeners.forEach((fn) => fn());
    }
    throw new ApiRequestError(body.error);
  }
  return body.data;
}

export async function apiCall<T>(action: string, payload: unknown = {}, opts: CallOptions = {}): Promise<T> {
  try {
    return await once<T>(action, payload, opts);
  } catch (e) {
    const err = e as ApiRequestError;
    const transient = err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT' || err.code === 'LOCK_TIMEOUT';
    if (transient && RETRYABLE_ACTIONS.has(action) && !opts.signal?.aborted) {
      await new Promise((r) => setTimeout(r, 1200));
      return once<T>(action, payload, opts);
    }
    throw err;
  }
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
