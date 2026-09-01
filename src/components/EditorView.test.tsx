import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from './EditorView';

// No @testing-library/react in this repo (see SettingsPanel.test.tsx for the
// renderToString pattern). This case needs a real click to fire an async handler
// and needs the resulting state to land, so it mounts with react-dom/client's
// createRoot + React's own `act`, following src/hooks/useBatchRunner.test.tsx.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings = vi.hoisted(() => ({
  current: {
    version: 1,
    route: 'gateway',
    model: 'gemini-3.1-pro',
    apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
    batchSize: 8,
    prompts: { ocr: 'ocr prompt', general: '', headers: '', punctuation: '', custom: '' },
  },
}));

const project = vi.hoisted(() => ({
  setPage: vi.fn(),
  setPageStatus: vi.fn(),
  setCorrections: vi.fn(),
}));

vi.mock('../store/ProjectContext', () => ({
  useProject: () => ({
    loadedDoc: { kind: 'test-doc' },
    fileHash: 'hash1',
    currentPageNum: 0,
    pages: [],
    setPage: project.setPage,
    setPageStatus: project.setPageStatus,
    setCorrections: project.setCorrections,
  }),
}));

vi.mock('../store/SettingsContext', () => ({
  useSettings: () => ({ settings: settings.current, updatePrompts: vi.fn() }),
}));

vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key}:${Object.values(vars).join('|')}` : key,
    lang: 'en',
  }),
}));

const serverStatus = vi.hoisted(() => ({
  current: { available: false, claudeCli: false, routes: [] as string[] },
}));
vi.mock('../store/ServerStatusContext', () => ({
  useServerStatus: () => ({ status: serverStatus.current, probing: false, refresh: vi.fn() }),
}));

const createModelMock = vi.hoisted(() => vi.fn(() => ({ __browserModel: true })));
vi.mock('../ai/providers', () => ({ createModel: createModelMock }));

interface OcrArgs { serverAvailable: boolean; imageDataUrl: string }
const runOcrPageMock = vi.hoisted(() =>
  vi.fn(async (_args: { serverAvailable: boolean; imageDataUrl: string }) => ({
    text: 'שלום', tokensIn: 3, tokensOut: 4,
  })),
);
vi.mock('../ai/dispatch', () => ({ runOcrPage: runOcrPageMock }));

vi.mock('../pdf/render', () => ({
  renderPageToPng: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,aGk=', mediaType: 'image/png' })),
}));

const savePageResultMock = vi.hoisted(() => vi.fn());
vi.mock('../store/persistence', () => ({ savePageResult: savePageResultMock }));
vi.mock('../store/pageImagesStore', () => ({ savePageImage: vi.fn() }));

// The editor's children each pull their own contexts; this file is about the
// per-page OCR call site, so they are stubbed out.
vi.mock('./PageImage', () => ({ PageImage: () => null }));
vi.mock('./InlineDiffEditor', () => ({ InlineDiffEditor: () => null }));
vi.mock('./FixPanel', () => ({ FixPanel: () => null }));

async function mountEditor(): Promise<{ container: HTMLDivElement; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => { root.render(<EditorView />); });
  return { container, unmount: () => { root.unmount(); container.remove(); } };
}

async function clickOcr(container: HTMLElement): Promise<void> {
  const button = [...container.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('editor.ocrPage'));
  if (!button) throw new Error('OCR button not found');
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(() => {
  vi.clearAllMocks();
  serverStatus.current = { available: false, claudeCli: false, routes: [] };
  settings.current = { ...settings.current, route: 'gateway', model: 'gemini-3.1-pro' };
});

describe('EditorView per-page OCR', () => {
  it('runs the claude-cli route through the dispatcher in server mode instead of createModel', async () => {
    // Regression (CRITICAL 2): this call site still built a browser model, so
    // with the server up and route=claude-cli it died on
    // "The Claude CLI route runs on the server. Set VITE_API_URL to use it."
    // while VITE_API_URL was set and the server was up.
    serverStatus.current = { available: true, claudeCli: true, routes: ['gateway'] };
    settings.current = { ...settings.current, route: 'claude-cli', model: 'cli-opus' };

    const { container, unmount } = await mountEditor();
    await clickOcr(container);

    expect(createModelMock).not.toHaveBeenCalled();
    expect(runOcrPageMock).toHaveBeenCalledTimes(1);
    expect(runOcrPageMock.mock.calls[0][0] as OcrArgs).toMatchObject({
      serverAvailable: true,
      imageDataUrl: 'data:image/png;base64,aGk=',
    });
    expect(project.setPage).toHaveBeenCalledWith(
      expect.objectContaining({ pageNum: 0, text: 'שלום', status: 'ok' }),
    );
    expect(container.textContent).not.toMatch(/editor\.ocrError/);

    unmount();
  });

  it('still dispatches through the server for a keyless gateway run', async () => {
    serverStatus.current = { available: true, claudeCli: false, routes: ['gateway'] };

    const { container, unmount } = await mountEditor();
    await clickOcr(container);

    expect(createModelMock).not.toHaveBeenCalled();
    expect(runOcrPageMock.mock.calls[0][0] as OcrArgs).toMatchObject({ serverAvailable: true });

    unmount();
  });

  it('keeps the browser-direct preflight: a structural config error fails fast with one message', async () => {
    serverStatus.current = { available: false, claudeCli: false, routes: [] };
    createModelMock.mockImplementationOnce(() => { throw new Error('Gateway API key is required.'); });

    const { container, unmount } = await mountEditor();
    await clickOcr(container);

    expect(runOcrPageMock).not.toHaveBeenCalled();
    expect(project.setPageStatus).not.toHaveBeenCalled();
    expect(savePageResultMock).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/editor\.ocrError:Gateway API key is required\./);

    unmount();
  });

  it('runs browser-direct through the dispatcher when the preflight passes', async () => {
    serverStatus.current = { available: false, claudeCli: false, routes: [] };

    const { container, unmount } = await mountEditor();
    await clickOcr(container);

    expect(createModelMock).toHaveBeenCalledTimes(1);
    expect(runOcrPageMock.mock.calls[0][0] as OcrArgs).toMatchObject({ serverAvailable: false });

    unmount();
  });
});
