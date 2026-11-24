'use client';
import { useState, useTransition } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { errorKey, type ActionResult } from '@/lib/errors';

type Fail = Extract<ActionResult<never>, { ok: false }>;

/** Runs a server action with a pending flag and a translated error message. */
export function useSubmit() {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk: (data: T) => void, onFail?: (r: Fail) => boolean | void) =>
    start(async () => {
      setErr(null);
      let r: ActionResult<T>;
      try { r = await fn(); } catch { r = { ok: false, code: 'NETWORK', detail: '' }; }
      if (!r.ok) {
        if (onFail?.(r) === true) return;
        setErr(t(errorKey(r.code), { detail: r.detail }));
        return;
      }
      onOk(r.data);
    });
  return { pending, err, setErr, run };
}

export function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="rounded-2xl bg-[#FCE7E3] px-4 py-3 text-sm text-bad" role="alert">{msg}</p>;
}
