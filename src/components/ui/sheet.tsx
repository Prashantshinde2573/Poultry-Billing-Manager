'use client';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer, locked }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; locked?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose();
    document.addEventListener('keydown', onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = o; };
  }, [open, onClose, locked]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-ink/40" onClick={() => !locked && onClose()} aria-hidden />
      <div role="dialog" aria-modal="true" className="animate-sheet relative flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-[#FBFDFC] shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink/15 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} disabled={locked} className="press rounded-full p-2 text-ink-muted hover:bg-ink/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="safe-b flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
