import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser } from '@/types/api';
import { api } from '@/services/api/endpoints';
import { onAuthExpired } from '@/services/api/client';
import { clearSession, loadSession, saveSession } from '@/services/api/session';

interface AuthState {
  user: SessionUser | null;
  isOwner: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  expired: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession()?.user ?? null);
  const [expired, setExpired] = useState(false);

  useEffect(() => onAuthExpired(() => {
    setUser(null);
    setExpired(true);
  }), []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.login(username, password);
    saveSession({ token: r.token, expiresAt: r.expiresAt, user: r.user });
    setExpired(false);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* session may already be gone */
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isOwner: user?.role === 'OWNER', login, logout, expired }), [user, login, logout, expired]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
