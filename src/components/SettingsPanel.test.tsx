import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsPanel } from './SettingsPanel';
import { SettingsProvider, useSettings } from '../store/SettingsContext';
import { I18nProvider, useI18n } from '../i18n/I18nContext';
import type { Lang } from '../i18n/translations';
import type { ServerStatus } from '../lib/api';
import type { Settings } from '../lib/types';

// React's `act` warns unless the environment declares itself act-aware; this
// repo has no @testing-library/react (which normally sets this), so the two
// createRoot-based cases below set it directly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Renders with `renderToString` (react-dom/server) rather than
// @testing-library/react: that package isn't part of this repo's toolchain
// (see src/i18n/dir.test.tsx for the established pattern). Assertions run
// against the rendered HTML string instead of a DOM/testing-library query.
// renderToString does not run effects, which is fine here — none of these
// four cases depends on the fallback effect having fired.
const status = vi.hoisted(() => ({ current: { available: false, reachable: false, claudeCli: false, routes: [] } as ServerStatus }));

vi.mock('../store/ServerStatusContext', () => ({
  useServerStatus: () => ({ status: status.current, probing: false, refresh: vi.fn() }),
}));

// API_BASE is read from import.meta.env at module load and is empty in tests
// (VITE_API_URL unset — the GitHub Pages build). The server-mode notices are
// gated on it, so it has to be non-empty here.
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  API_BASE: 'http://localhost:3102',
}));

const SETTINGS_STORAGE_KEY = 'llm_ocr_web:settings:v1';

function renderPanel(): string {
  return renderToString(
    <I18nProvider><SettingsProvider><SettingsPanel /></SettingsProvider></I18nProvider>,
  );
}

describe('SettingsPanel', () => {
  it('shows the API key field in browser-direct mode', () => {
    status.current = { available: false, reachable: false, claudeCli: false, routes: [] };
    const html = renderPanel();
    expect(html).toMatch(/paste your key/i);
    expect(html).not.toMatch(/held by the server/i);
  });

  it('replaces the key field with a server note in server mode', () => {
    status.current = { available: true, reachable: true, claudeCli: false, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).not.toMatch(/paste your key/i);
    expect(html).toMatch(/held by the server/i);
  });

  it('hides claude-cli unless the server reports it', () => {
    status.current = { available: true, reachable: true, claudeCli: false, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).not.toMatch(/Claude CLI/i);
  });

  it('offers claude-cli when the server reports it', () => {
    status.current = { available: true, reachable: true, claudeCli: true, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).toMatch(/Claude CLI/i);
  });

  it('offers the browser routes and the key field when the server serves nothing', () => {
    // probeServer reports a reachable server with no keys and no CLI as
    // unavailable: it can serve nothing, so a pasted key is the only way to run.
    status.current = { available: false, reachable: true, claudeCli: false, routes: [] };
    const html = renderPanel();
    expect(html).toMatch(/paste your key/i);
    expect(html).toMatch(/has no providers configured/i);
    expect(html).not.toMatch(/not reachable/i);
  });

  it('keeps the retry link reachable while the server is up, because the probe only runs at mount', () => {
    // If the server dies mid-session `status.available` stays stale-true, so a
    // retry link that only appears when we believe it is down never appears.
    status.current = { available: true, reachable: true, claudeCli: false, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).toMatch(/Retry connection/i);
  });
});

// The two cases below need effects to actually fire and settle (persisting a
// self-healed value back into the store, and reacting to a language change
// after a notice is already on screen) — renderToString above can't do
// either. Mount with react-dom/client's createRoot + React's own `act`
// instead, following the precedent in src/hooks/useBatchRunner.test.tsx
// (this repo still has no @testing-library/react).
interface Captured {
  settings: Settings;
  setLang: (l: Lang) => void;
}

function Capture({ onReady }: { onReady: (info: Captured) => void }) {
  const { settings } = useSettings();
  const { setLang } = useI18n();
  onReady({ settings, setLang });
  return null;
}

async function mountLive(): Promise<{
  container: HTMLDivElement;
  getInfo: () => Captured;
  unmount: () => void;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let latest: Captured | null = null;
  await act(async () => {
    root.render(
      <I18nProvider>
        <SettingsProvider>
          <SettingsPanel />
          <Capture onReady={(info) => { latest = info; }} />
        </SettingsProvider>
      </I18nProvider>,
    );
  });
  return {
    container,
    getInfo: () => {
      if (!latest) throw new Error('settings not ready');
      return latest;
    },
    unmount: () => { root.unmount(); container.remove(); },
  };
}

describe('SettingsPanel — live effects', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('persists a healed model to the store when the route is valid but the model is not', async () => {
    status.current = { available: false, reachable: false, claudeCli: false, routes: [] };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      route: 'gateway',
      model: 'cli-opus', // not a valid gateway model
      apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
      batchSize: 8,
      prompts: { ocr: '', general: '', headers: '', punctuation: '', custom: '' },
    }));

    const { getInfo, unmount } = await mountLive();

    // The route itself was fine, so it must be untouched — only the model
    // should have healed, and it must show up in the *store*, not merely
    // in what the <select> renders.
    expect(getInfo().settings.route).toBe('gateway');
    expect(getInfo().settings.model).toBe('claude-fable-5');

    unmount();
  });

  it('heals a persisted route even when the server reports zero usable routes', async () => {
    // The heal effect used to bail on an empty route list, stranding the picker
    // on a route nothing can run — one of the two ways into the 400-retry storm.
    // Server mode is on (VITE_API_URL set) but the server has no keys and no CLI.
    status.current = { available: true, reachable: true, claudeCli: false, routes: [] };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      route: 'claude-cli',
      model: 'cli-opus',
      apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
      batchSize: 8,
      prompts: { ocr: '', general: '', headers: '', punctuation: '', custom: '' },
    }));

    const { getInfo, unmount } = await mountLive();

    expect(getInfo().settings.route).toBe('anthropic');
    expect(getInfo().settings.model).toBe('claude-fable-5');

    unmount();
  });

  it('recomputes the route-unavailable notice from data at render time instead of freezing translated text', async () => {
    status.current = { available: false, reachable: false, claudeCli: false, routes: [] };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      route: 'claude-cli', // not offered in browser-direct mode -> triggers the fallback
      model: 'cli-opus',
      apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
      batchSize: 8,
      prompts: { ocr: '', general: '', headers: '', punctuation: '', custom: '' },
    }));

    const { container, getInfo, unmount } = await mountLive();

    expect(container.textContent).toMatch(/The saved provider is not available/);

    act(() => { getInfo().setLang('he'); });

    expect(container.textContent).toMatch(/הספק השמור אינו זמין/);
    expect(container.textContent).not.toMatch(/The saved provider is not available/);

    unmount();
  });
});
