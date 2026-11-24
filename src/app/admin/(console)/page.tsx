import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/session';
import { SectionTitle, LinkButton, Empty } from '@/components/ui/core';
import { Kpi, StateBadge, dmy, rs, daysTo } from '@/components/admin/bits';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: ov }, { data: biz }, { data: reqs }, { data: leads }] = await Promise.all([
    supabase.rpc('admin_overview'), supabase.rpc('admin_businesses'), supabase.rpc('admin_requests'), supabase.rpc('admin_leads'),
  ]);
  const list = (biz ?? []) as any[];
  const attention = list.filter((b) => b.state === 'GRACE' || b.state === 'EXPIRED' || (b.state === 'ACTIVE' && daysTo(b.renews_at) <= 7))
    .sort((a, b) => a.renews_at.localeCompare(b.renews_at)).slice(0, 8);
  const months = (ov?.revenue_by_month ?? []) as { month: string; amount: number }[];
  const max = Math.max(1, ...months.map((m) => Number(m.amount)));
  const newReqs = ((reqs ?? []) as any[]).filter((r) => r.status === 'NEW');
  const newLeads = ((leads ?? []) as any[]).filter((l) => l.status === 'NEW').slice(0, 5);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Overview</h1><p className="text-[14px] text-ink-muted">{ov?.total ?? 0} businesses on PoulGo</p></div>
        <LinkButton href="/admin/businesses?new=1">Add business</LinkButton>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Monthly recurring" value={rs(ov?.mrr)} sub="paid plans, per month" />
        <Kpi label="Collected this month" value={rs(ov?.revenue_month)} sub={`Last month ${rs(ov?.revenue_last_month)}`} />
        <Kpi label="Paying" value={ov?.active ?? 0} sub={`${ov?.trial ?? 0} on trial`} tone="good" />
        <Kpi label="Need attention" value={Number(ov?.ending ?? 0) + Number(ov?.grace ?? 0) + Number(ov?.expired ?? 0)} sub={`${ov?.ending ?? 0} ending · ${ov?.grace ?? 0} grace · ${ov?.expired ?? 0} ended`} tone="warn" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle action={<Link href="/admin/businesses?f=attention">All</Link>}>Renew soon</SectionTitle>
          {attention.length === 0 ? <Empty title="Nobody is due in the next 7 days" /> : (
            <div className="card divide-y divide-line px-4">
              {attention.map((b) => (
                <Link key={b.id} href={`/admin/businesses/${b.id}`} className="press flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><p className="break-words font-medium">{b.name}</p><p className="break-words text-[13px] text-ink-muted">{b.plan_name} · till {dmy(b.renews_at)}{b.city ? ` · ${b.city}` : ''}</p></div>
                  <StateBadge state={b.state} planId={b.plan_id} renewsAt={b.renews_at} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <SectionTitle>Collected, last 12 months</SectionTitle>
          <div className="card p-4">
            {months.length === 0 ? <p className="py-8 text-center text-[14px] text-ink-muted">No payments recorded yet</p> : (
              <div className="flex h-44 items-end gap-1.5">
                {months.map((m) => (
                  <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${m.month}: ${rs(m.amount)}`}>
                    <div className="w-full rounded-t-[6px] bg-aqua" style={{ height: `${Math.max(4, (Number(m.amount) / max) * 150)}px` }} />
                    <span className="text-[11px] text-ink-muted">{new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[13px] text-ink-muted">This year: <span className="font-semibold text-ink">{rs(ov?.revenue_year)}</span></p>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle action={<Link href="/admin/requests">All</Link>}>Renewal requests</SectionTitle>
          {newReqs.length === 0 ? <Empty title="No pending requests" /> : (
            <div className="card divide-y divide-line px-4">
              {newReqs.slice(0, 5).map((r) => (
                <Link key={r.id} href={`/admin/businesses/${r.business_id}?renew=${r.id}`} className="press flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="break-words font-medium">{r.business_name}</p><p className="break-words text-[13px] text-ink-muted">{r.plan_name} · {r.months} mo · UTR {r.reference ?? '—'}</p></div>
                  <span className="tabular font-semibold">{rs(r.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <SectionTitle action={<Link href="/admin/leads">All</Link>}>New enquiries</SectionTitle>
          {newLeads.length === 0 ? <Empty title="No new enquiries" /> : (
            <div className="card divide-y divide-line px-4">
              {newLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="break-words font-medium">{l.name}{l.business_name ? ` · ${l.business_name}` : ''}</p><p className="break-words text-[13px] text-ink-muted">{l.city ?? '—'} · {dmy(l.created_at)}</p></div>
                  <a href={`tel:${l.phone}`} className="tabular shrink-0 text-[14px] font-medium text-aqua-deep">{l.phone}</a>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
