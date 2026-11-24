import type { MessageKey } from '@/lib/i18n';
import type { Module, Perm, Role } from '@/lib/session';

export interface NavItem { href: string; key: MessageKey; icon: string; perm?: Perm; owner?: boolean; module?: Module; locked?: boolean }

export const NAV: NavItem[] = [
  { href: '/app', key: 'nav.home', icon: 'home' },
  { href: '/app/customers', key: 'nav.customers', icon: 'users' },
  { href: '/app/suppliers', key: 'nav.suppliers', icon: 'factory', perm: 'suppliers', module: 'suppliers' },
  { href: '/app/purchases', key: 'nav.purchases', icon: 'basket', perm: 'suppliers', module: 'suppliers' },
  { href: '/app/orders', key: 'nav.orders', icon: 'clipboard', module: 'orders' },
  { href: '/app/trips', key: 'nav.trips', icon: 'truck', module: 'trips' },
  { href: '/app/payments', key: 'nav.payments', icon: 'wallet' },
  { href: '/app/expenses', key: 'nav.expenses', icon: 'receipt', perm: 'expenses', module: 'expenses' },
  { href: '/app/pnl', key: 'nav.pnl', icon: 'chart', owner: true, module: 'pnl' },
  { href: '/app/reports', key: 'nav.reports', icon: 'file', module: 'reports' },
  { href: '/app/activity', key: 'nav.activity', icon: 'history', owner: true },
  { href: '/app/plan', key: 'plan.title', icon: 'crown', owner: true },
  { href: '/app/settings', key: 'nav.settings', icon: 'settings' },
];

export const NEW_ENTRY: NavItem[] = [
  { href: '/app/trips/new', key: 'qa.trip', icon: 'truck', module: 'trips' },
  { href: '/app/payments/new', key: 'qa.payment', icon: 'down' },
  { href: '/app/customers/new', key: 'qa.customer', icon: 'userplus' },
  { href: '/app/purchases/new', key: 'qa.purchase', icon: 'basket', perm: 'suppliers', module: 'suppliers' },
  { href: '/app/expenses?new=1', key: 'qa.expense', icon: 'receipt', perm: 'expenses', module: 'expenses' },
  { href: '/app/bills/new', key: 'qa.bill', icon: 'scroll' },
  { href: '/app/payments/new?dir=OUT', key: 'qa.paySupplier', icon: 'up', perm: 'suppliers', module: 'suppliers' },
  { href: '/app/orders/new', key: 'qa.order', icon: 'clipboard', module: 'orders' },
  { href: '/app/suppliers/new', key: 'qa.supplier', icon: 'factory', perm: 'suppliers', module: 'suppliers' },
];

/**
 * Items this person may use. Items outside the plan stay visible (with a lock) for the
 * owner, so they can see what an upgrade adds; staff simply don't see them.
 */
export function allowed(items: NavItem[], role: Role, perms: Record<Perm, boolean>, modules: Module[] = [], showLocked = false) {
  return items
    .map((i) => ({ ...i, locked: !!i.module && !modules.includes(i.module) }))
    .filter((i) => (!i.owner || role === 'owner') && (i.locked ? showLocked && role === 'owner' : !i.perm || perms[i.perm]));
}
