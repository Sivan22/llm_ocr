import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { effectiveConcurrency, runOcrPage } from '../ai/dispatch';
import { isNonRetryable } from '../lib/api';
import { useServerStatus } from '../store/ServerStatusContext';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import { loadRunLog, saveRunLog } from '../store/runLogStore';
import { runBatch } from '../runner/orchestrator';

interface BatchRunnerApi {
  running: boolean;
  log: string[];
  runSelected: () => void;
  stop: () => void;
  pendingPages: number[];
  failedPages: number[];
}

const Ctx = createContext<BatchRunnerApi | null>(null);

export function BatchRunnerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const { status: serverStatus } = useServerStatus();
  const { loadedDoc, fileHash, pages, pageOrder, setPageStatus, setPage, selectedPages } = useProject();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks the hash whose log has been hydrated into `log`. Save effect waits
  // for this so it doesn't overwrite stored logs with `[]` between switching
  // hashes and the async load resolving.
  const loadedLogForHash = useRef<string>('');

  useEffect(() => {
    if (!fileHash) {
      loadedLogForHash.current = '';
      setLog([]);
      return;
    }
    loadedLogForHash.current = '';
    let cancelled = false;
    loadRunLog(fileHash).then((arr) => {
      if (cancelled) return;
      setLog(arr);
      loadedLogForHash.current = fileHash;
    });
    return () => { cancelled = true; };
  }, [fileHash]);

  useEffect(() => {
    if (!fileHash) return;
    if (loadedLogForHash.current !== fileHash) return;
    saveRunLog(fileHash, log);
  }, [fileHash, log]);

  const append = (m: string) => setLog((l) => [...l, m]);

  // Pending = anything not yet successfully OCR'd. Failed = errored pages only.
  // Restrict to visible (non-removed) pages so quick-selects don't pull hidden pages back.
  const visible = new Set(pageOrder);
  const pendingPages = pages
    .filter((p) => visible.has(p.pageNum) && (p.status === 'pending' || p.status === 'error'))
    .map((p) => p.pageNum);
  const failedPages = pages
    .filter((p) => visible.has(p.pageNum) && p.status === 'error')
    .map((p) => p.pageNum);

  const start = async (pageNums: number[]) => {
    if (!loadedDoc || pageNums.length === 0 || running) return;
    // Server mode never touches createModel (it throws by design for claude-cli,
    // and browser-direct model construction is irrelevant once the server is up).
    // Browser-direct: fail fast on a structural/config error (bad or missing key,
    // claude-cli selected with no server) before any page flips to 'running' or any
    // persistence write happens — matches today's behavior. Transient failures during
    // the actual call still go through runBatch's retry path below.
    if (!serverStatus.available) {
      try {
        createModel(settings);
      } catch (e) {
        append(t('batch.errorPrefix', { msg: e instanceof Error ? e.message : String(e) }));
        return;
      }
    }
    setRunning(true);
    abortRef.current = new AbortController();
    const processed = new Set<number>();
    for (const n of pageNums) setPageStatus(n, 'running');
    await runBatch({
      items: pageNums,
      concurrency: effectiveConcurrency(settings.batchSize, settings.route, serverStatus.available),
      signal: abortRef.current.signal,
      work: async (n, sig) => {
        const img = await renderPageToPng(loadedDoc, n);
        savePageImage(fileHash, n, img);
        try {
          const r = await runOcrPage({
            settings,
            serverAvailable: serverStatus.available,
            imageDataUrl: img.dataUrl,
            signal: sig,
          });
          return { ok: true as const, value: r };
        } catch (e) {
          // Server mode has no equivalent of the browser-direct preflight above,
          // so a structural 400 ("Model X is not available on route Y",
          // "AI_GATEWAY_API_KEY is not set on the server.") used to be retried
          // 3x with 5s/10s backoff per page — 50 pages of dead waiting and 150
          // pointless requests. Returning {ok:false} makes runBatch treat it as
          // terminal for that page. 5xx and network errors still throw and keep
          // their retries.
          if (isNonRetryable(e)) {
            return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
          }
          throw e;
        }
      },
      onProgress: (e) => {
        processed.add(e.item);
        if (e.ok && e.value) {
          const result = { pageNum: e.item, text: e.value.text, status: 'ok' as const, tokensIn: e.value.tokensIn, tokensOut: e.value.tokensOut };
          setPage(result);
          savePageResult(fileHash, result);
          append(t('batch.pageOk', { n: e.item + 1, chars: e.value.text.length }));
        } else {
          const result = { pageNum: e.item, text: '', status: 'error' as const, error: e.error };
          setPage(result);
          savePageResult(fileHash, result);
          append(t('batch.pageFailed', { n: e.item + 1, err: e.error ?? '' }));
        }
      },
    });
    for (const n of pageNums) {
      if (!processed.has(n)) setPageStatus(n, 'pending');
    }
    setRunning(false);
    abortRef.current = null;
  };

  // Not memoized on purpose: the api closures capture `pendingPages`/`failedPages`,
  // which can have identical lengths but different identities (e.g., one page
  // flips ok → edited while another flips pending → error). A length-keyed
  // memo would skip invalidating and consumers would act on stale items.
  const api: BatchRunnerApi = {
    running,
    log,
    runSelected: () => {
      const pos = new Map(pageOrder.map((n, i) => [n, i]));
      const sorted = [...selectedPages].sort((a, b) => (pos.get(a) ?? a) - (pos.get(b) ?? b));
      return start(sorted);
    },
    stop: () => abortRef.current?.abort(),
    pendingPages,
    failedPages,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBatchRunner(): BatchRunnerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBatchRunner must be used within BatchRunnerProvider');
  return v;
}
