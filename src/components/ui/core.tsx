import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { initials } from '@/lib/format';

/* ------------------------------------------------------------- buttons --- */
type Variant = 'ink' | 'aqua' | 'outline' | 'ghost' | 'danger' | 'light';
const variants: Record<Variant, string> = {
  ink: 'bg-ink text-white hover:bg-ink-soft disabled:bg-ink/40',
  aqua: 'bg-aqua text-white hover:bg-aqua-deep disabled:bg-aqua/40',
  outline: 'border border-ink/15 bg-white/70 text-ink hover:bg-white disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-ink/5',
  danger: 'bg-bad text-white hover:brightness-95 disabled:opacity-50',
  light: 'bg-white/15 text-white hover:bg-white/25',
};
const sizes = { sm: 'h-9 px-3.5 text-sm gap-1.5', md: 'h-12 px-5 text-[15px] gap-2', lg: 'h-14 px-6 text-base gap-2' };

export function btnClass(variant: Variant = 'ink', size: keyof typeof sizes = 'md', extra = '') {
  return `press inline-flex items-center justify-center rounded-2xl font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = 'ink', size = 'md', className = '', type = 'button', ...rest }: ComponentProps<'button'> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button type={type} className={btnClass(variant, size, className)} {...rest} />;
}

export function LinkButton({ href, variant = 'ink', size = 'md', className = '', children }: { href: string; variant?: Variant; size?: keyof typeof sizes; className?: string; children: ReactNode }) {
  return <Link href={href} className={btnClass(variant, size, className)}>{children}</Link>;
}

/** Round outlined icon button (reference: bell / calendar / back). */
export function IconCircle({ children, href, label, className = '', dark = false, onClickId }: { children: ReactNode; href?: string; label: string; className?: string; dark?: boolean; onClickId?: string }) {
  const cls = `press flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-ink text-white' : 'border border-ink/10 bg-white/70 text-ink backdrop-blur'} ${className}`;
  if (href) return <Link href={href} aria-label={label} className={cls}>{children}</Link>;
  return <button type="button" aria-label={label} className={cls} id={onClickId}>{children}</button>;
}

/** Square dark action tile (reference: + and ⇆ next to the balance). */
export function ActionSquare({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return <Link href={href} aria-label={label} className="press flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white shadow-float">{children}</Link>;
}

/* -------------------------------------------------------------- header --- */
export function PageHeader({ title, back, right, sub }: { title: ReactNode; back?: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="no-print mb-5 flex items-center gap-3">
      {back ? <IconCircle href={back} label="Back"><ArrowLeft className="h-5 w-5" /></IconCircle> : <span className="hidden w-12 md:block" />}
      <div className="min-w-0 flex-1 text-center md:text-left">
        <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="truncate text-sm text-ink-muted">{sub}</p>}
      </div>
      <div className="flex w-12 shrink-0 justify-end">{right}</div>
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-1 flex items-center justify-between">
      <h2 className="text-[19px] font-semibold tracking-tight">{children}</h2>
      {action && <div className="text-[15px] font-medium text-aqua-deep">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- pills -- */
export function Pills({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="no-print no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {items.map((i) => (
        <Link key={i.href} href={i.href} scroll={false}
          className={`press flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-medium ${i.active ? 'bg-ink text-white' : 'border border-ink/15 bg-white/50 text-ink'}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/* --------------------------------------------------------------- avatars -- */
const AV = ['bg-[#D9F2EE] text-[#12645C]', 'bg-[#E4E1FB] text-[#4B3FB0]', 'bg-[#FDEBD9] text-[#9A5212]', 'bg-[#FBE0E4] text-[#9C2C40]',
  'bg-[#DCEBFA] text-[#1F5E99]', 'bg-[#F6F0CF] text-[#7A6512]', 'bg-[#E2F4DA] text-[#3B7A21]'];
export function Avatar({ name, size = 48, ring = false, className = '' }: { name: string; size?: number; ring?: boolean; className?: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${AV[h % AV.length]} ${ring ? 'ring-[3px] ring-aqua ring-offset-2 ring-offset-mint' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- misc --- */
export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'aqua' | 'good' | 'bad' | 'warn' | 'violet' | 'ink'; children: ReactNode }) {
  const t = {
    slate: 'bg-ink/5 text-ink-soft', aqua: 'bg-aqua-soft text-aqua-deep', good: 'bg-[#E3F6EC] text-good', bad: 'bg-[#FCE7E3] text-bad',
    warn: 'bg-[#FCF0DC] text-[#9A5E0B]', violet: 'bg-[#ECE9FC] text-violet', ink: 'bg-ink text-white',
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Empty({ title, sub, action, icon }: { title: string; sub?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-aqua-soft text-aqua-deep">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-sm text-ink-muted">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold tracking-tight ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

/** Transaction / party row (reference: "Recent transactions" list). */
export function Row({ href, left, title, sub, amount, amountSub, tone }: {
  href?: string; left: ReactNode; title: ReactNode; sub?: ReactNode; amount?: ReactNode; amountSub?: ReactNode; tone?: 'good' | 'bad' | 'muted';
}) {
  const body = (
    <>
      {left}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-medium leading-tight">{title}</p>
        {sub && <p className="mt-1 truncate text-sm text-ink-muted">{sub}</p>}
      </div>
      {(amount !== undefined || amountSub) && (
        <div className="shrink-0 text-right">
          <p className={`tabular text-[17px] font-medium ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'muted' ? 'text-ink-muted' : ''}`}>{amount}</p>
          {amountSub && <p className="mt-1 text-sm text-ink-muted">{amountSub}</p>}
        </div>
      )}
    </>
  );
  const cls = 'press flex items-center gap-3.5 py-3';
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function IconBubble({ children, tone = 'aqua' }: { children: ReactNode; tone?: 'aqua' | 'good' | 'bad' | 'warn' | 'violet' | 'ink' }) {
  const t = { aqua: 'bg-aqua-soft text-aqua-deep', good: 'bg-[#E3F6EC] text-good', bad: 'bg-[#FCE7E3] text-bad', warn: 'bg-[#FCF0DC] text-[#9A5E0B]', violet: 'bg-[#ECE9FC] text-violet', ink: 'bg-ink text-white' }[tone];
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white ${t}`}>{children}</span>;
}
