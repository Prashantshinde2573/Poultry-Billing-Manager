'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/core';
import { TextInput } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { adminSaveSettings } from '@/app/actions/admin';
import { changePassword } from '@/app/actions/auth';

export function AdminSettings({ s }: { s: any }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ brand_name: s.brand_name ?? 'PoulGo', whatsapp: s.whatsapp ?? '', upi_id: s.upi_id ?? '', payee_name: s.payee_name ?? '', support_phone: s.support_phone ?? '', support_email: s.support_email ?? '', trial_days: String(s.trial_days ?? 14), grace_days: String(s.grace_days ?? 5) });
  const [pw, setPw] = useState('');
  const a = useSubmit();
  const b = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-6">
      <div><h1 className="text-[28px] font-semibold tracking-[-0.02em]">Settings</h1><p className="text-[14px] text-ink-muted">Shown to owners on the renew screen and on the website.</p></div>
      <section className="card space-y-4 p-5">
        <h2 className="text-[16px] font-semibold">How owners pay you</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="UPI ID" value={f.upi_id} onChange={set('upi_id')} placeholder="name@okhdfcbank" />
          <TextInput label="Payee name (as in bank)" value={f.payee_name} onChange={set('payee_name')} />
          <TextInput label="WhatsApp number" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} hint="With country code, e.g. 919876543210" />
          <TextInput label="Support phone" inputMode="tel" value={f.support_phone} onChange={set('support_phone')} />
          <TextInput label="Support email" value={f.support_email} onChange={set('support_email')} />
          <TextInput label="Brand name" value={f.brand_name} onChange={set('brand_name')} />
        </div>
        <h2 className="pt-2 text-[16px] font-semibold">Defaults</h2>
        <div className="grid grid-cols-2 gap-3 sm:w-1/2">
          <TextInput label="Free trial days" inputMode="numeric" value={f.trial_days} onChange={set('trial_days')} />
          <TextInput label="Grace days (suggested)" inputMode="numeric" value={f.grace_days} onChange={set('grace_days')} />
        </div>
        <ErrorBox msg={a.err} />
        <Button disabled={a.pending} onClick={() => a.run(() => adminSaveSettings(f), () => { toast('Saved'); router.refresh(); })}>Save settings</Button>
      </section>
      <section className="card space-y-4 p-5 sm:max-w-md">
        <h2 className="text-[16px] font-semibold">Your password</h2>
        <TextInput label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters" />
        <ErrorBox msg={b.err} />
        <Button variant="outline" disabled={b.pending || pw.length < 10} onClick={() => b.run(() => changePassword(pw), () => { toast('Password changed'); setPw(''); })}>Change password</Button>
      </section>
    </div>
  );
}
