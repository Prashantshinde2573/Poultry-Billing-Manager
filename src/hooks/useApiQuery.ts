import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { onDataChanged } from '@/services/api/events';
import { ApiRequestError } from '@/services/api/client';

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  loading: boolean;
  /** true while refreshing data that is already displayed */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Loads data from the API, re-runs when deps change and automatically
 * refreshes after any successful write anywhere in the app. Stale responses
 * from superseded requests are ignored.
 */
export function useApiQuery<T>(fn: () => Promise<T>, deps: DependencyList, opts: { enabled?: boolean } = {}): QueryState<T> {
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    fnRef.current()
      .then((d) => {
        if (my !== seq.current) return;
        setData(d);
        setError(null);
        setErrorCode(null);
      })
      .catch((e: unknown) => {
        if (my !== seq.current) return;
        const err = e as ApiRequestError;
        if (err.code === 'ABORTED') return;
        setError(err.message || 'Something went wrong.');
        setErrorCode(err.code || 'ERROR');
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  useEffect(() => onDataChanged(() => setTick((t) => t + 1)), []);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, errorCode, loading: loading && data === null, refreshing: loading && data !== null, reload };
}
