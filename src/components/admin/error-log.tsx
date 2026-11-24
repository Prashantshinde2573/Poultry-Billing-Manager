'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bug, Check, ChevronDown } from 'lucide-react';
import { Badge, Button, Empty, PageHeader } from '@/components/ui/core';
import { resolveErrors } from '@/app/actions/system';
import { Kpi } from './bits';

type Err = {
  id: number; created_at: string; source: string; message: string; code: string | null; path: string | null; digest: string | null; stack: string | null;
  user_agent: string | null; meta: Record<string, any>; business_name: string | null; user_email: string | null; resolved: boolean;
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const device = (ua: string | null) => !ua ? '' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Other';

export function ErrorLog({ data, resolved }: { data: { open: number; today: number; items: Err[] }; resolved: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const resolve = (ids: number[] | null) => start(async () => { await resolveErrors(ids); });
  return (
    <div className="space-y-6">
      <PageHeader title="Error log" sub="Crashes and failed saves from every business, newest first."
        right={!resolved && data.items.length > 0 ? <Button variant="outline" size="sm" disabled={pending} onClick={() => resolve(null)}><Check className="h-4 w-4" /> Mark all fixed</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Kpi label="Open" value={data.open} tone={data.open ? 'bad' : 'good'} />
        <Kpi label="Last 24 hours" value={data.today} />
      </div>
      <div className="flex gap-2">
        <Link href="/admin/errors" className={`press h-9 rounded-full px-4 py-2 text-[14px] font-medium ${!resolved ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>Open</Link>
        <Link href="/admin/errors?show=resolved" className={`press h-9 rounded-full px-4 py-2 text-[14px] font-medium ${resolved ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>Fixed</Link>
      </div>
      {data.items.length === 0 ? <Empty icon={<Bug className="h-6 w-6" />} title={resolved ? 'Nothing marked fixed yet' : 'No open errors'} sub={resolved ? undefined : 'New crashes and failed saves will show up here.'} /> : (
        <ul className={`card divide-y divide-line overflow-hidden ${pending ? 'opacity-60' : ''}`}>
          {data.items.map((e) => {
            const isOpen = open === e.id;
            const repeat = Number(e.meta?.repeat ?? 1);
            return (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} className="press flex w-full gap-3 px-4 py-3.5 text-left hover:bg-mint/60">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[14.5px] font-medium leading-snug">{e.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
                      <Badge tone={e.source === 'server' ? 'bad' : e.source === 'action' ? 'warn' : 'violet'}>{e.source}</Badge>
                      {repeat > 1 && <Badge tone="slate">×{repeat}</Badge>}
                      <span>{when(e.created_at)}</span>
                      {e.business_name && <span>· {e.business_name}</span>}
                      {e.path && <span className="break-all">· {e.path}</span>}
                    </div>
                  </div>
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="space-y-3 bg-mint/40 px-4 pb-4 pt-1 text-[13px]">
                    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
                      {e.code && <><dt className="text-ink-muted">Code</dt><dd className="break-all">{e.code}</dd></>}
                      {e.user_email && <><dt className="text-ink-muted">User</dt><dd className="break-all">{e.user_email}</dd></>}
                      {e.user_agent && <><dt className="text-ink-muted">Device</dt><dd>{device(e.user_agent)}</dd></>}
                      {e.digest && <><dt className="text-ink-muted">Digest</dt><dd className="break-all">{e.digest}</dd></>}
                      {e.meta && Object.keys(e.meta).filter((k) => k !== 'repeat').length > 0 && <><dt className="text-ink-muted">Details</dt><dd className="break-all">{JSON.stringify(Object.fromEntries(Object.entries(e.meta).filter(([k]) => k !== 'repeat')))}</dd></>}
                    </dl>
                    {e.stack && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[12px] bg-ink p-3 text-[11.5px] leading-relaxed text-white/85">{e.stack}</pre>}
                    {!e.resolved && <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve([e.id])}><Check className="h-4 w-4" /> Mark fixed</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
