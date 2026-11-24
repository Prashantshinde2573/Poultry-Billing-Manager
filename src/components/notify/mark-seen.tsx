'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markNotificationsSeen } from '@/app/actions/system';

/** Clears the unread badge once the list has been shown. */
export function MarkSeen({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread > 0) markNotificationsSeen().catch(() => {});
  }, [unread, router]);
  return null;
}
