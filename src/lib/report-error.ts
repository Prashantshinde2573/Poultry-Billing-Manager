import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface ErrorReport {
  source: 'server' | 'client' | 'action';
  message: string;
  code?: string;
  path?: string;
  digest?: string;
  stack?: string;
  user_agent?: string;
  meta?: Record<string, unknown>;
}

/** Saves an error for the super admin's error log. Never throws. */
export async function logError(r: ErrorReport) {
  try {
    const supabase = await createClient();
    await supabase.rpc('log_error', { p: r });
  } catch {
    try {
      // outside a request (no cookies) — report anonymously over REST
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      await fetch(`${url}/rest/v1/rpc/log_error`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: r }), cache: 'no-store',
      });
    } catch { /* give up quietly */ }
  }
}
