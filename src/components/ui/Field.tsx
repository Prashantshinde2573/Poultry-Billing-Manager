import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface WrapProps {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  id: string;
  children: ReactNode;
  className?: string;
}

function Wrap({ label, error, hint, id, children, className = '' }: WrapProps) {
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      {children}
      {error ? <p className="field-error" id={id + '-err'} role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: ReactNode; prefix?: string; suffix?: string; wrapClassName?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, prefix, suffix, wrapClassName, className = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Wrap label={label} error={error} hint={hint} id={fid} className={wrapClassName}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">{prefix}</span>}
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? fid + '-err' : undefined}
          className={`field-input ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-12' : ''} ${error ? 'border-danger focus:border-danger focus:ring-danger/20' : ''} ${className}`}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">{suffix}</span>}
      </div>
    </Wrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapClassName?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, error, hint, wrapClassName, className = '', id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Wrap label={label} error={error} hint={hint} id={fid} className={wrapClassName}>
      <select ref={ref} id={fid} aria-invalid={!!error || undefined} className={`field-input pr-8 ${error ? 'border-danger' : ''} ${className}`} {...rest}>
        {children}
      </select>
    </Wrap>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapClassName?: string };

export const TextAreaField = forwardRef<HTMLTextAreaElement, AreaProps>(function TextAreaField(
  { label, error, hint, wrapClassName, className = '', id, rows = 2, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Wrap label={label} error={error} hint={hint} id={fid} className={wrapClassName}>
      <textarea ref={ref} id={fid} rows={rows} aria-invalid={!!error || undefined} className={`field-input h-auto py-2.5 ${error ? 'border-danger' : ''} ${className}`} {...rest} />
    </Wrap>
  );
});
