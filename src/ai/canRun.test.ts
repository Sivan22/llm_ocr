import { describe, it, expect } from 'vitest';
import { canRun, runBlocker } from './canRun';
import type { ServerStatus } from '../lib/api';
import type { Route, Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../store/settings';

function settingsFor(route: Route, keys: Partial<Settings['apiKeys']> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    route,
    apiKeys: { anthropic: '', google: '', openai: '', gateway: '', ...keys },
  };
}

const OFFLINE: ServerStatus = { available: false, reachable: false, claudeCli: false, routes: [] };
function online(routes: Route[], claudeCli = false): ServerStatus {
  return { available: true, reachable: true, claudeCli, routes };
}

describe('runBlocker — browser-direct (no server)', () => {
  it('allows a route whose key is pasted', () => {
    expect(runBlocker(settingsFor('gateway', { gateway: 'sk-test' }), OFFLINE)).toBeNull();
    expect(runBlocker(settingsFor('anthropic', { anthropic: 'sk-test' }), OFFLINE)).toBeNull();
  });

  it('blocks a route whose key is missing', () => {
    expect(runBlocker(settingsFor('gateway'), OFFLINE)).toBe('apiKeyMissing');
  });

  it('treats whitespace as no key at all', () => {
    expect(runBlocker(settingsFor('gateway', { gateway: '   ' }), OFFLINE)).toBe('apiKeyMissing');
  });

  it('blocks claude-cli, which has no in-browser implementation at any key', () => {
    // Regression: hasApiKey() used to hard-return true for claude-cli, so Run
    // stayed enabled with the server down and the run died at createModel.
    expect(runBlocker(settingsFor('claude-cli'), OFFLINE)).toBe('serverRequired');
  });
});

describe('runBlocker — server mode', () => {
  it('allows a served route even though no key is pasted in the browser', () => {
    // Regression (CRITICAL 1): the server holds AI_GATEWAY_API_KEY and Settings
    // deliberately hides the key field, so gating on a pasted key left Run dead
    // with no way to enable it.
    expect(runBlocker(settingsFor('gateway'), online(['gateway']))).toBeNull();
  });

  it('blocks a route the server cannot serve', () => {
    expect(runBlocker(settingsFor('anthropic'), online(['gateway']))).toBe('routeNotOnServer');
  });

  it('blocks every route when the server serves none', () => {
    expect(runBlocker(settingsFor('gateway'), online([]))).toBe('routeNotOnServer');
  });

  it('allows claude-cli when the server reports the CLI', () => {
    expect(runBlocker(settingsFor('claude-cli'), online([], true))).toBeNull();
  });

  it('blocks claude-cli when the server has no CLI', () => {
    expect(runBlocker(settingsFor('claude-cli'), online(['gateway'], false))).toBe('routeNotOnServer');
  });

  it('ignores a stale pasted key for a route the server does not serve', () => {
    expect(runBlocker(settingsFor('openai', { openai: 'sk-stale' }), online(['gateway'])))
      .toBe('routeNotOnServer');
  });
});

describe('canRun', () => {
  it('is the boolean view of runBlocker', () => {
    expect(canRun(settingsFor('gateway', { gateway: 'sk-test' }), OFFLINE)).toBe(true);
    expect(canRun(settingsFor('gateway'), OFFLINE)).toBe(false);
    expect(canRun(settingsFor('gateway'), online(['gateway']))).toBe(true);
    expect(canRun(settingsFor('claude-cli'), online([], true))).toBe(true);
  });
});
