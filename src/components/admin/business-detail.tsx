'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Copy, KeyRound, Pause, Pencil, Play, Wallet } from 'lucide-react';
import { Badge, Button } from '@/components/ui/core';
import { SelectInput, TextArea, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { adminRenew, adminResetOwnerPassword, adminSetRequest, adminUpdateBusiness } from '@/app/actions/admin';
import { StateBadge, dmy, rs } from './bits';

type Plan = { id: string; name: string; monthly: number | null; half_yearly: number | null; yearly: number | null; active: boolean };

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-[16px] font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function BusinessDetail({ d, plans, activity, renewRequest }: { d: any; plans: Plan[]; activity: any[]; renewRequest?: string }) {
  const b = d.business;
  const router = useRouter();
  const toast = useToast();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const req = (d.requests as any[]).find((r) => r.id === renewRequest && r.status === 'NEW');
  const [sheet, setSheet] = useState<null | 'renew' | 'dates' | 'edit' | 'suspend'>(req ? 'renew' : null);
  const [creds, setCreds] = useState<string | null>(null);
  const { pending, err, setErr, run } = useSubmit();
  const done = (msg: string) => () => { toast(msg); setSheet(null); router.refresh(); };

  const [rn, setRn] = useState({ plan_id: req?.plan_id ?? (b.plan_id === 'trial' ? plans.find((p) => p.id !== 'trial')?.id ?? '' : b.plan_id), months: String(req?.months ?? 12), amount: req?.amount ? String(req.amount) : '', method: 'UPI', reference: req?.reference ?? '', paid_on: today, note: '' });
  const rnPlan = plans.find((p) => p.id === rn.plan_id);
  const suggested = rnPlan ? (rn.months === '1' ? rnPlan.monthly : rn.months === '6' ? rnPlan.half_yearly : rn.months === '12' ? rnPlan.yearly : rnPlan.monthly != null ? rnPlan.monthly * Number(rn.months) : null) : null;
  const [dt, setDt] = useState({ plan_id: b.plan_id, renews_at: b.renews_at, grace_until: b.grace_until ?? '' });
  const [ed, setEd] = useState({ name: b.name, city: b.city ?? '', phone: b.phone ?? '', owner_name: b.owner_name ?? '', notes: b.admin_notes ?? '' });
  const owner = (d.members as any[]).find((m) => m.role === 'owner');
  const loginShown = (l: string | null) => (l ?? '').replace(/^91(\d{10})@.*$/, '$1');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold tracking-[-0.02em]">{b.name}</h1>
          <p className="text-[14px] text-ink-muted">{[b.city, b.phone, `since ${dmy(b.created_at)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheet('renew')}><Wallet className="h-4 w-4" /> Record payment</Button>
          <Button variant="outline" onClick={() => setSheet('dates')}><CalendarPlus className="h-4 w-4" /> Plan & dates</Button>
          <Button variant="outline" onClick={() => setSheet('edit')}><Pencil className="h-4 w-4" /> Edit</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="stripe-card rounded-[20px] p-5 text-white lg:col-span-1">
          <div className="flex items-start justify-between gap-2"><p className="text-[14px] text-white/70">Plan</p><StateBadge state={b.state} planId={b.plan_id} renewsAt={b.renews_at} /></div>
          <p className="mt-1 text-[26px] font-semibold">{b.plan_name}</p>
          <p className="mt-4 text-[14px] text-white/80">Valid till <span className="font-semibold text-white">{dmy(b.renews_at)}</span></p>
          {b.grace_until && <p className="text-[14px] text-white/80">Grace till <span className="font-semibold text-white">{dmy(b.grace_until)}</span></p>}
          <div className="mt-5">
            {b.status === 'active'
              ? <Button variant="light" size="sm" onClick={() => setSheet('suspend')}><Pause className="h-4 w-4" /> Suspend</Button>
              : <Button variant="light" size="sm" disabled={pending} onClick={() => run(() => adminUpdateBusiness(b.id, { status: 'active' }), done('Business switched on'))}><Play className="h-4 w-4" /> Switch on</Button>}
          </div>
        </section>
        <Card title="Usage">
          <dl className="tabular grid grid-cols-2 gap-y-2 text-[14px]">
            {[['Customers', d.usage.customers], ['Suppliers', d.usage.suppliers], ['Bills (30 days)', d.usage.bills_30d], ['Trips (30 days)', d.usage.trips_30d], ['Staff', d.usage.staff], ['Drivers', d.usage.drivers], ['Vehicles', d.usage.vehicles]].map(([k, v]) => (
              <div key={k as string} className="contents"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card title="Logins">
          <ul className="space-y-3">
            {(d.members as any[]).map((m) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><p className="break-words text-[14.5px] font-medium">{m.name} <span className="font-normal text-ink-muted">· {m.role}</span>{!m.active && <Badge tone="bad">off</Badge>}</p>
                  <p className="break-words text-[12.5px] text-ink-muted">{loginShown(m.login)} · last seen {m.last_sign_in_at ? dmy(m.last_sign_in_at) : 'never'}</p></div>
                {m.role === 'owner' && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => adminResetOwnerPassword(m.user_id), (r) => setCreds(`PoulGo login for ${b.name}\nMobile / email: ${loginShown(m.login)}\nTemporary password: ${r.password}\nYou will set your own password after signing in.`))}><KeyRound className="h-4 w-4" /> Reset</Button>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {!sheet && <ErrorBox msg={err} />}
      {b.admin_notes && <p className="rounded-[16px] border border-line bg-white px-5 py-4 text-[14px] text-ink-soft"><span className="font-semibold text-ink">Notes: </span>{b.admin_notes}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payments">
          {(d.payments as any[]).length === 0 ? <p className="text-[14px] text-ink-muted">No payments yet.</p> : (
            <ul className="divide-y divide-line">
              {(d.payments as any[]).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <div className="min-w-0"><p className="font-medium">{dmy(p.paid_on)} · {plans.find((x) => x.id === p.plan_id)?.name ?? p.plan_id} · {p.months} mo</p>
                    <p className="break-words text-[12.5px] text-ink-muted">{p.method}{p.reference ? ` · ${p.reference}` : ''} · {dmy(p.period_from)} – {dmy(p.period_to)}</p></div>
                  <span className="tabular font-semibold">{rs(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Renewal requests">
          {(d.requests as any[]).length === 0 ? <p className="text-[14px] text-ink-muted">None.</p> : (
            <ul className="divide-y divide-line">
              {(d.requests as any[]).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <div className="min-w-0"><p className="font-medium">{plans.find((x) => x.id === r.plan_id)?.name ?? r.plan_id} · {r.months} mo · {rs(r.amount)}</p>
                    <p className="break-words text-[12.5px] text-ink-muted">{dmy(r.created_at)} · UTR {r.reference ?? '—'}</p></div>
                  {r.status === 'NEW' ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => adminSetRequest(r.id, 'REJECTED'), done('Request rejected'))}>Reject</Button>
                      <Button size="sm" onClick={() => { setRn({ ...rn, plan_id: r.plan_id, months: String(r.months), amount: r.amount ? String(r.amount) : '', reference: r.reference ?? '' }); setSheet('renew'); }}>Confirm</Button>
                    </div>
                  ) : <Badge tone={r.status === 'DONE' ? 'good' : 'slate'}>{r.status === 'DONE' ? 'Done' : 'Rejected'}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent activity">
        {activity.length === 0 ? <p className="text-[14px] text-ink-muted">Nothing yet.</p> : (
          <ul className="grid gap-x-6 text-[13.5px] sm:grid-cols-2">
            {activity.slice(0, 20).map((a, i) => <li key={i} className="flex justify-between gap-3 border-b border-line py-2"><span className="truncate">{String(a.action).replaceAll('_', ' ').toLowerCase()}</span><span className="shrink-0 text-ink-muted">{dmy(a.at)}</span></li>)}
          </ul>
        )}
      </Card>

      {/* --- sheets --- */}
      <Sheet open={sheet === 'renew'} onClose={() => { setSheet(null); setErr(null); }} title="Record payment & extend"
        footer={<><Button variant="outline" onClick={() => setSheet(null)}>Cancel</Button><Button disabled={pending || !rn.plan_id} onClick={() => run(() => adminRenew(b.id, { ...rn, months: Number(rn.months), amount: rn.amount || String(suggested ?? 0), request_id: req?.id }), done('Plan extended'))}>Save and extend</Button></>}>
        <div className="space-y-3">
          <p className="rounded-[14px] bg-mint px-4 py-3 text-[14px]">The new period starts from {dmy(b.renews_at > today ? b.renews_at : today)} and the business is switched on.</p>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Plan" value={rn.plan_id} onChange={(e) => setRn({ ...rn, plan_id: e.target.value })}>
              {plans.filter((p) => p.id !== 'trial').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
            <SelectInput label="Months" value={rn.months} onChange={(e) => setRn({ ...rn, months: e.target.value })}>
              {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Amount received" inputMode="decimal" prefix="₹" value={rn.amount} placeholder={suggested != null ? String(suggested) : ''} onChange={(e) => setRn({ ...rn, amount: e.target.value })} />
            <TextInput type="date" label="Paid on" value={rn.paid_on} max={today} onChange={(e) => setRn({ ...rn, paid_on: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Method" value={rn.method} onChange={(e) => setRn({ ...rn, method: e.target.value })}>{['UPI', 'CASH', 'BANK', 'OTHER'].map((m) => <option key={m}>{m}</option>)}</SelectInput>
            <TextInput label="UPI ref / UTR" value={rn.reference} onChange={(e) => setRn({ ...rn, reference: e.target.value })} />
          </div>
          <TextInput label="Note" value={rn.note} onChange={(e) => setRn({ ...rn, note: e.target.value })} />
          <ErrorBox msg={err} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'dates'} onClose={() => setSheet(null)} title="Plan & dates"
        footer={<><Button variant="outline" onClick={() => setSheet(null)}>Cancel</Button><Button disabled={pending} onClick={() => run(() => adminUpdateBusiness(b.id, dt), done('Saved'))}>Save</Button></>}>
        <div className="space-y-3">
          <p className="text-[14px] text-ink-muted">Changes here don&apos;t record a payment. Use them for corrections, free extensions and grace periods.</p>
          <SelectInput label="Plan" value={dt.plan_id} onChange={(e) => setDt({ ...dt, plan_id: e.target.value })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>
          <div className="grid grid-cols-2 gap-3">
            <TextInput type="date" label="Valid till" value={dt.renews_at} onChange={(e) => setDt({ ...dt, renews_at: e.target.value })} />
            <TextInput type="date" label="Grace till (optional)" value={dt.grace_until} onChange={(e) => setDt({ ...dt, grace_until: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {[3, 5, 7].map((n) => <Button key={n} size="sm" variant="outline" onClick={() => { const x = new Date(today); x.setDate(x.getDate() + n); setDt({ ...dt, grace_until: x.toISOString().slice(0, 10) }); }}>Grace {n} days</Button>)}
            {dt.grace_until && <Button size="sm" variant="ghost" onClick={() => setDt({ ...dt, grace_until: '' })}>Remove grace</Button>}
          </div>
          <ErrorBox msg={err} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit business"
        footer={<><Button variant="outline" onClick={() => setSheet(null)}>Cancel</Button><Button disabled={pending} onClick={() => run(() => adminUpdateBusiness(b.id, ed), done('Saved'))}>Save</Button></>}>
        <div className="space-y-3">
          <TextInput label="Business name" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="City" value={ed.city} onChange={(e) => setEd({ ...ed, city: e.target.value })} />
            <TextInput label="Phone" value={ed.phone} onChange={(e) => setEd({ ...ed, phone: e.target.value })} />
          </div>
          <TextInput label="Owner name" value={ed.owner_name} onChange={(e) => setEd({ ...ed, owner_name: e.target.value })} />
          <TextArea label="Notes (only you see these)" value={ed.notes} onChange={(e) => setEd({ ...ed, notes: e.target.value })} />
          <ErrorBox msg={err} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'suspend'} onClose={() => setSheet(null)} title={`Suspend ${b.name}?`}
        footer={<><Button variant="outline" onClick={() => setSheet(null)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={() => run(() => adminUpdateBusiness(b.id, { status: 'suspended' }), done('Business suspended'))}>Suspend</Button></>}>
        <p className="text-[15px]">Owner, staff and drivers will see a &ldquo;paused&rdquo; screen and can&apos;t open their data. Nothing is deleted; switch it on any time.</p>
      </Sheet>

      <Sheet open={!!creds} onClose={() => setCreds(null)} title="New temporary password">
        {creds && <div className="space-y-3">
          <pre className="whitespace-pre-wrap rounded-[16px] bg-mint p-4 font-sans text-[15px]">{creds}</pre>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(creds)}><Copy className="h-4 w-4" /> Copy</Button>
        </div>}
      </Sheet>
    </div>
  );
}
