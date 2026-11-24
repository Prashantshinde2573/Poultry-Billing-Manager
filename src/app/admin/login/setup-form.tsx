'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/core';
import { TextInput } from '@/components/ui/fields';
import { ErrorBox, useSubmit } from '@/components/ui/use-submit';
import { setupSuperAdmin, signIn } from '@/app/actions/auth';

/** One-time: creates the first super admin for an email listed in SUPER_ADMIN_EMAILS. */
export function SetupForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const { pending, err, run } = useSubmit();
  return (
    <form className="mt-7 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      run(async () => {
        const r = await setupSuperAdmin(f.email, f.password, f.name);
        if (!r.ok) return r;
        return signIn(f.email, f.password, 'admin');
      }, () => { router.replace('/admin'); router.refresh(); });
    }}>
      <p className="text-[14px] text-ink-muted">Use the email you put in SUPER_ADMIN_EMAILS. This form disappears once the super admin exists.</p>
      <TextInput label="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <TextInput label="Email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} hint="At least 10 characters" minLength={10} required />
      <ErrorBox msg={err} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>Create super admin</Button>
    </form>
  );
}
