/** Per-device UI preferences (remembered filters). Never business data. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('pbm.pref.' + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem('pbm.pref.' + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
