'use client';
import { Delete } from 'lucide-react';

/**
 * Big amount + quick chips + number pad (reference "Send money" screen).
 * value is a decimal string with at most 2 decimals.
 */
export function AmountPad({ value, onChange, chips = [], max = 2 }: { value: string; onChange: (v: string) => void; chips?: { label: string; value: string }[]; max?: number }) {
  const press = (k: string) => {
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === '.') { if (value.includes('.') || max === 0) return; return onChange((value || '0') + '.'); }
    const [, dec] = value.split('.');
    if (dec !== undefined && dec.length >= max) return;
    if (value === '0') return onChange(k);
    if (value.replace('.', '').length >= 11) return;
    onChange(value + k);
  };
  const shown = value ? Number(value.split('.')[0]).toLocaleString('en-IN') + (value.includes('.') ? '.' + value.split('.')[1] : '') : '0';
  return (
    <div>
      <p className="tabular py-3 text-center text-[56px] font-semibold leading-none tracking-tight" aria-live="polite">
        ₹{shown}<span className="ml-0.5 inline-block h-12 w-[3px] animate-pulse bg-ink align-[-6px]" />
      </p>
      {chips.length > 0 && (
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {chips.map((c, i) => (
            <button key={c.label} type="button" onClick={() => onChange(c.value)}
              className={`press h-11 shrink-0 rounded-full px-5 text-[15px] font-medium ${value === c.value ? 'bg-ink text-white' : i === 0 && !value ? 'bg-ink text-white' : 'border border-ink/20 bg-white/60'}`}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}
            className={`press flex h-16 items-center justify-center rounded-2xl text-[28px] font-normal ${k === '.' || k === 'del' ? 'text-ink' : 'border border-line bg-white/80 shadow-sm'}`}>
            {k === 'del' ? <Delete className="h-6 w-6" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
