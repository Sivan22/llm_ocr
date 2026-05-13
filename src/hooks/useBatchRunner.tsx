import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import { runBatch } from '../runner/orchestrator';

interface BatchRunnerApi {
  running: boolean;
  log: string[];
  startAll: () => void;
  retryFailed: () => void;
  runRange: (pageNums: number[]) => void;
  runSelected: () => void;
  stop: () => void;
  eligibleCount: number;
  failedCount: number;
}

const Ctx = createContext<BatchRunnerApi | null>(null);

export function BatchRunnerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const { loadedDoc, fileHash, pages, setPageStatus, setPage, selectedPages } = useProject();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const append = (m: string) => setLog((l) => [...l, m]);

  // `Start all` skips pages that are `ok` or `edited` so user edits aren't overwritten.
  const eligible = pages.filter((p) => p.status === 'pending' || p.status === 'error').map((p) => p.pageNum);
  const failed = pages.filter((p) => p.status === 'error').map((p) => p.pageNum);

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

  // Not memoized on purpose: the api closures capture `eligible`/`failed`,
  // which can have identical lengths but different identities (e.g., one page
  // flips ok → edited while another flips pending → error). A length-keyed
  // memo would skip invalidating and the button would fire on stale items.
  const api: BatchRunnerApi = {
    running,
    log,
    startAll: () => start(eligible),
    retryFailed: () => start(failed),
    runRange: (pageNums) => start(pageNums),
    runSelected: () => start([...selectedPages].sort((a, b) => a - b)),
    stop: () => abortRef.current?.abort(),
    eligibleCount: eligible.length,
    failedCount: failed.length,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBatchRunner(): BatchRunnerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBatchRunner must be used within BatchRunnerProvider');
  return v;
}
