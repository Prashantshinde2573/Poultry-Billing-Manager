'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Avatar, Empty } from '@/components/ui/core';
import { Segmented } from '@/components/ui/fields';
import { fmtDate, inrSmart } from '@/lib/format';
import type { PartyRow } from '@/lib/data/queries';

export function PartyList({ rows, kind }: { rows: PartyRow[]; kind: 'CUSTOMER' | 'SUPPLIER' }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'dues' | 'recent' | 'name'>('dues');
  const bal = (r: PartyRow) => Number(kind === 'CUSTOMER' ? r.receivable : r.payable) || 0;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = s.replace(/\D/g, '');
    return rows
      .filter((r) => !s || r.name.toLowerCase().includes(s) || (d.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(d)))
      .sort((a, b) => sort === 'dues' ? bal(b) - bal(a) : sort === 'recent' ? (b.last_activity ?? '').localeCompare(a.last_activity ?? '') : a.name.localeCompare(b.name));
  }, [rows, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = kind === 'CUSTOMER' ? '/app/customers' : '/app/suppliers';
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
        <input className="input rounded-full pl-12" type="search" placeholder={`${t('c.search')} — ${t('c.name')} / ${t('c.phone')}`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Segmented className="mt-3" value={sort} onChange={setSort} options={[
        { value: 'dues', label: kind === 'CUSTOMER' ? t('p.receivable') : t('p.payable') },
        { value: 'recent', label: t('c.recent') },
        { value: 'name', label: 'A–Z' },
      ]} />
      {list.length === 0 ? <Empty title={rows.length ? t('c.noResults') : t('p.noParties')} /> : (
        <ul className="mt-2 divide-y divide-line">
          {list.map((r) => {
            const b = bal(r);
            return (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="press flex items-center gap-3.5 py-3">
                  <Avatar name={r.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium">{r.name}{r.status === 'INACTIVE' && <span className="ml-1.5 text-xs text-ink-muted">({t('p.archived')})</span>}</p>
                    <p className="mt-1 truncate text-sm text-ink-muted">{r.last_activity ? t('p.lastActivity', { date: fmtDate(r.last_activity, locale) }) : r.phone ?? ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`tabular text-[17px] font-medium ${b > 0 ? (kind === 'CUSTOMER' ? 'text-bad' : 'text-ink') : b < 0 ? 'text-good' : 'text-ink-muted'}`}>{inrSmart(Math.abs(b))}</p>
                    <p className="mt-1 text-sm text-ink-muted">{b > 0 ? (kind === 'CUSTOMER' ? t('p.owesYou') : t('p.youOwe')) : b < 0 ? t('p.advance') : t('p.settled')}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
