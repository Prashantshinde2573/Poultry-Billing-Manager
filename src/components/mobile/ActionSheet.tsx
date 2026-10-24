import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface SheetAction {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  hidden?: boolean;
}

/** Bottom sheet with large tap targets, as used for menus in mobile apps. */
export function ActionSheet({ open, onClose, title, actions, layout = 'list' }: { open: boolean; onClose: () => void; title?: string; actions: SheetAction[]; layout?: 'list' | 'grid' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = o;
    };
  }, [open, onClose]);
  if (!open) return null;
  const visible = actions.filter((a) => !a.hidden);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title ?? 'Actions'} className="relative w-full max-w-lg rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 shadow-2xl animate-sheet">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300" />
        {title && <p className="px-5 pb-2 pt-1 text-sm font-semibold text-ink-muted">{title}</p>}
        {layout === 'grid' ? (
          <div className="grid grid-cols-3 gap-2 px-4 pb-2">
            {visible.map((a) => (
              <button key={a.key} type="button" onClick={() => { onClose(); a.onSelect(); }} className="press flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center hover:bg-slate-50">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{a.icon}</span>
                <span className="text-[13px] font-medium leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="px-2">
            {visible.map((a) => (
              <li key={a.key}>
                <button type="button" onClick={() => { onClose(); a.onSelect(); }} className={`press flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left hover:bg-slate-50 ${a.tone === 'danger' ? 'text-danger' : ''}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${a.tone === 'danger' ? 'bg-red-50' : 'bg-slate-100 text-ink'}`}>{a.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{a.label}</span>
                    {a.description && <span className="block text-xs text-ink-muted">{a.description}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pt-1">
          <button type="button" onClick={onClose} className="press h-12 w-full rounded-xl bg-slate-100 text-[15px] font-semibold">Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
