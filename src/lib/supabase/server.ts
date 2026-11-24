import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdmin } from '@supabase/supabase-js';

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return { url, key };
}

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseUrl();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — middleware refreshes the session */
        }
      },
    },
  });
}

/**
 * Service-role client. SERVER ONLY, used exclusively by the Owner-only
 * "create login" action after the caller has been verified as an owner.
 */
export function createServiceClient() {
  const { url } = supabaseUrl();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server');
  return createAdmin(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
