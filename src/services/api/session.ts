import type { SessionUser } from '@/types/api';

/**
 * Session storage. Only the short-lived session token (max 6 h, issued by the
 * server) is kept in the browser — never a password or spreadsheet secret.
 */
const KEY = 'pbm.session.v1';

export interface StoredSession {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

let memory: StoredSession | null = null;

export function loadSession(): StoredSession | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s.token || !s.expiresAt || s.expiresAt < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    memory = s;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession) {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: keep in memory only */
  }
}

export function clearSession() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getSessionToken(): string | null {
  return loadSession()?.token ?? null;
}
