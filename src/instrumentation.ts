import type { Instrumentation } from 'next';

export async function register() {}

/** Server render / route errors go to the super admin's error log. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  // redirects and notFound are control flow, not errors
  if (e?.digest?.startsWith('NEXT_REDIRECT') || e?.digest?.startsWith('NEXT_HTTP_ERROR_FALLBACK') || e?.digest === 'DYNAMIC_SERVER_USAGE') return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/log_error`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: {
        source: 'server', message: String(e?.message ?? err).slice(0, 500), digest: e?.digest, stack: e?.stack?.slice(0, 4000),
        path: request.path, user_agent: String((request.headers as Record<string, string | string[] | undefined>)['user-agent'] ?? '').slice(0, 300),
        meta: { method: request.method, route: context.routePath, type: context.routeType },
      } }),
      cache: 'no-store',
    });
  } catch { /* ignore */ }
};
