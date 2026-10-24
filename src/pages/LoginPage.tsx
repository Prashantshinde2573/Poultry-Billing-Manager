import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BarChart3, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { loginSchema } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError } from '@/services/api/client';
import type { HealthStatus } from '@/types/api';
import { TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

type Values = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, login, expired } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    api.healthCheck().then(setHealth).catch((e: ApiRequestError) => setHealthError(e.message));
  }, []);

  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await login(v.username, v.password);
      nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (e) {
      setError((e as ApiRequestError).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white"><BarChart3 className="h-6 w-6" /></div>
          <h1 className="text-xl font-bold">Poultry Business Manager</h1>
          <p className="text-sm text-ink-muted">Simple Billing. Clear Accounts. Better Business.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5" noValidate>
          {expired && <Alert tone="info">Your session ended. Please sign in again.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          <TextField label="Username" autoComplete="username" autoCapitalize="none" {...register('username')} error={formState.errors.username?.message} />
          <TextField label="Password" type="password" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
          <Button type="submit" block size="lg" loading={formState.isSubmitting}>Sign in</Button>
        </form>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-muted" aria-live="polite">
          {!health && !healthError && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking connection…</>}
          {health && health.spreadsheetReachable && health.setupComplete && <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Connected to Google Sheets</>}
          {health && (!health.spreadsheetReachable || !health.setupComplete) && (
            <span className="flex items-start gap-1.5 text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{health.spreadsheetReachable ? 'Backend reachable, but setup() has not been run yet.' : health.problem ?? 'Spreadsheet not reachable.'}</span>
          )}
          {healthError && <span className="flex items-start gap-1.5 text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{healthError}</span>}
        </div>
      </div>
    </div>
  );
}
