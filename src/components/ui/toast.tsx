'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type Tone = 'ok' | 'err' | 'info';
const Ctx = createContext<{ show: (m: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; m: string; tone: Tone }[]>([]);
  const seq = useRef(0);
  const show = useCallback((m: string, tone: Tone = 'ok') => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { id, m, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'err' ? 7000 : 3500);
  }, []);
  const v = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={v}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} role={i.tone === 'err' ? 'alert' : 'status'} className="animate-fade pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-float">
            {i.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-aqua-light" /> : i.tone === 'err' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-coral" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-aqua-light" />}
            <span>{i.m}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside provider');
  return c.show;
}
