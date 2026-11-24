'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, History, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Sheet } from '@/components/ui/sheet';
import { AiOrb } from './ai-orb';
import { askAI, deleteChat, getChat, listChats, type ChatTurn } from '@/app/actions/ask';

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

export function AskChat({ used: used0, limit, initial }: { used: number; limit: number; initial?: { id: string; messages: ChatTurn[] } | null }) {
  const { t, locale } = useI18n();
  const [turns, setTurns] = useState<ChatTurn[]>(initial?.messages ?? []);
  const [chatId, setChatId] = useState<string | null>(initial?.id ?? null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(used0);
  const [hist, setHist] = useState<{ id: string; title: string; at: string; n: number }[] | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);
  // keep the URL pointing at the open chat (so reload / back works)
  useEffect(() => { try { history.replaceState(null, '', chatId ? `/app/ask?c=${chatId}` : '/app/ask'); } catch { /* ignore */ } }, [chatId]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...turns, { role: 'user', text: question } as ChatTurn];
    setTurns(next); setText(''); setBusy(true);
    try {
      const r = await askAI(next, chatId);
      if (r.ok) { setTurns([...next, { role: 'assistant', text: r.text }]); setUsed(r.used); if (r.chatId) setChatId(r.chatId); setHist(null); }
      else setTurns([...next, { role: 'assistant', text: r.code === 'PLAN_LIMIT' ? t('ask.limit') : r.code === 'AI_OFF' ? t('ask.off') : t('ask.failed') }]);
    } catch { setTurns([...next, { role: 'assistant', text: t('ask.failed') }]); }
    setBusy(false);
  };
  const newChat = () => { if (busy) return; setTurns([]); setChatId(null); setText(''); setHistOpen(false); setTimeout(() => input.current?.focus(), 50); };
  const openHistory = async () => { setHistOpen(true); if (!hist) setHist(await listChats()); };
  const openChat = async (id: string) => {
    const c = await getChat(id);
    if (c) { setTurns(c.messages ?? []); setChatId(c.id); }
    setHistOpen(false);
  };
  const remove = async (id: string | null) => {
    await deleteChat(id);
    if (id === null || id === chatId) newChat();
    setHist(id === null ? [] : (hist ?? []).filter((h) => h.id !== id));
  };
  const when = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : locale === 'mr' ? 'mr-IN' : 'hi-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

  const examples = [t('ask.ex1'), t('ask.ex2'), t('ask.ex3'), t('ask.ex4')];
  return (
    <div className="flex min-h-[calc(100dvh-220px)] flex-col">
      {/* header: new chat · history */}
      <div className="mb-3 flex items-center gap-2">
        <AiOrb size={36} />
        <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{t('nav.ask')}</h1>
        <button type="button" onClick={openHistory} className="press inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[14px] font-medium">
          <History className="h-[18px] w-[18px]" /> {t('ask.history')}
        </button>
        <button type="button" onClick={newChat} disabled={busy || turns.length === 0} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[14px] font-medium text-white disabled:opacity-40">
          <Plus className="h-[18px] w-[18px]" /> {t('ask.new')}
        </button>
      </div>

      <div className="flex-1 space-y-3 pb-4">
        {turns.length === 0 && (
          <div className="pt-6 text-center">
            <div className="flex justify-center"><span className="rounded-full bg-ink p-2.5"><AiOrb size={84} /></span></div>
            <h2 className="mt-3 text-[21px] font-semibold">{t('ask.title')}</h2>
            <div className="mt-5 grid gap-2 text-left">
              {examples.map((e) => (
                <button key={e} type="button" onClick={() => send(e)} className="press card px-4 py-3 text-[15px] font-medium">{e}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <span className="mb-1 rounded-full bg-ink p-0.5"><AiOrb size={26} /></span>}
            <div className={`max-w-[84%] rounded-[20px] px-4 py-3 text-[15.5px] leading-relaxed [overflow-wrap:anywhere] ${m.role === 'user' ? 'rounded-br-[6px] bg-ink text-white' : 'card rounded-bl-[6px]'}`}>
              {m.role === 'user' ? m.text : <Rich text={m.text} />}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink p-0.5"><AiOrb size={26} /></span>
            <span className="card rounded-bl-[6px] px-4 py-2.5 text-[14.5px] text-ink-muted">{t('ask.thinking')}</span>
          </div>
        )}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex items-end gap-2 rounded-[22px] border border-line bg-white p-2 shadow-lift lg:bottom-4">
        <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500} placeholder={t('ask.placeholder')} aria-label={t('ask.placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] outline-none" />
        <button type="submit" disabled={busy || !text.trim()} aria-label={t('ask.send')} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
      <p className="tabular mt-2 text-center text-[12.5px] text-ink-faint">{t('ask.quota', { used, limit })}</p>

      <Sheet open={histOpen} onClose={() => setHistOpen(false)} title={t('ask.history')}>
        <div className="space-y-3 pb-2">
          <button type="button" onClick={newChat} className="press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ink text-[15px] font-semibold text-white"><Plus className="h-5 w-5" /> {t('ask.new')}</button>
          {hist === null ? <p className="py-6 text-center text-ink-muted">{t('c.loading')}</p>
            : hist.length === 0 ? <p className="py-6 text-center text-ink-muted">{t('ask.noHistory')}</p>
            : (
              <>
                <ul className="divide-y divide-line rounded-[16px] border border-line">
                  {hist.map((h) => (
                    <li key={h.id} className={`flex items-center gap-2 pl-4 pr-1 ${h.id === chatId ? 'bg-mint' : ''}`}>
                      <button type="button" onClick={() => openChat(h.id)} className="press min-w-0 flex-1 py-3 text-left">
                        <p className="line-clamp-2 break-words text-[15px] font-medium">{h.title}</p>
                        <p className="text-[12.5px] text-ink-muted">{when(h.at)}</p>
                      </button>
                      <button type="button" aria-label={t('ask.deleteChat')} onClick={() => remove(h.id)} className="press rounded-full p-3 text-bad hover:bg-bad/10"><Trash2 className="h-5 w-5" /></button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => remove(null)} className="press w-full py-2 text-center text-[14px] font-medium text-bad">{t('ask.clearAll')}</button>
              </>
            )}
        </div>
      </Sheet>
    </div>
  );
}
