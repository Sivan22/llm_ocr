import { runBlocker, type RunBlocker } from '../ai/canRun';
import { useI18n } from '../i18n/I18nContext';
import { useSettings } from '../store/SettingsContext';
import { useServerStatus } from '../store/ServerStatusContext';

const MESSAGE_KEY: Record<RunBlocker, string> = {
  apiKeyMissing: 'batch.apiKeyMissing',
  routeNotOnServer: 'batch.routeNotOnServer',
  serverRequired: 'batch.serverRequired',
};

export interface CanRunState {
  canRun: boolean;
  /** Translated explanation for the disabled state, or null when a run is possible. */
  blockedMessage: string | null;
}

/**
 * Thin hook wrapper over `runBlocker` so components share one gate and one set
 * of messages. The pure function is the unit-tested part; this only wires in the
 * settings/server-status/i18n contexts.
 */
export function useCanRun(): CanRunState {
  const { settings } = useSettings();
  const { status } = useServerStatus();
  const { t } = useI18n();

  const blocker = runBlocker(settings, status);
  return {
    canRun: blocker === null,
    blockedMessage:
      blocker === null
        ? null
        : t(MESSAGE_KEY[blocker], { provider: t(`route.${settings.route}`) }),
  };
}
