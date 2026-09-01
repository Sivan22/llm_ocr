import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { probeServer, SERVER_OFFLINE, serverModeEnabled, type ServerStatus } from '../lib/api';

interface Ctx {
  status: ServerStatus;
  /** True until the first probe settles, so the UI can avoid flashing "offline". */
  probing: boolean;
  refresh: () => void;
}

const ServerStatusCtx = createContext<Ctx | null>(null);

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServerStatus>(SERVER_OFFLINE);
  const [probing, setProbing] = useState<boolean>(serverModeEnabled());

  const refresh = useCallback(() => {
    if (!serverModeEnabled()) {
      setStatus(SERVER_OFFLINE);
      setProbing(false);
      return;
    }
    setProbing(true);
    probeServer().then((s) => {
      setStatus(s);
      setProbing(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const ctx = useMemo(() => ({ status, probing, refresh }), [status, probing, refresh]);
  return <ServerStatusCtx.Provider value={ctx}>{children}</ServerStatusCtx.Provider>;
}

export function useServerStatus(): Ctx {
  const ctx = useContext(ServerStatusCtx);
  if (!ctx) throw new Error('useServerStatus must be used within ServerStatusProvider');
  return ctx;
}
