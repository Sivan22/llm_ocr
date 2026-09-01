import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BatchRunnerProvider, useBatchRunner } from './useBatchRunner';
import { ApiRequestError } from '../lib/api';

// This repo's toolchain has no @testing-library/react (see src/components/SettingsPanel.test.tsx
// for the established renderToString-based pattern). That pattern doesn't run effects and can't
// invoke an imperative method returned from a hook, and this test needs both — it calls
// `runSelected()` and observes side effects on mocked collaborators — so it mounts with
// react-dom/client's createRoot + React's own `act` instead.
//
// Note: vi.hoisted() runs eagerly at hoist time, before this file's own top-level imports
// evaluate — so its closures must not reference imported bindings (e.g. DEFAULT_SETTINGS).
// The settings fixture below is therefore a plain literal, not derived from an import.

const project = vi.hoisted(() => ({
  setPageStatus: vi.fn(),
  setPage: vi.fn(),
}));
vi.mock('../store/ProjectContext', () => ({
  useProject: () => ({
    loadedDoc: { kind: 'test-doc' },
    fileHash: 'hash1',
    pages: [],
    pageOrder: [0, 1],
    setPageStatus: project.setPageStatus,
    setPage: project.setPage,
    selectedPages: new Set([0, 1]),
  }),
}));

vi.mock('../store/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      version: 1,
      route: 'gateway',
      model: 'gemini-3.1-pro',
      apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
      batchSize: 8,
      prompts: { ocr: 'ocr prompt', general: '', headers: '', punctuation: '', custom: '' },
    },
  }),
}));

vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key, lang: 'en' }),
}));

const serverStatus = vi.hoisted(() => ({
  current: { available: false, claudeCli: false, routes: [] as string[] },
}));
vi.mock('../store/ServerStatusContext', () => ({
  useServerStatus: () => ({ status: serverStatus.current }),
}));

const createModelMock = vi.hoisted(() => vi.fn());
vi.mock('../ai/providers', () => ({ createModel: createModelMock }));

const runOcrPageMock = vi.hoisted(() => vi.fn(async (): Promise<{ text: string }> => ({ text: 'ok' })));
vi.mock('../ai/dispatch', () => ({
  effectiveConcurrency: (n: number) => n,
  runOcrPage: runOcrPageMock,
}));

vi.mock('../pdf/render', () => ({
  renderPageToPng: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,aGk=' })),
}));

const savePageResultMock = vi.hoisted(() => vi.fn());
vi.mock('../store/persistence', () => ({ savePageResult: savePageResultMock }));

vi.mock('../store/pageImagesStore', () => ({ savePageImage: vi.fn() }));

vi.mock('../store/runLogStore', () => ({
  loadRunLog: vi.fn(async () => [] as string[]),
  saveRunLog: vi.fn(),
}));

type WorkFn = (item: number, signal?: AbortSignal) => Promise<{ ok: boolean; error?: string }>;
const runBatchMock = vi.hoisted(() => vi.fn(async (_opts: { work: WorkFn }) => {}));
vi.mock('../runner/orchestrator', () => ({ runBatch: runBatchMock }));

type Api = ReturnType<typeof useBatchRunner>;

function Capture({ onReady }: { onReady: (api: Api) => void }) {
  onReady(useBatchRunner());
  return null;
}

async function mount(): Promise<{ getApi: () => Api; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let latest: Api | null = null;
  await act(async () => {
    root.render(
      <BatchRunnerProvider>
        <Capture onReady={(a) => { latest = a; }} />
      </BatchRunnerProvider>,
    );
  });
  return {
    getApi: () => {
      if (!latest) throw new Error('api not ready');
      return latest;
    },
    unmount: () => { root.unmount(); container.remove(); },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  serverStatus.current = { available: false, claudeCli: false, routes: [] };
});

describe('BatchRunnerProvider start() — structural-error preflight', () => {
  it('fails fast without flipping pages to running or persisting, when the server is unavailable and createModel throws', async () => {
    serverStatus.current = { available: false, claudeCli: false, routes: [] };
    createModelMock.mockImplementation(() => {
      throw new Error('Gateway API key is required.');
    });

    const { getApi, unmount } = await mount();
    await act(async () => {
      await getApi().runSelected();
    });

    expect(createModelMock).toHaveBeenCalledTimes(1);
    expect(runBatchMock).not.toHaveBeenCalled();
    expect(project.setPageStatus).not.toHaveBeenCalled();
    expect(savePageResultMock).not.toHaveBeenCalled();
    expect(getApi().log.some((line) => line.includes('batch.errorPrefix'))).toBe(true);

    unmount();
  });

  it('does not run the preflight in server mode, even though createModel would throw', async () => {
    serverStatus.current = { available: true, claudeCli: false, routes: ['gateway'] };
    createModelMock.mockImplementation(() => {
      throw new Error('The Claude CLI route runs on the server. Set VITE_API_URL to use it.');
    });

    const { getApi, unmount } = await mount();
    await act(async () => {
      await getApi().runSelected();
    });

    expect(createModelMock).not.toHaveBeenCalled();
    expect(runBatchMock).toHaveBeenCalledTimes(1);
    expect(project.setPageStatus).toHaveBeenCalledWith(0, 'running');
    expect(project.setPageStatus).toHaveBeenCalledWith(1, 'running');

    unmount();
  });
});

describe('BatchRunnerProvider work() — which server failures are worth retrying', () => {
  async function capturedWork(): Promise<{ work: WorkFn; unmount: () => void }> {
    serverStatus.current = { available: true, claudeCli: false, routes: ['gateway'] };
    const { getApi, unmount } = await mount();
    await act(async () => { await getApi().runSelected(); });
    return { work: runBatchMock.mock.calls[0][0].work, unmount };
  }

  it('turns a structural 400 into a terminal {ok:false} instead of feeding the retry loop', async () => {
    // Server mode has no preflight, so before this a 400 ("AI_GATEWAY_API_KEY
    // is not set on the server.") was retried 3x with 5s/10s backoff per page:
    // 50 pages x ~15s of dead waiting and 150 pointless requests.
    const { work, unmount } = await capturedWork();
    runOcrPageMock.mockRejectedValueOnce(
      new ApiRequestError('AI_GATEWAY_API_KEY is not set on the server.', 400),
    );
    await expect(work(0, undefined)).resolves.toEqual({
      ok: false,
      error: 'AI_GATEWAY_API_KEY is not set on the server.',
    });
    unmount();
  });

  it('keeps throwing a 502 so runBatch still retries an upstream hiccup', async () => {
    const { work, unmount } = await capturedWork();
    runOcrPageMock.mockRejectedValueOnce(new ApiRequestError('upstream exploded', 502));
    await expect(work(0, undefined)).rejects.toThrow(/upstream exploded/);
    unmount();
  });

  it('keeps throwing a network error so runBatch still retries it', async () => {
    const { work, unmount } = await capturedWork();
    runOcrPageMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(work(0, undefined)).rejects.toThrow(/Failed to fetch/);
    unmount();
  });
});
