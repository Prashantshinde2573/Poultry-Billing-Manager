'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Truck, UserRound } from 'lucide-react';
import { useTransition } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { Button } from '@/components/ui/core';
import { setTripStatus } from '@/app/actions/ops';

export function DriverNav() {
  const { t } = useI18n();
  const path = usePathname();
  const tab = (href: string, label: string, Icon: typeof Truck, active: boolean) => (
    <Link href={href} prefetch className={`press flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${active ? 'text-ink' : 'text-ink-faint'}`}>
      <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />{label}
    </Link>
  );
  return (
    <nav className="no-print safe-b fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 backdrop-blur-md" aria-label="Main">
      <div className="mx-auto flex max-w-xl">
        {tab('/driver', t('nav.myTrips'), Truck, !path.startsWith('/driver/profile'))}
        {tab('/driver/profile', t('nav.profile'), UserRound, path.startsWith('/driver/profile'))}
      </div>
    </nav>
  );
}

/** Driver can start the trip and finish it — nothing else. */
export function DriverTripActions({ tripId, status }: { tripId: string; status: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  const { pending, err, run } = useSubmit();
  const next = ['ASSIGNED', 'LOADING', 'DISPATCHED'].includes(status) ? 'IN_PROGRESS' : status === 'IN_PROGRESS' ? 'COMPLETED' : null;
  if (!next) return null;
  return (
    <div className="space-y-2">
      <Button size="lg" className="h-16 w-full rounded-[22px] text-lg" disabled={pending}
        onClick={() => run(() => setTripStatus(tripId, next), () => {})}>
        <Truck className="h-6 w-6" /> {next === 'IN_PROGRESS' ? t('t.start') : t('t.complete')}
      </Button>
      <ErrorBox msg={err} />
    </div>
  );
}
