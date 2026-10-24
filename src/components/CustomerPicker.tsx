import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, UserPlus } from 'lucide-react';
import type { Customer } from '@/types/api';
import { formatINR } from '@/utils/money';

interface Props {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
  error?: string;
  loading?: boolean;
  onAddNew?: () => void;
  label?: string;
  includeInactive?: boolean;
}

/** Searchable customer selector (by name, mobile or ID), keyboard accessible. */
export function CustomerPicker({ customers, value, onChange, error, loading, onAddNew, label = 'Customer', includeInactive }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = customers.find((c) => c.customerId === value);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    return customers
      .filter((c) => includeInactive || c.status === 'ACTIVE' || c.customerId === value)
      .filter((c) => !s || c.customerName.toLowerCase().includes(s) || c.customerId.toLowerCase() === s || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
      .slice(0, 50);
  }, [customers, q, includeInactive, value]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (c: Customer) => {
    onChange(c.customerId);
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <label className="field-label" htmlFor="customer-picker">{label}</label>
      {!open ? (
        <button
          id="customer-picker"
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => input.current?.focus(), 0);
          }}
          className={`field-input flex items-center justify-between text-left ${error ? 'border-danger' : ''}`}
          aria-haspopup="listbox"
        >
          {selected ? (
            <span className="truncate">
              <span className="font-medium">{selected.customerName}</span>
              <span className="ml-2 text-sm text-ink-muted">{selected.phone}</span>
            </span>
          ) : (
            <span className="text-ink-muted">{loading ? 'Loading customers…' : 'Search and select a customer'}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            id="customer-picker"
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="customer-listbox"
            aria-activedescendant={list[hi] ? 'cust-opt-' + list[hi].customerId : undefined}
            className="field-input pl-9"
            placeholder="Type name or mobile number"
            value={q}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) choose(list[hi]); }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
      )}
      {open && (
        <ul id="customer-listbox" role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
          {list.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">{loading ? 'Loading…' : 'No matching customers'}</li>}
          {list.map((c, i) => (
            <li
              key={c.customerId}
              id={'cust-opt-' + c.customerId}
              role="option"
              aria-selected={c.customerId === value}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setHi(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 ${i === hi ? 'bg-primary-soft' : ''}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.customerName}{c.status === 'INACTIVE' && <span className="ml-1 text-xs text-ink-muted">(archived)</span>}</span>
                <span className="block text-xs text-ink-muted">{c.phone} · {c.customerId}</span>
              </span>
              {c.summary && <span className={`tabular shrink-0 text-sm ${c.summary.balance > 0 ? 'text-danger' : 'text-ink-muted'}`}>{formatINR(c.summary.balance)}</span>}
            </li>
          ))}
          {onAddNew && (
            <li className="border-t border-line">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddNew(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary-soft">
                <UserPlus className="h-4 w-4" /> Add new customer
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
