import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2, ExternalLink, ImagePlus, KeyRound, RefreshCw, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react';
import type { AppUser, Settings } from '@/types/api';
import { api } from '@/services/api/endpoints';
import { API_URL, ApiRequestError } from '@/services/api/client';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Alert, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/utils/dates';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import { parseScaled } from '@/utils/money';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-2xl p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Downscale an uploaded logo to ≤160px so it fits in a sheet cell (≈ <40 KB). */
async function logoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let url = canvas.toDataURL('image/png');
  if (url.length > 40000) url = canvas.toDataURL('image/jpeg', 0.85);
  if (url.length > 44000) throw new Error('Logo is too detailed. Please use a simpler or smaller image.');
  return url;
}

type FormValues = Omit<Settings, 'defaultRatePerKg' | 'currency' | 'timezone'> & { defaultRatePerKg: string };

function BusinessSettings() {
  const { settings, loaded } = useSettings();
  const { isOwner } = useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>();
  useEffect(() => {
    if (loaded) reset({ ...settings, defaultRatePerKg: settings.defaultRatePerKg === '' ? '' : String(settings.defaultRatePerKg) });
  }, [loaded, settings, reset]);
  const logo = watch('logoDataUrl');

  const save = async (v: FormValues) => {
    setError(null);
    if (!v.businessName?.trim()) return setError('Business name is required.');
    if (v.defaultRatePerKg && parseScaled(v.defaultRatePerKg, 2) === null) return setError('Default rate must be a number with up to 2 decimals.');
    try {
      await api.updateSettings({ ...v, defaultRatePerKg: v.defaultRatePerKg === '' ? '' : Number(v.defaultRatePerKg) } as Partial<Settings>);
      toast.success('Settings saved');
    } catch (e) {
      setError((e as ApiRequestError).message);
    }
  };

  if (!loaded) return <Skeleton className="h-80 w-full" />;
  const ro = !isOwner;
  return (
    <form onSubmit={handleSubmit(save)} className="space-y-4" noValidate>
      {ro && <Alert tone="info">Only the owner can change business settings.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Section title="Business details" description="Shown on statements, receipts and reports.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Business name" disabled={ro} {...register('businessName')} />
          <TextField label="Phone" disabled={ro} {...register('businessPhone')} />
          <TextField label="Email" type="email" disabled={ro} {...register('businessEmail')} />
          <TextField label="GSTIN (optional)" disabled={ro} {...register('gstin')} />
          <TextField wrapClassName="sm:col-span-2" label="Address" disabled={ro} {...register('businessAddress')} />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-line bg-slate-50">
            {logo ? <img src={logo} alt="Business logo" className="max-h-full max-w-full" /> : <ImagePlus className="h-6 w-6 text-ink-muted" />}
          </div>
          {!ro && (
            <div className="flex gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50">
                <ImagePlus className="h-4 w-4" /> {logo ? 'Change logo' : 'Upload logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try { setValue('logoDataUrl', await logoToDataUrl(f), { shouldDirty: true }); } catch (err) { toast.error((err as Error).message); }
                  e.target.value = '';
                }} />
              </label>
              {logo && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setValue('logoDataUrl', '', { shouldDirty: true })}>Remove</Button>}
            </div>
          )}
        </div>
      </Section>
      <Section title="Billing defaults">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Default rate per kg (optional)" prefix="₹" inputMode="decimal" disabled={ro} {...register('defaultRatePerKg')} hint="Pre-filled on new bills; can be changed per bill." />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Currency" value="INR (₹)" disabled readOnly />
            <TextField label="Timezone" value="Asia/Kolkata" disabled readOnly />
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-2.5"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" disabled={ro} {...register('allowZeroRate')} /> <span><b>Allow zero-rate bills</b><br /><span className="text-ink-muted">For free samples or replacements. When off, a bill must have a rate above ₹0.</span></span></label>
          <label className="flex items-start gap-2.5"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" disabled={ro} {...register('allowAdvancePayments')} /> <span><b>Allow advance payments</b><br /><span className="text-ink-muted">When on, a payment larger than the outstanding balance can be saved after confirmation and is held as a credit. When off, such payments are rejected.</span></span></label>
        </div>
      </Section>
      <Section title="Report branding">
        <div className="grid gap-4">
          <TextField label="Footer line" disabled={ro} {...register('reportFooter')} />
          <TextAreaField label="Note printed on customer statements (optional)" disabled={ro} {...register('statementNote')} placeholder="e.g. Bank: XYZ · A/c 1234 · IFSC ABCD0001 · UPI shop@upi" />
        </div>
      </Section>
      {!ro && <div className="flex justify-end"><Button type="submit" loading={formState.isSubmitting} className="max-md:w-full">Save settings</Button></div>}
      <div className="md:hidden"><SignOutButton /></div>
    </form>
  );
}

function ConnectionStatus() {
  const { isOwner } = useAuth();
  const health = useApiQuery(() => api.healthCheck(), []);
  const sys = useApiQuery(() => api.getSystemStatus(), [], { enabled: isOwner });
  const ok = health.data?.spreadsheetReachable && health.data.setupComplete;
  return (
    <Section title="Backend & Google Sheets connection">
      {health.loading ? <Skeleton className="h-20 w-full" /> : health.error ? <ErrorState message={health.error} onRetry={health.reload} /> : (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" />}
            {ok ? 'Connected — data is saved to Google Sheets' : health.data?.problem ?? 'Setup incomplete — run setup() in Apps Script'}
          </p>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <div><dt className="text-ink-muted">API endpoint</dt><dd className="break-all font-mono text-xs">{API_URL.replace(/\/s\/([^/]{6})[^/]+([^/]{4})\//, '/s/$1…$2/')}</dd></div>
            <div><dt className="text-ink-muted">Backend version</dt><dd>{health.data?.version}</dd></div>
            <div><dt className="text-ink-muted">Server business date</dt><dd>{health.data?.businessDate} ({health.data?.timezone})</dd></div>
            {sys.data && <>
              <div><dt className="text-ink-muted">Spreadsheet</dt><dd>{sys.data.spreadsheetName} <span className="text-ink-muted">(ID {sys.data.spreadsheetIdMasked})</span></dd></div>
              <div><dt className="text-ink-muted">Customers · tabs</dt><dd>{sys.data.customerCount} · {sys.data.sheetCount}</dd></div>
              <div><dt className="text-ink-muted">Fast bulk reads (Sheets API)</dt><dd>{sys.data.advancedSheetsService ? 'Enabled' : 'Not enabled (slower with many customers)'}</dd></div>
            </>}
          </dl>
          {sys.data && <a href={sys.data.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open spreadsheet <ExternalLink className="h-3.5 w-3.5" /></a>}
          <p className="text-xs text-ink-muted">The spreadsheet ID is configured on the server (Apps Script → Project Settings → Script properties → <code>SPREADSHEET_ID</code>), never in this website, so it cannot be changed or read from the browser. See README §B–C.</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => { health.reload(); sys.reload(); }}>Check again</Button>
        </div>
      )}
    </Section>
  );
}

function UsersPanel() {
  const toast = useToast();
  const { user } = useAuth();
  const q = useApiQuery(() => api.listUsers(), []);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'STAFF' as 'OWNER' | 'STAFF' });
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api.createUser(form);
      toast.success(`User ${form.username} created`);
      setCreating(false);
      setForm({ username: '', displayName: '', password: '', role: 'STAFF' });
      q.reload();
    } catch (e) { toast.error((e as ApiRequestError).message); } finally { setBusy(false); }
  };
  const update = async (p: Parameters<typeof api.updateUser>[0], msg: string) => {
    setBusy(true);
    try { await api.updateUser(p); toast.success(msg); q.reload(); setResetFor(null); setPw(''); } catch (e) { toast.error((e as ApiRequestError).message); } finally { setBusy(false); }
  };

  return (
    <Section title="Users & access" description="Owners can do everything. Staff can add customers, bills and payments, and correct their own entries on the same day; they cannot void, adjust, archive, change settings or manage users.">
      {q.error && <ErrorState message={q.error} onRetry={q.reload} />}
      {q.loading && <Skeleton className="h-24 w-full" />}
      {q.data && (
        <ul className="divide-y divide-line">
          {q.data.map((u) => (
            <li key={u.username} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-medium">{u.displayName} <span className="text-sm font-normal text-ink-muted">@{u.username}</span></p>
                <p className="text-xs text-ink-muted">Password changed {formatDateTime(u.passwordChangedAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={u.role === 'OWNER' ? 'teal' : 'slate'}>{u.role === 'OWNER' ? 'Owner' : 'Staff'}</Badge>
                {!u.active && <Badge tone="red">Disabled</Badge>}
                <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" />} onClick={() => setResetFor(u)}>Reset password</Button>
                {u.username !== user?.username && (
                  <Button size="sm" variant="ghost" loading={busy} onClick={() => update({ username: u.username, active: !u.active }, u.active ? 'User disabled and signed out' : 'User enabled')}>{u.active ? 'Disable' : 'Enable'}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-3" size="sm" variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Add user</Button>
      <Modal open={creating} onClose={() => setCreating(false)} title="Add user" locked={busy}
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={busy} onClick={create} disabled={form.username.length < 3 || form.password.length < 8}>Create user</Button></>}>
        <div className="space-y-4">
          <TextField label="Username" hint="Lowercase letters, numbers, . _ -" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().trim() })} autoCapitalize="none" />
          <TextField label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <TextField label="Temporary password" type="password" hint="At least 8 characters. Share it privately; they can change it after signing in." value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'OWNER' | 'STAFF' })}>
            <option value="STAFF">Staff</option><option value="OWNER">Owner</option>
          </SelectField>
        </div>
      </Modal>
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset password · ${resetFor?.username}`} size="sm" locked={busy}
        footer={<><Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button><Button loading={busy} disabled={pw.length < 8} onClick={() => resetFor && update({ username: resetFor.username, newPassword: pw }, 'Password reset; the user is signed out everywhere')}>Reset</Button></>}>
        <TextField label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" hint="At least 8 characters." />
      </Modal>
    </Section>
  );
}

function ChangePassword() {
  const toast = useToast();
  const { logout } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = again.length > 0 && next !== again;
  return (
    <Section title="Change my password">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Current password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <TextField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="At least 8 characters" />
        <TextField label="Repeat new password" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" error={mismatch ? 'Passwords do not match' : undefined} />
      </div>
      <Button className="mt-3" size="sm" loading={busy} disabled={!cur || next.length < 8 || next !== again} onClick={async () => {
        setBusy(true);
        try { await api.changePassword(cur, next); toast.success('Password changed. Please sign in again.'); await logout(); } catch (e) { toast.error((e as ApiRequestError).message); } finally { setBusy(false); }
      }}>Change password</Button>
    </Section>
  );
}

function AuditLog() {
  const q = useApiQuery(() => api.getAuditLog(50), []);
  return (
    <Section title="Recent activity (audit log)" description="Every change is also written to the AuditLog sheet. Passwords and tokens are never logged.">
      {q.error && <ErrorState message={q.error} onRetry={q.reload} />}
      {q.loading && <Skeleton className="h-32 w-full" />}
      {q.data && (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">User</th><th className="py-2 pr-3 font-medium">Action</th><th className="py-2 font-medium">Details</th></tr></thead>
            <tbody>{q.data.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 align-top last:border-0">
                <td className="whitespace-nowrap py-2 pr-3 text-ink-muted">{formatDateTime(r.timestamp)}</td><td className="py-2 pr-3">{r.user}</td>
                <td className="py-2 pr-3"><code className="text-xs">{r.action}</code></td><td className="py-2 text-ink-muted">{r.customerId && <span className="mr-1 font-mono text-xs">{r.customerId}</span>}{r.summary}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function SignOutButton() {
  const { logout } = useAuth();
  return <Button variant="secondary" block className="text-danger" onClick={logout}>Sign out</Button>;
}

export default function SettingsPage() {
  const { isOwner, user } = useAuth();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={<span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Signed in as {user?.displayName} ({isOwner ? 'Owner' : 'Staff'})</span>} />
      <Section title="App on this phone" description="Install it once and open it from your home screen, full-screen, like any other app.">
        <InstallPrompt variant="settings" />
      </Section>
      <BusinessSettings />
      <ConnectionStatus />
      {isOwner && <UsersPanel />}
      <ChangePassword />
      {isOwner && <AuditLog />}
    </div>
  );
}
