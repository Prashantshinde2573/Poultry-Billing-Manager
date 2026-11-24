'use client';
import { nav } from '@/components/shell/perm';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/core';
import { SelectInput, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { adminCreateBusiness } from '@/app/actions/admin';
import { StateBadge, daysTo, dmy, rs } from './bits';

type Biz = { id: string; name: string; city: string | null; owner_name: string | null; owner_login: string | null; plan_id: string; plan_name: string; renews_at: string; state: string; members: number; customers: number; last_activity: string | null; requests: number };
type Plan = { id: string; name: string; monthly: number | null; half_yearly: number | null; yearly: number | null };

const FILTERS = [
  ['all', 'All'], ['paying', 'Paying'], ['trial', 'Trial'], ['attention', 'Need attention'], ['ended', 'Ended'], ['suspended', 'Suspended'],
] as const;

export function BusinessList({ list, plans, startNew, startFilter }: { list: Biz[]; plans: Plan[]; startNew: boolean; startFilter: string }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState(startFilter);
  const [add, setAdd] = useState(startNew);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((b) => {
      if (s && ![b.name, b.city, b.owner_name, b.owner_login].some((x) => (x ?? '').toLowerCase().includes(s))) return false;
      if (f === 'paying') return b.plan_id !== 'trial' && (b.state === 'ACTIVE' || b.state === 'GRACE');
      if (f === 'trial') return b.plan_id === 'trial';
      if (f === 'attention') return b.state === 'GRACE' || b.state === 'EXPIRED' || (b.state === 'ACTIVE' && daysTo(b.renews_at) <= 7) || b.requests > 0;
      if (f === 'ended') return b.state === 'EXPIRED';
      if (f === 'suspended') return b.state === 'SUSPENDED';
      return true;
    });
  }, [list, q, f]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Businesses</h1><p className="text-[14px] text-ink-muted">{list.length} total</p></div>
        <Button onClick={() => setAdd(true)}><Plus className="h-5 w-5" /> Add business</Button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, owner, mobile" className="input pl-10" aria-label="Search" />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF(k)} aria-pressed={f === k}
              className={`press h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${f === k ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_130px_110px] gap-4 border-b border-line px-5 py-3 text-[12.5px] font-medium text-ink-muted md:grid">
          <span>Business</span><span>Owner</span><span>Plan</span><span>Valid till</span><span className="text-right">Status</span>
        </div>
        {rows.length === 0 && <p className="px-5 py-10 text-center text-[14px] text-ink-muted">No businesses match.</p>}
        {rows.map((b) => (
          <Link key={b.id} href={`/admin/businesses/${b.id}`} className="press grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3.5 last:border-0 hover:bg-mint/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_130px_110px]">
            <div className="min-w-0">
              <p className="break-words font-medium">{b.name}{b.requests > 0 && <span className="ml-2 rounded-full bg-aqua px-1.5 text-[11px] font-semibold">renewal</span>}</p>
              <p className="break-words text-[13px] text-ink-muted">{b.city ?? '—'} · {b.customers} customers · {b.members} logins</p>
            </div>
            <div className="hidden min-w-0 md:block"><p className="break-words text-[14px]">{b.owner_name ?? '—'}</p><p className="break-words text-[13px] text-ink-muted">{b.owner_login ?? ''}</p></div>
            <p className="hidden text-[14px] md:block">{b.plan_name}</p>
            <p className="hidden text-[14px] md:block">{dmy(b.renews_at)}</p>
            <div className="text-right"><StateBadge state={b.state} planId={b.plan_id} renewsAt={b.renews_at} /></div>
            <p className="col-span-2 text-[13px] text-ink-muted md:hidden">{b.plan_name} · till {dmy(b.renews_at)}</p>
          </Link>
        ))}
      </div>
      <AddBusiness open={add} onClose={() => setAdd(false)} plans={plans} />
    </div>
  );
}

function AddBusiness({ open, onClose, plans }: { open: boolean; onClose: () => void; plans: Plan[] }) {
  const router = useRouter();
  const blank = { name: '', city: '', phone: '', address: '', owner_name: '', owner_login: '', plan_id: 'trial', months: '12', trial_days: '14', amount: '', method: 'UPI', reference: '', notes: '' };
  const [f, setF] = useState(blank);
  const [done, setDone] = useState<{ id: string; login: string; password: string } | null>(null);
  const { pending, err, run } = useSubmit();
  const plan = plans.find((p) => p.id === f.plan_id);
  const suggested = plan ? (f.months === '1' ? plan.monthly : f.months === '6' ? plan.half_yearly : f.months === '12' ? plan.yearly : null) : null;
  const close = () => { onClose(); setDone(null); setF(blank); };
  const share = done ? `PoulGo login for ${f.name}\nOpen: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\nMobile / email: ${done.login}\nTemporary password: ${done.password}\nYou will set your own password after signing in.` : '';
  return (
    <Sheet open={open} onClose={close} title={done ? 'Business created' : 'Add business'} wide
      footer={done ? <><Button variant="outline" onClick={close}>Close</Button><Button onClick={() => { nav(router, 'push', `/admin/businesses/${done.id}`); close(); }}>Open business</Button></>
        : <><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={pending} onClick={() => run(() => adminCreateBusiness({ ...f, months: Number(f.months), trial_days: Number(f.trial_days) }), (d) => { setDone(d); })}>{pending ? 'Creating…' : 'Create business and login'}</Button></>}>
      {done ? (
        <div className="space-y-4">
          <p className="text-[15px]">Share this with the owner. The password is shown only once; they must change it at first sign-in.</p>
          <pre className="whitespace-pre-wrap rounded-[16px] bg-mint p-4 font-sans text-[15px] leading-relaxed">{share}</pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(share)}><Copy className="h-4 w-4" /> Copy</Button>
            <a className="press inline-flex h-12 items-center rounded-[14px] bg-[#25D366] px-5 font-medium text-white" target="_blank" rel="noreferrer"
              href={`https://wa.me/${/^\d{10}$/.test(done.login) ? '91' + done.login : ''}?text=${encodeURIComponent(share)}`}>Send on WhatsApp</a>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-[15px] font-semibold">Business</legend>
            <TextInput label="Business name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Shree Ganesh Poultry" />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="City / taluka" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
              <TextInput label="Business phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-[15px] font-semibold">Owner login</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Owner name" value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} />
              <TextInput label="Mobile or email" value={f.owner_login} onChange={(e) => setF({ ...f, owner_login: e.target.value })} hint="They sign in with this" />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-[15px] font-semibold">Plan</legend>
            <div className="grid grid-cols-2 gap-3">
              <SelectInput label="Plan" value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly ? ` · ${rs(p.monthly)}/mo` : ''}</option>)}
              </SelectInput>
              {f.plan_id === 'trial'
                ? <TextInput label="Trial days" inputMode="numeric" value={f.trial_days} onChange={(e) => setF({ ...f, trial_days: e.target.value.replace(/\D/g, '') })} />
                : <SelectInput label="Paid for" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}>
                    {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                  </SelectInput>}
            </div>
            {f.plan_id !== 'trial' && (
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Amount received" inputMode="decimal" prefix="₹" value={f.amount} placeholder={suggested ? String(suggested) : ''} onChange={(e) => setF({ ...f, amount: e.target.value })} />
                <TextInput label="UPI ref / UTR" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
              </div>
            )}
            <TextInput label="Notes (only you see these)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </fieldset>
          <ErrorBox msg={err} />
        </div>
      )}
    </Sheet>
  );
}
