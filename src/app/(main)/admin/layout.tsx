import type { ReactNode } from 'react';
export const metadata = { title: 'PoulGo Admin', robots: { index: false } };
export default function AdminRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
