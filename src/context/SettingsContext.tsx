import { createContext, useContext, type ReactNode } from 'react';
import type { Settings } from '@/types/api';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';

const FALLBACK: Settings = {
  businessName: 'Poultry Business Manager', businessPhone: '', businessEmail: '', businessAddress: '', gstin: '',
  defaultRatePerKg: '', allowZeroRate: false, allowAdvancePayments: false, reportFooter: '', statementNote: '',
  logoDataUrl: '', currency: 'INR', timezone: 'Asia/Kolkata',
};

interface SettingsState { settings: Settings; loaded: boolean; reload: () => void }
const Ctx = createContext<SettingsState>({ settings: FALLBACK, loaded: false, reload: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const q = useApiQuery(() => api.getSettings(), []);
  return <Ctx.Provider value={{ settings: q.data ?? FALLBACK, loaded: !!q.data, reload: q.reload }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
