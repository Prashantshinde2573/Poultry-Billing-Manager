'use client';
import { useId, type ComponentProps, type ReactNode } from 'react';

export function Field({ label, error, hint, children, className = '' }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {children(id)}
      {error ? <p className="mt-1 text-sm text-bad" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ label, error, hint, className, prefix, suffix, ...rest }: ComponentProps<'input'> & { label?: ReactNode; error?: string | null; hint?: ReactNode; prefix?: string; suffix?: string }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">{prefix}</span>}
          <input id={id} aria-invalid={!!error || undefined} className={`input ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-12' : ''} ${error ? 'border-bad' : ''}`} {...rest} />
          {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function SelectInput({ label, error, hint, className, children, ...rest }: ComponentProps<'select'> & { label?: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id) => <select id={id} className={`input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 fill=%22none%22 stroke=%22%236B8187%22 stroke-width=%222%22><path d=%22m6 8 4 4 4-4%22/></svg>')] bg-[right_12px_center] bg-no-repeat pr-10 ${error ? 'border-bad' : ''}`} {...rest}>{children}</select>}
    </Field>
  );
}

export function TextArea({ label, error, hint, className, ...rest }: ComponentProps<'textarea'> & { label?: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id) => <textarea id={id} rows={2} className={`input h-auto py-3 ${error ? 'border-bad' : ''}`} {...rest} />}
    </Field>
  );
}

/** Pill-style segmented choice (reference: Expenses / Income / Limits). */
export function Segmented<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto ${className}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`press h-11 shrink-0 rounded-full px-5 text-[15px] font-medium ${value === o.value ? 'bg-ink text-white' : 'border border-ink/15 bg-white/60 text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
