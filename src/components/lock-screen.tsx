import type { ReactNode } from 'react';
import { LogOut, MessageCircle, Phone } from 'lucide-react';
import { Logo } from '@/components/brand';
import { signOut } from '@/app/actions/auth';
import type { Platform } from '@/lib/data/platform';

export function LockScreen({ icon, title, sub, pf, signOutLabel }: { icon: ReactNode; title: string; sub: string; pf: Platform; signOutLabel: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <Logo size={44} />
      <span className="mt-10 flex h-16 w-16 items-center justify-center rounded-[20px] bg-ink text-white">{icon}</span>
      <h1 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{sub}</p>
      <div className="mt-8 flex w-full flex-col gap-2">
        {pf.whatsapp && <a href={`https://wa.me/${pf.whatsapp}`} className="press inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[#25D366] font-medium text-white"><MessageCircle className="h-5 w-5" /> WhatsApp</a>}
        {pf.support_phone && <a href={`tel:${pf.support_phone}`} className="press inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-line bg-white font-medium"><Phone className="h-5 w-5" /> {pf.support_phone}</a>}
        <form action={signOut}><button className="press mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-medium text-ink-muted hover:text-bad"><LogOut className="h-5 w-5" /> {signOutLabel}</button></form>
      </div>
    </main>
  );
}
