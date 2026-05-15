import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
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
    let model;
    try { model = createModel(settings); }
    catch (e) {
      append(t('batch.errorPrefix', { msg: e instanceof Error ? e.message : String(e) }));
      return;
    }
    setRunning(true);
    abortRef.current = new AbortController();
    const processed = new Set<number>();
    for (const n of pageNums) setPageStatus(n, 'running');
    await runBatch({
      items: pageNums,
      concurrency: settings.batchSize,
      signal: abortRef.current.signal,
      work: async (n, sig) => {
        const img = await renderPageToPng(loadedDoc, n);
        savePageImage(fileHash, n, img);
        const r = await ocrPage(model, img.dataUrl, settings.prompts.ocr, sig);
        return { ok: true as const, value: r };
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
