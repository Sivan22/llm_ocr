import type { ServerStatus } from '../lib/api';
import type { Settings } from '../lib/types';
import { hasApiKey } from './providers';

/**
 * Why the Run button is disabled, or `null` when a run is possible.
 * Each value maps to one i18n key in `useCanRun`.
 */
export type RunBlocker =
  /** Browser-direct and no key pasted for the selected route. */
  | 'apiKeyMissing'
  /** Server mode, but this server cannot serve the selected route. */
  | 'routeNotOnServer'
  /** Browser-direct with `claude-cli` selected — that route only exists server-side. */
  | 'serverRequired';

/**
 * The single server-aware run gate. Every consumer (RunToolbar, FixPanel,
 * EditorView's per-page button, CollapsibleSettings) must ask this rather than
 * `hasApiKey`, which knows nothing about the server:
 *
 *  - In server mode the keys live on the server and Settings deliberately hides
 *    the key field, so gating on a pasted key disables Run with no way out.
 *  - Browser-direct, `claude-cli` is unrunnable (no key can enable a subprocess
 *    route that has no browser implementation), so it must gate closed.
 */
export function runBlocker(settings: Settings, status: ServerStatus): RunBlocker | null {
  if (status.available) {
    if (settings.route === 'claude-cli') {
      return status.claudeCli ? null : 'routeNotOnServer';
    }
    return status.routes.includes(settings.route) ? null : 'routeNotOnServer';
  }
  if (settings.route === 'claude-cli') return 'serverRequired';
  return hasApiKey(settings) ? null : 'apiKeyMissing';
}

export function canRun(settings: Settings, status: ServerStatus): boolean {
  return runBlocker(settings, status) === null;
}
