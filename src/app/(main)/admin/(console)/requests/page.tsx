import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { Badge, Empty } from '@/components/ui/core';
import { dmy, rs } from '@/components/admin/bits';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc('admin_requests');
  const rows = (data ?? []) as any[];
  return (
    <div className="space-y-5">
      <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Renewals</h1><p className="text-[14px] text-ink-muted">Owners send these after paying by UPI. Check the UTR in your bank app, then confirm.</p></div>
      {rows.length === 0 ? <Empty title="No renewal requests" /> : (
        <div className="card divide-y divide-line">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/businesses/${r.business_id}${r.status === 'NEW' ? `?renew=${r.id}` : ''}`} className="press flex items-center gap-4 px-5 py-4 hover:bg-mint/50">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{r.business_name}</p>
                <p className="break-words text-[13px] text-ink-muted">{r.plan_name} · {r.months} months · UTR {r.reference ?? '—'} · {dmy(r.created_at)}</p></div>
              <span className="tabular font-semibold">{rs(r.amount)}</span>
              <Badge tone={r.status === 'NEW' ? 'warn' : r.status === 'DONE' ? 'good' : 'slate'}>{r.status === 'NEW' ? 'To check' : r.status === 'DONE' ? 'Done' : 'Rejected'}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
