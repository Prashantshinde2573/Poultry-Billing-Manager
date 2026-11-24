'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { inr, todayIST } from '@/lib/format';
import { Avatar, Button, Empty } from '@/components/ui/core';
import { loadActivity } from '@/app/actions/system';

type Item = { id: string; at: string; action: string; entity: string; entity_id: string | null; metadata: Record<string, any>; actor_id: string | null; actor_name: string; actor_role: string | null };

function linkFor(i: Item): string | null {
  if (!i.entity_id) return null;
  switch (i.entity) {
    case 'parties': return i.metadata?.supplier && !i.metadata?.customer ? `/app/suppliers/${i.entity_id}` : `/app/customers/${i.entity_id}`;
    case 'trips': return `/app/trips/${i.entity_id}`;
    case 'orders': return `/app/orders/${i.entity_id}`;
    default: return null;
  }
}

export function ActivityFeed({ first, members }: { first: Item[]; members: { id: string; name: string }[] }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState(first);
  const [actor, setActor] = useState<string>('');
  const [done, setDone] = useState(first.length < 40);
  const [pending, start] = useTransition();
  const lc = locale === 'en' ? 'en-IN' : locale === 'mr' ? 'mr-IN' : 'hi-IN';
  const time = (iso: string) => new Intl.DateTimeFormat(lc, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  const today = todayIST();
  const yest = todayIST(new Date(Date.now() - 864e5));
  const dayLabel = (d: string) => d === today ? t('act.today') : d === yest ? t('act.yesterday')
    : new Intl.DateTimeFormat(lc, { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(d + 'T12:00:00+05:30'));

  const filter = (id: string) => {
    setActor(id);
    start(async () => { const r = await loadActivity(null, id || null); setItems(r); setDone(r.length < 40); });
  };
  const more = () => start(async () => {
    const r = await loadActivity(items[items.length - 1]?.at ?? null, actor || null);
    setItems((x) => [...x, ...r]); setDone(r.length < 40);
  });

  const groups: { day: string; list: Item[] }[] = [];
  for (const i of items) {
    const d = dayKey(i.at);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, list: [] });
    groups.at(-1)!.list.push(i);
  }
  const label = (a: string) => { const k = `act.${a}` as any; const s = t(k); return s === k ? t('act.other') : s; };
  const detail = (i: Item) => {
    const m = i.metadata ?? {};
    const bits = [m.name, m.registration_no, m.amount != null ? inr(m.amount, { decimals: false }) : m.total != null ? inr(m.total, { decimals: false }) : null,
      m.rate != null ? `₹${m.rate}/kg` : null, m.reason].filter(Boolean);
    return bits.join(' · ');
  };

  return (
    <div className="space-y-5">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label={t('act.everyone')}>
        {[{ id: '', name: t('act.everyone') }, ...members].map((m) => (
          <button key={m.id || 'all'} type="button" role="radio" aria-checked={actor === m.id} onClick={() => filter(m.id)}
            className={`press h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${actor === m.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {m.name}
          </button>
        ))}
      </div>

      {items.length === 0 ? <Empty icon={<Activity className="h-6 w-6" />} title={t('act.empty')} /> : (
        <div className={`space-y-6 ${pending ? 'opacity-60' : ''}`}>
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 px-1 text-[13.5px] font-semibold text-ink-muted">{dayLabel(g.day)}</h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {g.list.map((i) => {
                  const href = linkFor(i);
                  const body = (
                    <div className="flex gap-3 px-4 py-3">
                      <Avatar name={i.actor_name || '?'} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[15px] leading-snug"><span className="font-semibold">{i.actor_name}</span> · {label(i.action)}</p>
                        {detail(i) && <p className="mt-0.5 break-words text-[13.5px] text-ink-soft">{detail(i)}</p>}
                      </div>
                      <span className="tabular shrink-0 pt-0.5 text-[12.5px] text-ink-muted">{time(i.at)}</span>
                    </div>
                  );
                  return <li key={i.id}>{href ? <Link href={href} className="press block hover:bg-mint/60">{body}</Link> : body}</li>;
                })}
              </ul>
            </section>
          ))}
          {!done && <div className="flex justify-center"><Button variant="outline" disabled={pending} onClick={more}>{t('act.loadMore')}</Button></div>}
        </div>
      )}
    </div>
  );
}
