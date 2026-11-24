import type { MessageKey } from '@/lib/i18n';
import type { Perm, Role } from '@/lib/session';

export interface NavItem { href: string; key: MessageKey; icon: string; perm?: Perm; owner?: boolean }

export const NAV: NavItem[] = [
  { href: '/', key: 'nav.home', icon: 'home' },
  { href: '/customers', key: 'nav.customers', icon: 'users' },
  { href: '/suppliers', key: 'nav.suppliers', icon: 'factory', perm: 'suppliers' },
  { href: '/purchases', key: 'nav.purchases', icon: 'basket', perm: 'suppliers' },
  { href: '/orders', key: 'nav.orders', icon: 'clipboard' },
  { href: '/trips', key: 'nav.trips', icon: 'truck' },
  { href: '/payments', key: 'nav.payments', icon: 'wallet' },
  { href: '/expenses', key: 'nav.expenses', icon: 'receipt', perm: 'expenses' },
  { href: '/pnl', key: 'nav.pnl', icon: 'chart', owner: true },
  { href: '/reports', key: 'nav.reports', icon: 'file' },
  { href: '/settings', key: 'nav.settings', icon: 'settings' },
];

export const NEW_ENTRY: NavItem[] = [
  { href: '/orders/new', key: 'qa.order', icon: 'clipboard' },
  { href: '/payments/new', key: 'qa.payment', icon: 'down' },
  { href: '/trips/new', key: 'qa.trip', icon: 'truck' },
  { href: '/purchases/new', key: 'qa.purchase', icon: 'basket', perm: 'suppliers' },
  { href: '/payments/new?dir=OUT', key: 'qa.paySupplier', icon: 'up', perm: 'suppliers' },
  { href: '/expenses?new=1', key: 'qa.expense', icon: 'receipt', perm: 'expenses' },
  { href: '/bills/new', key: 'qa.bill', icon: 'scroll' },
  { href: '/customers/new', key: 'qa.customer', icon: 'userplus' },
  { href: '/suppliers/new', key: 'qa.supplier', icon: 'factory', perm: 'suppliers' },
];

export function allowed(items: NavItem[], role: Role, perms: Record<Perm, boolean>) {
  return items.filter((i) => (!i.owner || role === 'owner') && (!i.perm || perms[i.perm]));
}
