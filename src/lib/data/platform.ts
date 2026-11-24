import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient as createAnon } from '@supabase/supabase-js';

/** Public plan list + platform settings are the same for everyone: cache them for 5 minutes (cleared when the admin saves). */
function anon() {
  return createAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
const cachedPlans = unstable_cache(async () => { const { data, error } = await anon().rpc('public_plans'); if (error) throw error; return data ?? []; }, ['public_plans'], { revalidate: 300, tags: ['platform'] });
const cachedPlatform = unstable_cache(async () => { const { data, error } = await anon().rpc('public_platform'); if (error) throw error; return data; }, ['public_platform'], { revalidate: 300, tags: ['platform'] });

export interface PublicPlan {
  id: string; name: string; name_mr: string | null; name_hi: string | null;
  blurb: string | null; blurb_mr: string | null; blurb_hi: string | null;
  monthly: number | null; half_yearly: number | null; yearly: number | null;
  modules: string[]; max_staff: number | null; max_drivers: number | null; max_vehicles: number | null;
  features: { en: string; mr: string; hi: string }[]; highlight: boolean;
}
export interface Platform { brand_name: string; whatsapp: string | null; upi_id: string | null; payee_name: string | null; support_phone: string | null; support_email: string | null; trial_days: number }

export async function publicPlans(): Promise<PublicPlan[]> {
  try {
    return (await cachedPlans()) as PublicPlan[];
  } catch { return []; }
}

export async function platform(): Promise<Platform> {
  try {
    const data = await cachedPlatform();
    if (data) return data as Platform;
  } catch { /* not configured */ }
  return { brand_name: 'PoulGo', whatsapp: null, upi_id: null, payee_name: null, support_phone: null, support_email: null, trial_days: 14 };
}

export const priceFor = (p: Pick<PublicPlan, 'monthly' | 'half_yearly' | 'yearly'>, months: 1 | 6 | 12) =>
  months === 1 ? p.monthly : months === 6 ? p.half_yearly ?? (p.monthly != null ? p.monthly * 5 : null) : p.yearly ?? (p.monthly != null ? p.monthly * 10 : null);
