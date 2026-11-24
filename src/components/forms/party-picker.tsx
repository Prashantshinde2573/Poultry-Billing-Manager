'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { withNext, nav } from '@/components/shell/perm';
import { useI18n } from '@/lib/i18n/client';
import { inr } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Avatar } from '@/components/ui/core';
import type { PartyOpt } from '@/lib/data/queries';

/** Big tappable party chooser with search (works well with hundreds of parties on a phone). */
export function PartyPicker({ parties, value, onChange, label, showBalance = true, add }: {
  parties: PartyOpt[]; value: string; onChange: (id: string) => void; label: string; showBalance?: boolean;
  /** last row "+ Add new …": opens the add screen and comes back with the new party selected */
  add?: { kind: 'CUSTOMER' | 'SUPPLIER'; as: string; next?: string } | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = parties.find((p) => p.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? parties.filter((p) => p.name.toLowerCase().includes(s) || (p.phone ?? '').includes(s)) : parties;
  }, [q, parties]);
  return (
    <div>
      <p className="label">{label}</p>
      <button type="button" onClick={() => setOpen(true)} className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-white/80 px-3 py-2.5 text-left">
        {sel ? <Avatar name={sel.name} size={40} /> : <span className="h-10 w-10 rounded-full bg-ink/5" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{sel?.name ?? t('c.select')}</span>
          {sel && showBalance && <span className="block text-sm text-ink-muted">{t('pay.outstanding')}: {inr(sel.balance)}</span>}
        </span>
        <ChevronDown className="h-5 w-5 text-ink-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('c.search')} className="input pl-10" />
        </div>
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange(p.id); setOpen(false); setQ(''); }} className="press flex w-full items-center gap-3 py-2.5 text-left">
                <Avatar name={p.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{p.name}</span>
                  <span className="block text-sm text-ink-muted">{p.phone ?? ''}</span>
                </span>
                {showBalance && <span className="tabular text-sm font-medium">{inr(p.balance)}</span>}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">{t('c.noResults')}</li>}
          {add && (
            <li>
              <button type="button" onClick={() => { setOpen(false); nav(router, 'push', (add.next ? `${add.kind === 'CUSTOMER' ? '/app/customers/new' : '/app/suppliers/new'}?next=${encodeURIComponent(add.next)}&as=${add.as}` : withNext(add.kind === 'CUSTOMER' ? '/app/customers/new' : '/app/suppliers/new', add.as)) + (q.trim() ? `&name=${encodeURIComponent(q.trim())}` : '')); }}
                className="press flex w-full items-center gap-3 py-3 text-left font-semibold text-aqua-deep">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aqua-soft"><UserPlus className="h-5 w-5" /></span>
                {add.kind === 'CUSTOMER' ? t('add.customer') : t('add.supplier')}
              </button>
            </li>
          )}
        </ul>
      </Sheet>
    </div>
  );
}
