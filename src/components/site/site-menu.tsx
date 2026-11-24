'use client';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';

/** Phone menu for the website header. Closes on pick, outside tap or Escape. */
export function SiteMenu({ links, cta }: { links: { href: string; label: string }[]; cta: { href: string; label: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative md:hidden">
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="press flex h-10 w-10 items-center justify-center rounded-[12px] border border-line bg-white">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <nav aria-label="Website" className="absolute right-0 top-12 z-50 w-[min(86vw,300px)] rounded-[18px] border border-line bg-white p-2 shadow-lift">
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-[12px] px-4 py-3 text-[16px] font-medium hover:bg-mint">{l.label}</a>)}
          <a href={cta.href} onClick={() => setOpen(false)} className="mt-1 block rounded-[12px] bg-ink px-4 py-3 text-center text-[16px] font-medium text-white">{cta.label}</a>
          <div className="flex justify-center px-2 pb-1 pt-3"><LanguageSwitcher /></div>
        </nav>
      )}
    </div>
  );
}
