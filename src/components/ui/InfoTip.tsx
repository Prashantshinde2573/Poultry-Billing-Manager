import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/** Accessible tooltip: hover, focus or tap. */
export function InfoTip({ text, label = 'More information' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="rounded-full p-0.5 text-ink-muted hover:text-ink"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-6 z-30 w-60 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
