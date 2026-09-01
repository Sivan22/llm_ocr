import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SettingsPanel } from './SettingsPanel';
import { SettingsProvider } from '../store/SettingsContext';
import { I18nProvider } from '../i18n/I18nContext';
import type { ServerStatus } from '../lib/api';

// Renders with `renderToString` (react-dom/server) rather than
// @testing-library/react: that package isn't part of this repo's toolchain
// (see src/i18n/dir.test.tsx for the established pattern). Assertions run
// against the rendered HTML string instead of a DOM/testing-library query.
// renderToString does not run effects, which is fine here — none of these
// four cases depends on the fallback effect having fired.
const status = vi.hoisted(() => ({ current: { available: false, claudeCli: false, routes: [] } as ServerStatus }));

vi.mock('../store/ServerStatusContext', () => ({
  useServerStatus: () => ({ status: status.current, probing: false, refresh: vi.fn() }),
}));

function renderPanel(): string {
  return renderToString(
    <I18nProvider><SettingsProvider><SettingsPanel /></SettingsProvider></I18nProvider>,
  );
}

describe('SettingsPanel', () => {
  it('shows the API key field in browser-direct mode', () => {
    status.current = { available: false, claudeCli: false, routes: [] };
    const html = renderPanel();
    expect(html).toMatch(/paste your key/i);
    expect(html).not.toMatch(/held by the server/i);
  });

  it('replaces the key field with a server note in server mode', () => {
    status.current = { available: true, claudeCli: false, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).not.toMatch(/paste your key/i);
    expect(html).toMatch(/held by the server/i);
  });

  it('hides claude-cli unless the server reports it', () => {
    status.current = { available: true, claudeCli: false, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).not.toMatch(/Claude CLI/i);
  });

  it('offers claude-cli when the server reports it', () => {
    status.current = { available: true, claudeCli: true, routes: ['gateway'] };
    const html = renderPanel();
    expect(html).toMatch(/Claude CLI/i);
  });
});
