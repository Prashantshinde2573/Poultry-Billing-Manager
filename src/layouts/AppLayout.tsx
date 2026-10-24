import { useState } from 'react';
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, FileText, History, Home, IndianRupee, LayoutDashboard, ListOrdered, LogOut, Plus, ReceiptText,
  Settings as SettingsIcon, UserPlus, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { AppBarProvider, useAppBarConfig } from '@/components/mobile/AppBarContext';
import { ActionSheet } from '@/components/mobile/ActionSheet';
import { Avatar } from '@/components/mobile/Avatar';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/bills/new', label: 'Add Bill', icon: ReceiptText },
  { to: '/payments/new', label: 'Receive Payment', icon: IndianRupee },
  { to: '/transactions', label: 'Transactions', icon: ListOrdered },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

/** Mobile screen titles; pages can override with useAppBar(). */
const MOBILE_ROUTES: { path: string; title: string; tab?: boolean; hideNav?: boolean }[] = [
  { path: '/', title: 'Home', tab: true },
  { path: '/customers', title: 'Customers', tab: true },
  { path: '/customers/:customerId', title: 'Customer', hideNav: true },
  { path: '/bills/new', title: 'Add Bill', hideNav: true },
  { path: '/payments/new', title: 'Receive Payment', hideNav: true },
  { path: '/transactions', title: 'History', tab: true },
  { path: '/reports', title: 'Reports', tab: true },
  { path: '/settings', title: 'Settings' },
];

function routeInfo(pathname: string) {
  return MOBILE_ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname)) ?? { path: '', title: '' };
}

function Brand({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white"><BarChart3 className="h-5 w-5" /></div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-bold">{name}</p>
        <p className="truncate text-[11px] text-ink-muted">Simple Billing. Clear Accounts.</p>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function MobileTopBar({ businessName }: { businessName: string }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const cfg = useAppBarConfig();
  const info = routeInfo(pathname);

  if (pathname === '/') {
    return (
      <header className="no-print sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)] text-white md:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link to="/settings" aria-label="Profile and settings" className="press"><Avatar name={businessName} size={40} className="!bg-white/20 !text-white ring-2 ring-white/30" /></Link>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-xs text-white/80">{greeting()}, {user?.displayName}</p>
            <p className="truncate text-[17px] font-bold">{businessName}</p>
          </div>
          <Link to="/settings" aria-label="Settings" className="press rounded-full p-2 hover:bg-white/10"><SettingsIcon className="h-5 w-5" /></Link>
        </div>
      </header>
    );
  }

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(pathname.startsWith('/customers/') ? '/customers' : '/', { replace: true });
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <div className="flex h-14 items-center gap-1 px-2">
        {!info.tab && (
          <button type="button" onClick={goBack} aria-label="Back" className="press rounded-full p-2.5 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        )}
        <div className={`min-w-0 flex-1 leading-tight ${info.tab ? 'pl-2' : ''}`}>
          <h1 className="truncate text-[17px] font-bold">{cfg?.title ?? info.title}</h1>
          {cfg?.subtitle && <p className="truncate text-xs text-ink-muted">{cfg.subtitle}</p>}
        </div>
        <div className="flex items-center">{cfg?.actions}</div>
      </div>
    </header>
  );
}

function MobileBottomNav({ onPlus }: { onPlus: () => void }) {
  const tab = (to: string, label: string, Icon: typeof Home, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `press flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-ink-muted'}`}>
      {({ isActive }) => (
        <>
          <span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-primary-soft' : ''}`}><Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} /></span>
          {label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white safe-bottom md:hidden" aria-label="Main">
      <div className="flex items-end">
        {tab('/', 'Home', Home, true)}
        {tab('/customers', 'Customers', Users)}
        <div className="flex flex-1 justify-center">
          <button type="button" onClick={onPlus} aria-label="New entry" className="press -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-teal-700/30 ring-4 ring-white">
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>
        {tab('/transactions', 'History', History)}
        {tab('/reports', 'Reports', FileText)}
      </div>
    </nav>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [plus, setPlus] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const name = settings.businessName || 'Poultry Business Manager';
  const info = routeInfo(loc.pathname);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-primary-soft text-primary-dark' : 'text-ink-muted hover:bg-slate-100 hover:text-ink'}`;

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white px-3 py-4 md:flex">
        <div className="px-2 pb-5"><Brand name={name} /></div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Sidebar">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
              <n.icon className="h-[18px] w-[18px]" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-2 pt-3">
          <p className="truncate text-sm font-medium">{user?.displayName}</p>
          <p className="text-xs text-ink-muted">{user?.role === 'OWNER' ? 'Owner' : 'Staff'} · {user?.username}</p>
          <button type="button" onClick={logout} className="mt-2 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-danger">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <MobileTopBar businessName={name} />
        <main
          className={`mx-auto w-full min-w-0 max-w-7xl px-4 pt-4 md:px-8 md:pb-10 md:pt-8 ${info.hideNav ? 'pb-28' : 'pb-28'}`}
          key={loc.pathname.split('/')[1]}
        >
          <Outlet />
        </main>
      </div>

      {!info.hideNav && <MobileBottomNav onPlus={() => setPlus(true)} />}
      <ActionSheet
        open={plus}
        onClose={() => setPlus(false)}
        title="New entry"
        layout="grid"
        actions={[
          { key: 'bill', label: 'Add Bill', icon: <ReceiptText className="h-6 w-6" />, onSelect: () => nav('/bills/new') },
          { key: 'pay', label: 'Receive Payment', icon: <IndianRupee className="h-6 w-6" />, onSelect: () => nav('/payments/new') },
          { key: 'cust', label: 'Add Customer', icon: <UserPlus className="h-6 w-6" />, onSelect: () => nav('/customers?new=1') },
        ]}
      />
    </div>
  );
}

export function AppLayout() {
  return (
    <AppBarProvider>
      <Shell />
    </AppBarProvider>
  );
}
