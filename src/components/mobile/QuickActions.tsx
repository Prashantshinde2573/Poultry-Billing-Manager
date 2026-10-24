import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface QuickAction {
  to: string;
  label: string;
  icon: ReactNode;
  tone: string;
}

/** PhonePe/GPay-style grid of round icon shortcuts. */
export function QuickActions({ title, actions }: { title?: string; actions: QuickAction[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-line">
      {title && <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>}
      <div className="grid grid-cols-4 gap-y-4">
        {actions.map((a) => (
          <Link key={a.label} to={a.to} className="press flex flex-col items-center gap-1.5 text-center">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${a.tone}`}>{a.icon}</span>
            <span className="text-[12px] font-medium leading-tight text-ink">{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
