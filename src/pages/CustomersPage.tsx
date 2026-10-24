import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, Search, UserPlus, Users } from 'lucide-react';
import { Avatar } from '@/components/mobile/Avatar';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { BalanceText } from '@/components/ui/Money';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { formatINR } from '@/utils/money';
import { formatDate } from '@/utils/dates';
import { readPref, writePref } from '@/utils/prefs';
import type { Customer } from '@/types/api';

type Sort = 'name' | 'balance' | 'recent';
type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

export default function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(() => readPref<Sort>('cust.sort', 'name'));
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [adding, setAdding] = useState(params.get('new') === '1');
  const q = useApiQuery(() => api.listCustomers({ status: 'ALL' }), []);

  useEffect(() => writePref('cust.sort', sort), [sort]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    const list = (q.data?.customers ?? []).filter((c) =>
      (status === 'ALL' || c.status === status) &&
      (!s || c.customerName.toLowerCase().includes(s) || c.customerId.toLowerCase() === s || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))));
    const by: Record<Sort, (a: Customer, b: Customer) => number> = {
      name: (a, b) => a.customerName.localeCompare(b.customerName),
      balance: (a, b) => (b.summary?.balance ?? 0) - (a.summary?.balance ?? 0),
      recent: (a, b) => (b.summary?.lastTransactionDate ?? '').localeCompare(a.summary?.lastTransactionDate ?? '') || a.customerName.localeCompare(b.customerName),
    };
    return list.sort(by[sort]);
  }, [q.data, search, sort, status]);

  const counts = useMemo(() => {
    const all = q.data?.customers ?? [];
    return { ACTIVE: all.filter((c) => c.status === 'ACTIVE').length, INACTIVE: all.filter((c) => c.status === 'INACTIVE').length, ALL: all.length };
  }, [q.data]);

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={q.data ? <span className="hidden md:inline">{counts.ACTIVE} active · {counts.INACTIVE} archived</span> : undefined} actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add Customer</Button>} />

      <div className="sticky top-14 z-20 -mx-4 space-y-2.5 bg-page/95 px-4 pb-2 pt-1 backdrop-blur md:static md:mx-0 md:flex md:gap-2 md:space-y-0 md:bg-transparent md:p-0">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="field-input rounded-full pl-10 md:rounded-lg" type="search" placeholder="Search name or mobile number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        </div>
        {/* phone: chips */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
          {(['ACTIVE', 'INACTIVE', 'ALL'] as StatusFilter[]).map((k) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={`press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ${status === k ? 'bg-ink text-white' : 'bg-white text-ink-muted ring-1 ring-line'}`}>
              {k === 'ACTIVE' ? 'Active' : k === 'INACTIVE' ? 'Archived' : 'All'} · {counts[k]}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {([['balance', 'Highest dues'], ['recent', 'Recent'], ['name', 'A–Z']] as [Sort, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSort(k)} className={`press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ${sort === k ? 'bg-primary-soft text-primary-dark ring-1 ring-teal-200' : 'bg-white text-ink-muted ring-1 ring-line'}`}>{l}</button>
          ))}
        </div>
        {/* desktop: selects */}
        <div className="hidden gap-2 md:flex">
          <select className="field-input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status filter">
            <option value="ACTIVE">Active ({counts.ACTIVE})</option>
            <option value="INACTIVE">Archived ({counts.INACTIVE})</option>
            <option value="ALL">All ({counts.ALL})</option>
          </select>
          <label className="relative">
            <span className="sr-only">Sort by</span>
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <select className="field-input w-auto pl-9" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="name">Name A–Z</option>
              <option value="balance">Highest outstanding</option>
              <option value="recent">Recent activity</option>
            </select>
          </label>
        </div>
      </div>

      {q.error && <ErrorState message={q.error} onRetry={q.reload} />}
      {q.loading && <div className="card space-y-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}

      {q.data && rows.length === 0 && (
        <div className="card">
          {counts.ALL === 0
            ? <EmptyState icon={<Users className="h-6 w-6" />} title="No customers yet" message="Add your first customer. A dedicated tab is created for them in your Google Sheet." action={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add Customer</Button>} />
            : <EmptyState title="No matching customers" message="Try a different name, number or status filter." />}
        </div>
      )}

      {q.data && rows.length > 0 && (
        <div className={`card overflow-hidden rounded-2xl ${q.refreshing ? 'opacity-70' : ''}`}>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((c) => (
              <li key={c.customerId}>
                <Link to={`/customers/${c.customerId}`} className="press flex items-center gap-3 px-3.5 py-3 active:bg-slate-50">
                  <Avatar name={c.customerName} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{c.customerName}</p>
                    <p className="truncate text-xs text-ink-muted">{c.status === 'INACTIVE' ? 'Archived · ' : ''}{c.summary?.lastTransactionDate ? `Last entry ${formatDate(c.summary.lastTransactionDate)}` : c.phone}</p>
                  </div>
                  <div className="text-right">
                    <BalanceText value={c.summary?.balance ?? 0} className="text-[15px]" />
                    <p className="text-[11px] text-ink-muted">{(c.summary?.balance ?? 0) > 0.004 ? 'to collect' : (c.summary?.balance ?? 0) < -0.004 ? 'advance' : 'settled'}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Mobile</th>
                  <th className="px-3 py-3 text-right font-medium">Total billing</th>
                  <th className="px-3 py-3 text-right font-medium">Total payments</th>
                  <th className="px-3 py-3 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-3 font-medium">Last transaction</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.customerId} className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-slate-50" onClick={() => nav(`/customers/${c.customerId}`)}>
                    <td className="px-4 py-3"><Link to={`/customers/${c.customerId}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>{c.customerName}</Link><p className="text-xs text-ink-muted">{c.customerId}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{c.phone}</td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right">{formatINR(c.summary?.totalBilling)}</td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right">{formatINR(c.summary?.totalPayments)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right"><BalanceText value={c.summary?.balance ?? 0} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{formatDate(c.summary?.lastTransactionDate)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setAdding(true)} aria-label="Add customer" className="press fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-20 flex h-14 items-center gap-2 rounded-2xl bg-primary px-5 text-[15px] font-semibold text-white shadow-lg shadow-teal-700/30 md:hidden">
        <UserPlus className="h-5 w-5" /> Add
      </button>

      <CustomerFormModal
        open={adding}
        onClose={() => {
          setAdding(false);
          if (params.get('new')) setParams({}, { replace: true });
        }}
        onSaved={(c) => {
          setAdding(false);
          nav(`/customers/${c.customerId}`);
        }}
      />
    </div>
  );
}
