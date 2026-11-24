'use client';
import { createContext, useContext, type ReactNode } from 'react';

interface Perm { owner: boolean; modules: string[]; perms: Record<string, boolean> }
const C = createContext<Perm>({ owner: false, modules: [], perms: {} });

/** What the signed-in office user may do — used to show "Add new" shortcuts only where they work. */
export function PermProvider({ value, children }: { value: Perm; children: ReactNode }) {
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function usePerm() {
  const p = useContext(C);
  return { ...p, has: (m: string) => p.modules.includes(m), can: (k: string) => p.owner || !!p.perms[k] };
}

/** Link to an "add" screen that comes back here afterwards (with ?<as>=<new id> when given). */
export function withNext(to: string, as?: string) {
  const here = typeof window === 'undefined' ? '' : window.location.pathname + window.location.search;
  const sep = to.includes('?') ? '&' : '?';
  return `${to}${sep}next=${encodeURIComponent(here)}${as ? `&as=${as}` : ''}`;
}

/** Safe in-app return path from ?next= (never another site). */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith('/app/') && !next.startsWith('//') ? next : null;
}

/** router.push/replace that also shows the loading bar straight away. */
export function nav(router: { push: (h: string) => void; replace: (h: string) => void }, how: 'push' | 'replace', href: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pg:navigate', { detail: href }));
  router[how](href);
}
