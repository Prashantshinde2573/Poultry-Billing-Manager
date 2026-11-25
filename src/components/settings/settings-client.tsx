'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext, nav } from '@/components/shell/perm';
import { ChevronRight, KeyRound, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { localName } from '@/lib/i18n';
import { inr } from '@/lib/format';
import { Avatar, Badge, Button } from '@/components/ui/core';
import { SelectInput, Segmented, TextInput } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { addUser, resetPassword, setRate, updateBusiness, updateMember, upsertBirdSize, upsertCategory, upsertDriver, upsertVehicle } from '@/app/actions/settings';

function useDone(close: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  return () => {
    toast(t('c.saved')); close();
    const back = safeNext(sp.get('next'));
    if (back) nav(router, 'push', back);
  };
}

/** Opens an "add" sheet straight away when the screen was opened with ?add=<what> (from a form's "+ Add new"). */
function useAutoAdd(what: string, open: () => void) {
  const sp = useSearchParams();
  const want = sp.get('add') === what;
  useEffect(() => { if (want) open(); }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-[15px]">
      <input type="checkbox" className="h-5 w-5 accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function ListCard({ title, onAdd, children }: { title: string; onAdd?: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {onAdd && <Button size="sm" variant="outline" onClick={onAdd}><Plus className="h-4 w-4" /> {t('c.add')}</Button>}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Item({ title, sub, right, onClick }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex w-full items-center gap-3 py-3 text-left">
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{title}</span>{sub && <span className="block truncate text-sm text-ink-muted">{sub}</span>}</span>
      {right}<ChevronRight className="h-4 w-4 text-ink-faint" />
    </button>
  );
}

/* --------------------------------------------------------------- business */
export function BusinessSection({ biz }: { biz: { name: string; phone: string | null; email: string | null; address: string | null; gstin: string | null; settings: any } }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    name: biz.name, phone: biz.phone ?? '', email: biz.email ?? '', address: biz.address ?? '', gstin: biz.gstin ?? '',
    allow_customer_advance: !!biz.settings?.allow_customer_advance, driver_auto_confirm: !!biz.settings?.driver_auto_confirm,
    report_footer: biz.settings?.report_footer ?? '', statement_note: biz.settings?.statement_note ?? '',
  });
  const done = useDone(() => {});
  const { pending, err, run } = useSubmit();
  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">{t('set.business')}</h2>
      <TextInput label={t('auth.businessName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <TextInput label={t('c.phone')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <TextInput label="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
      </div>
      <TextInput label={t('auth.email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <TextInput label={t('c.address')} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      <Check label={t('set.allowAdvance')} checked={f.allow_customer_advance} onChange={(v) => setF({ ...f, allow_customer_advance: v })} />
      <Check label={t('set.autoConfirm')} checked={f.driver_auto_confirm} onChange={(v) => setF({ ...f, driver_auto_confirm: v })} />
      <TextInput label={t('set.statementNote')} value={f.statement_note} onChange={(e) => setF({ ...f, statement_note: e.target.value })} />
      <TextInput label={t('set.footer')} value={f.report_footer} onChange={(e) => setF({ ...f, report_footer: e.target.value })} />
      <ErrorBox msg={err} />
      <Button disabled={pending} onClick={() => run(() => updateBusiness({
        name: f.name, phone: f.phone, email: f.email, address: f.address, gstin: f.gstin,
        settings: { allow_customer_advance: f.allow_customer_advance, driver_auto_confirm: f.driver_auto_confirm, report_footer: f.report_footer, statement_note: f.statement_note },
      }), done)}>{t('c.save')}</Button>
    </section>
  );
}

/* ------------------------------------------------------------ sizes/rates */
type Size = { id: string; name: string; name_mr: string | null; name_hi: string | null; sort_order: number; active: boolean; sale: string | null; purchase: string | null };

export function SizesSection({ sizes, today }: { sizes: Size[]; today: string }) {
  const { t, locale } = useI18n();
  const [edit, setEdit] = useState<Partial<Size> | null>(null);
  const [rate, setRateS] = useState<{ size: Size; kind: 'SALE' | 'PURCHASE'; rate: string; from: string } | null>(null);
  const close = () => { setEdit(null); setRateS(null); };
  const done = useDone(close);
  const { pending, err, run } = useSubmit();
  useAutoAdd('size', () => setEdit({ name: '', name_mr: '', name_hi: '', sort_order: sizes.length + 1, active: true }));
  return (
    <ListCard title={t('set.sizes')} onAdd={() => setEdit({ name: '', name_mr: '', name_hi: '', sort_order: sizes.length + 1, active: true })}>
      {sizes.map((s) => (
        <div key={s.id} className="py-3">
          <button type="button" className="press flex w-full items-center justify-between text-left" onClick={() => setEdit(s)}>
            <span className="font-medium">{localName(s, locale)} {!s.active && <Badge>{t('c.inactive')}</Badge>}</span><ChevronRight className="h-4 w-4 text-ink-faint" />
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['SALE', 'PURCHASE'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setRateS({ size: s, kind: k, rate: (k === 'SALE' ? s.sale : s.purchase) ?? '', from: today })}
                className="press rounded-xl bg-mint px-3 py-2 text-left text-sm">
                <span className="block text-ink-muted">{k === 'SALE' ? t('set.saleRate') : t('set.purchaseRate')}</span>
                <span className="tabular font-semibold">{(k === 'SALE' ? s.sale : s.purchase) ? `${inr(k === 'SALE' ? s.sale : s.purchase)}/kg` : '—'}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <Sheet open={!!edit} onClose={close} title={t('c.size')}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => edit && run(() => upsertBirdSize({ id: edit.id, name: edit.name ?? '', name_mr: edit.name_mr ?? '', name_hi: edit.name_hi ?? '', sort_order: Number(edit.sort_order ?? 0), active: edit.active ?? true }), done)}>{t('c.save')}</Button></>}>
        {edit && <div className="space-y-3">
          <TextInput label={t('c.name')} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <TextInput label={t('set.nameMr')} value={edit.name_mr ?? ''} onChange={(e) => setEdit({ ...edit, name_mr: e.target.value })} />
            <TextInput label={t('set.nameHi')} value={edit.name_hi ?? ''} onChange={(e) => setEdit({ ...edit, name_hi: e.target.value })} />
          </div>
          <TextInput label="#" inputMode="numeric" value={String(edit.sort_order ?? 0)} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value.replace(/\D/g, '') || 0) })} />
          <Check label={t('c.active')} checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} />
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
      <Sheet open={!!rate} onClose={close} title={rate ? `${localName(rate.size, locale)} · ${rate.kind === 'SALE' ? t('set.saleRate') : t('set.purchaseRate')}` : ''}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => rate && run(() => setRate(rate.size.id, rate.kind, rate.rate, rate.from), done)}>{t('set.setRate')}</Button></>}>
        {rate && <div className="space-y-3">
          <TextInput label={t('c.ratePerKg')} inputMode="decimal" prefix="₹" value={rate.rate} onChange={(e) => setRateS({ ...rate, rate: e.target.value })} autoFocus />
          <TextInput type="date" label={t('set.effectiveFrom')} value={rate.from} onChange={(e) => setRateS({ ...rate, from: e.target.value })} />
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </ListCard>
  );
}

/* ------------------------------------------------------- vehicles/drivers */
type Vehicle = { id?: string; registration_no: string; ownership: 'OWNED' | 'RENTED'; description: string | null; active: boolean };
type Driver = { id?: string; name: string; phone: string | null; license_no: string | null; active: boolean; user_id?: string | null };

export function FleetSection({ vehicles, drivers }: { vehicles: Vehicle[]; drivers: Driver[] }) {
  const { t } = useI18n();
  const [v, setV] = useState<Vehicle | null>(null);
  const [d, setD] = useState<Driver | null>(null);
  const close = () => { setV(null); setD(null); };
  const done = useDone(close);
  const { pending, err, run } = useSubmit();
  useAutoAdd('vehicle', () => setV({ registration_no: '', ownership: 'OWNED', description: '', active: true }));
  useAutoAdd('driver', () => setD({ name: '', phone: '', license_no: '', active: true }));
  return (
    <div id="fleet" className="grid gap-4 lg:grid-cols-2">
      <ListCard title={t('set.vehicles')} onAdd={() => setV({ registration_no: '', ownership: 'OWNED', description: '', active: true })}>
        {vehicles.map((x) => <Item key={x.id} title={x.registration_no} sub={[x.ownership === 'OWNED' ? t('set.owned') : t('set.rented'), x.description].filter(Boolean).join(' · ')} right={!x.active ? <Badge>{t('c.inactive')}</Badge> : undefined} onClick={() => setV(x)} />)}
      </ListCard>
      <ListCard title={t('set.drivers')} onAdd={() => setD({ name: '', phone: '', license_no: '', active: true })}>
        {drivers.map((x) => <Item key={x.id} title={x.name} sub={[x.phone, x.license_no, x.user_id ? '🔑' : null].filter(Boolean).join(' · ')} right={!x.active ? <Badge>{t('c.inactive')}</Badge> : undefined} onClick={() => setD(x)} />)}
      </ListCard>
      <Sheet open={!!v} onClose={close} title={t('c.vehicle')}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => v && run(() => upsertVehicle({ id: v.id, registration_no: v.registration_no, ownership: v.ownership, description: v.description ?? '', active: v.active }), done)}>{t('c.save')}</Button></>}>
        {v && <div className="space-y-3">
          <TextInput label={t('c.vehicle')} value={v.registration_no} onChange={(e) => setV({ ...v, registration_no: e.target.value.toUpperCase() })} placeholder="MH 12 AB 1234" />
          <Segmented value={v.ownership} onChange={(o) => setV({ ...v, ownership: o })} options={[{ value: 'OWNED', label: t('set.owned') }, { value: 'RENTED', label: t('set.rented') }]} />
          <TextInput label={t('c.notes')} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} />
          <Check label={t('c.active')} checked={v.active} onChange={(a) => setV({ ...v, active: a })} />
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
      <Sheet open={!!d} onClose={close} title={t('c.driver')}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => d && run(() => upsertDriver({ id: d.id, name: d.name, phone: d.phone ?? '', license_no: d.license_no ?? '', active: d.active }), done)}>{t('c.save')}</Button></>}>
        {d && <div className="space-y-3">
          <TextInput label={t('c.name')} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <TextInput label={t('c.phone')} inputMode="tel" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value })} />
          <TextInput label={t('set.license')} value={d.license_no ?? ''} onChange={(e) => setD({ ...d, license_no: e.target.value })} />
          <Check label={t('c.active')} checked={d.active} onChange={(a) => setD({ ...d, active: a })} />
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ users */
type Perms = { suppliers: boolean; expenses: boolean; verify_payments: boolean; rate_override: boolean; reports: boolean };
type Member = { user_id: string; display_name: string; role: 'owner' | 'staff' | 'driver'; permissions: Partial<Perms>; active: boolean; login?: string };
const PERMS: (keyof Perms)[] = ['suppliers', 'expenses', 'verify_payments', 'rate_override', 'reports'];

export function UsersSection({ members, me, serviceKey }: { members: Member[]; me: string; serviceKey: boolean }) {
  const { t } = useI18n();
  const [add, setAdd] = useState<{ name: string; login: string; password: string; role: 'staff' | 'driver'; permissions: Perms } | null>(null);
  const [edit, setEdit] = useState<Member | null>(null);
  const [pw, setPw] = useState('');
  const close = () => { setAdd(null); setEdit(null); setPw(''); };
  const done = useDone(close);
  const { pending, err, run } = useSubmit();
  const blankPerms: Perms = { suppliers: false, expenses: false, verify_payments: false, rate_override: false, reports: false };
  return (
    <ListCard title={t('set.users')} onAdd={() => setAdd({ name: '', login: '', password: '', role: 'driver', permissions: blankPerms })}>
      {!serviceKey && <p className="rounded-xl bg-[#FCF0DC] p-3 text-sm text-[#7A4A08]">{t('set.serviceKeyMissing')}</p>}
      {members.map((m) => (
        <button key={m.user_id} type="button" disabled={m.user_id === me} onClick={() => setEdit({ ...m, permissions: { ...blankPerms, ...m.permissions } })} className="press flex w-full items-center gap-3 py-3 text-left disabled:opacity-100">
          <Avatar name={m.display_name || '?'} size={40} />
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.display_name || '—'}</span>
            <span className="block truncate text-sm text-ink-muted">{m.role === 'staff' ? PERMS.filter((p) => m.permissions?.[p]).map((p) => t(`set.perm.${p}`)).join(', ') || '—' : m.login ?? ''}</span></span>
          <Badge tone={m.role === 'owner' ? 'ink' : m.role === 'staff' ? 'aqua' : 'violet'}>{t(`set.role.${m.role}`)}</Badge>
          {!m.active && <Badge tone="bad">{t('c.inactive')}</Badge>}
        </button>
      ))}
      <Sheet open={!!add} onClose={close} title={t('set.addUser')}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending || !serviceKey} onClick={() => add && run(() => addUser(add), done)}>{t('c.save')}</Button></>}>
        {add && <div className="space-y-3">
          <Segmented value={add.role} onChange={(r) => setAdd({ ...add, role: r })} options={[{ value: 'driver', label: t('set.role.driver') }, { value: 'staff', label: t('set.role.staff') }]} />
          <TextInput label={t('c.name')} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <TextInput label={t('auth.identifier')} inputMode="email" value={add.login} onChange={(e) => setAdd({ ...add, login: e.target.value })} hint={t('set.loginHint')} />
          <TextInput label={t('auth.password')} type="password" autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} hint={t('auth.passwordHint')} />
          {add.role === 'staff' && PERMS.map((p) => <Check key={p} label={t(`set.perm.${p}`)} checked={add.permissions[p]} onChange={(v) => setAdd({ ...add, permissions: { ...add.permissions, [p]: v } })} />)}
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
      <Sheet open={!!edit} onClose={close} title={edit?.display_name ?? ''}
        footer={<><Button variant="outline" onClick={close}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => edit && run(() => updateMember({ userId: edit.user_id, name: edit.display_name, role: edit.role, permissions: edit.permissions as Perms, active: edit.active }), done)}>{t('c.save')}</Button></>}>
        {edit && <div className="space-y-3">
          <TextInput label={t('c.name')} value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} />
          <SelectInput label={t('set.role')} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Member['role'] })}>
            <option value="staff">{t('set.role.staff')}</option><option value="driver">{t('set.role.driver')}</option>
          </SelectInput>
          {edit.role === 'staff' && PERMS.map((p) => <Check key={p} label={t(`set.perm.${p}`)} checked={!!edit.permissions[p]} onChange={(v) => setEdit({ ...edit, permissions: { ...edit.permissions, [p]: v } })} />)}
          <Check label={t('c.active')} checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
          {serviceKey && (
            <div className="flex items-end gap-2 rounded-2xl bg-white/70 p-3">
              <TextInput className="flex-1" label={t('set.resetPassword')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={t('auth.passwordHint')} />
              <Button variant="outline" disabled={pending || pw.length < 8} onClick={() => run(() => resetPassword(edit.user_id, pw), done)}><KeyRound className="h-4 w-4" /></Button>
            </div>
          )}
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </ListCard>
  );
}

/* ------------------------------------------------------------- categories */
type Cat = { id?: string; name: string; name_mr: string | null; name_hi: string | null; is_trip_cost: boolean; active: boolean };
export function CategoriesSection({ cats }: { cats: Cat[] }) {
  const { t, locale } = useI18n();
  const [c, setC] = useState<Cat | null>(null);
  const done = useDone(() => setC(null));
  const { pending, err, run } = useSubmit();
  useAutoAdd('category', () => setC({ name: '', name_mr: '', name_hi: '', is_trip_cost: false, active: true }));
  return (
    <ListCard title={t('set.categories')} onAdd={() => setC({ name: '', name_mr: '', name_hi: '', is_trip_cost: false, active: true })}>
      {cats.map((x) => <Item key={x.id} title={localName(x, locale)} sub={x.is_trip_cost ? t('set.tripCost') : undefined} right={!x.active ? <Badge>{t('c.inactive')}</Badge> : undefined} onClick={() => setC(x)} />)}
      <Sheet open={!!c} onClose={() => setC(null)} title={t('e.category')}
        footer={<><Button variant="outline" onClick={() => setC(null)}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => c && run(() => upsertCategory({ id: c.id, name: c.name, name_mr: c.name_mr ?? '', name_hi: c.name_hi ?? '', is_trip_cost: c.is_trip_cost, active: c.active }), done)}>{t('c.save')}</Button></>}>
        {c && <div className="space-y-3">
          <TextInput label={t('c.name')} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <TextInput label={t('set.nameMr')} value={c.name_mr ?? ''} onChange={(e) => setC({ ...c, name_mr: e.target.value })} />
            <TextInput label={t('set.nameHi')} value={c.name_hi ?? ''} onChange={(e) => setC({ ...c, name_hi: e.target.value })} />
          </div>
          <Check label={t('set.tripCost')} checked={c.is_trip_cost} onChange={(v) => setC({ ...c, is_trip_cost: v })} />
          <Check label={t('c.active')} checked={c.active} onChange={(v) => setC({ ...c, active: v })} />
          <ErrorBox msg={err} />
        </div>}
      </Sheet>
    </ListCard>
  );
}
