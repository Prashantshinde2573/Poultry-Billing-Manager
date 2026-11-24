'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Phone } from 'lucide-react';
import { Badge, Button, Empty } from '@/components/ui/core';
import { SelectInput, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { adminUpdateLead } from '@/app/actions/admin';
import { dmy } from './bits';

const ST: Record<string, { label: string; tone: 'warn' | 'aqua' | 'good' | 'slate' }> = {
  NEW: { label: 'New', tone: 'warn' }, CONTACTED: { label: 'Contacted', tone: 'aqua' }, CONVERTED: { label: 'Customer', tone: 'good' }, CLOSED: { label: 'Closed', tone: 'slate' },
};

export function Leads({ rows }: { rows: any[] }) {
  const router = useRouter();
  const [f, setF] = useState('open');
  const [ed, setEd] = useState<any | null>(null);
  const { pending, err, run } = useSubmit();
  const list = rows.filter((l) => (f === 'open' ? l.status === 'NEW' || l.status === 'CONTACTED' : f === 'all' ? true : l.status === f));
  const wa = (p: string) => `https://wa.me/${p.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`;
  return (
    <div className="space-y-5">
      <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Enquiries</h1><p className="text-[14px] text-ink-muted">Demo requests from the website.</p></div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[['open', 'Open'], ['CONVERTED', 'Customers'], ['CLOSED', 'Closed'], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF(k)} className={`press h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${f === k ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <Empty title="Nothing here" /> : (
        <div className="card divide-y divide-line">
          {list.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <button type="button" onClick={() => setEd({ ...l, notes: l.notes ?? '' })} className="min-w-0 flex-1 text-left">
                <p className="break-words font-medium">{l.name}{l.business_name ? <span className="font-normal text-ink-muted"> · {l.business_name}</span> : null}</p>
                <p className="break-words text-[13px] text-ink-muted">{[l.city, l.plan_id, dmy(l.created_at)].filter(Boolean).join(' · ')}</p>
                {l.message && <p className="mt-1 line-clamp-2 text-[13.5px] text-ink-soft">{l.message}</p>}
                {l.notes && <p className="mt-1 line-clamp-1 text-[13px] italic text-ink-muted">{l.notes}</p>}
              </button>
              <Badge tone={ST[l.status].tone}>{ST[l.status].label}</Badge>
              <a href={`tel:${l.phone}`} aria-label={`Call ${l.phone}`} className="press flex h-10 w-10 items-center justify-center rounded-full border border-line"><Phone className="h-4 w-4" /></a>
              <a href={wa(l.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="press flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"><MessageCircle className="h-4 w-4" /></a>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!ed} onClose={() => setEd(null)} title={ed?.name ?? ''}
        footer={<><Button variant="outline" onClick={() => setEd(null)}>Cancel</Button><Button disabled={pending} onClick={() => run(() => adminUpdateLead(ed.id, ed.status, ed.notes), () => { setEd(null); })}>Save</Button></>}>
        {ed && <div className="space-y-3">
          <p className="tabular text-[15px]">{ed.phone}</p>
          <SelectInput label="Status" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</SelectInput>
          <TextInput label="Notes" value={ed.notes} onChange={(e) => setEd({ ...ed, notes: e.target.value })} />
          {ed.status === 'CONVERTED' && <a className="text-[14px] font-medium text-aqua-deep" href="/admin/businesses?new=1">Add their business</a>}
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </div>
  );
}
