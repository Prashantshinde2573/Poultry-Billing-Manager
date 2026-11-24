'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui/core';
import { TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { adminUpsertPlan } from '@/app/actions/admin';
import { rs } from './bits';

const MODS = [['suppliers', 'Suppliers & purchases'], ['orders', 'Orders'], ['trips', 'Trips & driver app'], ['expenses', 'Expenses'], ['pnl', 'Profit & loss'], ['reports', 'Reports']] as const;
const s = (v: unknown) => (v == null ? '' : String(v));

export function PlansEditor({ plans }: { plans: any[] }) {
  const router = useRouter();
  const toast = useToast();
  const [ed, setEd] = useState<any | null>(null);
  const { pending, err, run } = useSubmit();
  const open = (p: any) => setEd({ ...p, monthly: s(p.monthly), half_yearly: s(p.half_yearly), yearly: s(p.yearly), max_staff: s(p.max_staff), max_drivers: s(p.max_drivers), max_vehicles: s(p.max_vehicles), features: p.features ?? [], isNew: !p.name });
  const set = (k: string, v: unknown) => setEd({ ...ed, [k]: v });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Plans</h1><p className="text-[14px] text-ink-muted">Prices and features shown on the website and in the app. Changes apply to everyone on that plan.</p></div>
        <Button variant="outline" onClick={() => open({ id: '', name: '', modules: [], features: [], public: true, active: true, sort_order: 10 })}><Plus className="h-4 w-4" /> New plan</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <button key={p.id} type="button" onClick={() => open(p)} className="card press flex flex-col p-5 text-left hover:border-ink/25">
            <div className="flex items-center justify-between gap-2"><p className="text-[18px] font-semibold">{p.name}</p>{!p.public ? <Badge>internal</Badge> : !p.active ? <Badge tone="bad">hidden</Badge> : p.highlight ? <Badge tone="aqua">highlight</Badge> : null}</div>
            <p className="tabular mt-2 text-[24px] font-semibold">{p.monthly != null ? rs(p.monthly) : 'Talk to us'}<span className="text-[13px] font-normal text-ink-muted">{p.monthly != null ? ' /month' : ''}</span></p>
            <p className="tabular text-[13px] text-ink-muted">6 mo {rs(p.half_yearly)} · 1 yr {rs(p.yearly)}</p>
            <p className="mt-3 text-[13px] text-ink-soft">{p.modules.length ? p.modules.join(', ') : 'Khata & bills only'}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{p.businesses} businesses</p>
          </button>
        ))}
      </div>
      <Sheet open={!!ed} onClose={() => setEd(null)} title={ed?.isNew ? 'New plan' : `Edit ${ed?.name ?? ''}`} wide
        footer={<><Button variant="outline" onClick={() => setEd(null)}>Cancel</Button><Button disabled={pending} onClick={() => run(() => adminUpsertPlan(ed), () => { toast('Plan saved'); setEd(null); router.refresh(); })}>Save plan</Button></>}>
        {ed && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label="Code" value={ed.id} disabled={!ed.isNew} onChange={(e) => set('id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} hint="lowercase, no spaces" />
            <TextInput label="Name (English)" value={ed.name} onChange={(e) => set('name', e.target.value)} />
            <TextInput label="Sort order" inputMode="numeric" value={s(ed.sort_order)} onChange={(e) => set('sort_order', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Name (मराठी)" value={ed.name_mr ?? ''} onChange={(e) => set('name_mr', e.target.value)} />
            <TextInput label="Name (हिंदी)" value={ed.name_hi ?? ''} onChange={(e) => set('name_hi', e.target.value)} />
          </div>
          <TextInput label="One line (English)" value={ed.blurb ?? ''} onChange={(e) => set('blurb', e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="One line (मराठी)" value={ed.blurb_mr ?? ''} onChange={(e) => set('blurb_mr', e.target.value)} />
            <TextInput label="One line (हिंदी)" value={ed.blurb_hi ?? ''} onChange={(e) => set('blurb_hi', e.target.value)} />
          </div>
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Price (₹) · leave empty for &ldquo;talk to us&rdquo;</legend>
            <div className="grid grid-cols-3 gap-3">
              <TextInput label="1 month" inputMode="decimal" value={ed.monthly} onChange={(e) => set('monthly', e.target.value)} />
              <TextInput label="6 months" inputMode="decimal" value={ed.half_yearly} onChange={(e) => set('half_yearly', e.target.value)} placeholder={ed.monthly ? String(Number(ed.monthly) * 5) : ''} />
              <TextInput label="12 months" inputMode="decimal" value={ed.yearly} onChange={(e) => set('yearly', e.target.value)} placeholder={ed.monthly ? String(Number(ed.monthly) * 10) : ''} />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Limits · empty = unlimited</legend>
            <div className="grid grid-cols-3 gap-3">
              <TextInput label="Staff" inputMode="numeric" value={ed.max_staff} onChange={(e) => set('max_staff', e.target.value.replace(/\D/g, ''))} />
              <TextInput label="Drivers" inputMode="numeric" value={ed.max_drivers} onChange={(e) => set('max_drivers', e.target.value.replace(/\D/g, ''))} />
              <TextInput label="Vehicles" inputMode="numeric" value={ed.max_vehicles} onChange={(e) => set('max_vehicles', e.target.value.replace(/\D/g, ''))} />
            </div>
          </fieldset>
          <fieldset disabled={ed.id === 'trial'}>
            <legend className="mb-2 text-[15px] font-semibold">Features · customers, bills, payments and WhatsApp are in every plan</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5 text-[14.5px]">
                  <input type="checkbox" className="h-5 w-5 accent-ink" checked={ed.modules.includes(k)} onChange={(e) => set('modules', e.target.checked ? [...ed.modules, k] : ed.modules.filter((x: string) => x !== k))} />{l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Website bullet points</legend>
            <div className="space-y-3">
              {ed.features.map((f: any, i: number) => (
                <div key={i} className="grid gap-2 rounded-[14px] border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  {(['en', 'mr', 'hi'] as const).map((lg) => <input key={lg} aria-label={lg} className="input h-10" value={f[lg] ?? ''} placeholder={lg} onChange={(e) => set('features', ed.features.map((x: any, j: number) => (j === i ? { ...x, [lg]: e.target.value } : x)))} />)}
                  <button type="button" aria-label="Remove" onClick={() => set('features', ed.features.filter((_: any, j: number) => j !== i))} className="press flex h-10 w-10 items-center justify-center rounded-full text-bad hover:bg-bad/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set('features', [...ed.features, { en: '', mr: '', hi: '' }])}><Plus className="h-4 w-4" /> Add point</Button>
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-4 text-[14.5px]">
            {[['highlight', 'Highlight on website'], ['public', 'Show on website'], ['active', 'Active']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-ink" checked={!!ed[k]} disabled={ed.id === 'trial' && k === 'public'} onChange={(e) => set(k, e.target.checked)} />{l}</label>
            ))}
          </div>
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </div>
  );
}
