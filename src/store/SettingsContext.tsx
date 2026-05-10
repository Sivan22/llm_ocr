import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  updatePrompts: (patch: Partial<Settings['prompts']>) => void;
  updateApiKeys: (patch: Partial<Settings['apiKeys']>) => void;
  reset: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const ctx: Ctx = useMemo(() => ({
    settings,
    update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    updatePrompts: (patch) => setSettings((s) => ({ ...s, prompts: { ...s.prompts, ...patch } })),
    updateApiKeys: (patch) => setSettings((s) => ({ ...s, apiKeys: { ...s.apiKeys, ...patch } })),
    reset: () => setSettings({ ...DEFAULT_SETTINGS }),
  }), [settings]);

  return <SettingsCtx.Provider value={ctx}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
