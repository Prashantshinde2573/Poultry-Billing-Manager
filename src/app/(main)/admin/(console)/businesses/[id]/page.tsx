import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { BusinessDetail } from '@/components/admin/business-detail';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ renew?: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: d }, { data: plans }, { data: act }] = await Promise.all([
    supabase.rpc('admin_business', { p_business_id: id }), supabase.rpc('admin_plans'), supabase.rpc('admin_activity', { p_business_id: id }),
  ]);
  if (!d) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/businesses" className="press inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft"><ArrowLeft className="h-4 w-4" /> Businesses</Link>
      <BusinessDetail key={JSON.stringify((d as any).business.renews_at) + sp.renew} d={d} plans={(plans ?? []) as any} activity={(act ?? []) as any} renewRequest={sp.renew} />
    </div>
  );
}
