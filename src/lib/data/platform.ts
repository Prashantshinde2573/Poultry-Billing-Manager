import 'server-only';
import { createClient } from '@/lib/supabase/server';

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
    const supabase = await createClient();
    const { data } = await supabase.rpc('public_plans');
    return (data ?? []) as PublicPlan[];
  } catch { return []; }
}

export async function platform(): Promise<Platform> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc('public_platform');
    if (data) return data as Platform;
  } catch { /* not configured */ }
  return { brand_name: 'PoulGo', whatsapp: null, upi_id: null, payee_name: null, support_phone: null, support_email: null, trial_days: 14 };
}

export const priceFor = (p: Pick<PublicPlan, 'monthly' | 'half_yearly' | 'yearly'>, months: 1 | 6 | 12) =>
  months === 1 ? p.monthly : months === 6 ? p.half_yearly ?? (p.monthly != null ? p.monthly * 5 : null) : p.yearly ?? (p.monthly != null ? p.monthly * 10 : null);
