import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { DriverNav } from '@/components/trip/driver-nav';

export default async function DriverLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.role !== 'driver') redirect('/');
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)]">{children}</main>
      <DriverNav />
    </div>
  );
}
