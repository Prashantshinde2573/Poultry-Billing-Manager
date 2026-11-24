'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { ChickenLoader } from '@/components/ui/loader';
import { askAI, type ChatTurn } from '@/app/actions/ask';

const KEY = 'poulgo_ask';

/** Tiny formatter: **bold**, "- " bullets, line breaks. No HTML from the model is ever injected. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith('**') && x.endsWith('**') ? <b key={i}>{x.slice(2, -2)}</b> : <Fragment key={i}>{x}</Fragment>));
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={`u${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">{list}</ul>); list = []; } };
  text.split('\n').forEach((line, i) => {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (m) { list.push(<li key={i}>{inline(m[1])}</li>); return; }
    flush();
    if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <div className="space-y-1.5">{out}</div>;
}

export function AskChat({ used: used0, limit }: { used: number; limit: number }) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(used0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setTurns(JSON.parse(s)); } catch { /* ignore */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-20))); } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...turns, { role: 'user', text: question } as ChatTurn];
    setTurns(next); setText(''); setBusy(true);
    try {
      const r = await askAI(next);
      if (r.ok) { setTurns([...next, { role: 'assistant', text: r.text }]); setUsed(r.used); }
      else setTurns([...next, { role: 'assistant', text: r.code === 'PLAN_LIMIT' ? t('ask.limit') : r.code === 'AI_OFF' ? t('ask.off') : t('ask.failed') }]);
    } catch { setTurns([...next, { role: 'assistant', text: t('ask.failed') }]); }
    setBusy(false);
  };

  const examples = [t('ask.ex1'), t('ask.ex2'), t('ask.ex3'), t('ask.ex4')];
  return (
    <div className="flex min-h-[calc(100dvh-220px)] flex-col">
      <div className="flex-1 space-y-3 pb-4">
        {turns.length === 0 && (
          <div className="pt-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-ink text-white"><Sparkles className="h-7 w-7" /></span>
            <h1 className="mt-3 text-[22px] font-semibold">{t('ask.title')}</h1>
            <div className="mt-5 grid gap-2 text-left">
              {examples.map((e) => (
                <button key={e} type="button" onClick={() => send(e)} className="press card px-4 py-3 text-[15px] font-medium">{e}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-[20px] px-4 py-3 text-[15.5px] leading-relaxed [overflow-wrap:anywhere] ${m.role === 'user' ? 'rounded-br-[6px] bg-ink text-white' : 'card rounded-bl-[6px]'}`}>
              {m.role === 'user' ? m.text : <Rich text={m.text} />}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="card rounded-bl-[6px] px-3 py-1"><ChickenLoader size={56} label={t('ask.thinking')} /></div></div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex items-end gap-2 rounded-[22px] border border-line bg-white p-2 shadow-lift lg:bottom-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500} placeholder={t('ask.placeholder')} aria-label={t('ask.placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] outline-none" />
        <button type="submit" disabled={busy || !text.trim()} aria-label={t('ask.send')} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
      <p className="tabular mt-2 text-center text-[12.5px] text-ink-faint">{t('ask.quota', { used, limit })}</p>
    </div>
  );
}
