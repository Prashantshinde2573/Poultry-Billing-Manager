import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Lets a page put its own title and action icons into the mobile top app bar
 * (like a native app). Cleared automatically when the page unmounts.
 */
export interface AppBarConfig {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

const Ctx = createContext<{ config: AppBarConfig | null; setConfig: (c: AppBarConfig | null) => void }>({ config: null, setConfig: () => {} });

export function AppBarProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppBarConfig | null>(null);
  return <Ctx.Provider value={{ config, setConfig }}>{children}</Ctx.Provider>;
}

export function useAppBarConfig() {
  return useContext(Ctx).config;
}

export function useAppBar(config: AppBarConfig, deps: unknown[]) {
  const { setConfig } = useContext(Ctx);
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
