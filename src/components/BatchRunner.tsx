import { useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import { runBatch } from '../runner/orchestrator';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function BatchRunner() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const { loadedDoc, fileHash, pages, setPageStatus, setPage, selectedPages, clearSelection } = useProject();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const eligible = pages.filter((p) => p.status !== 'ok').map((p) => p.pageNum);
  const failed = pages.filter((p) => p.status === 'error').map((p) => p.pageNum);
  const totalPages = loadedDoc?.pageCount ?? 0;

  const append = (m: string) => setLog((l) => [...l, m]);

  const start = async (pageNums: number[]) => {
    if (!loadedDoc || pageNums.length === 0) return;
    let model;
    try {
      model = createModel(settings);
    } catch (e) {
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

  const runRange = () => {
    const fromN = Math.max(1, Number(rangeFrom || 1));
    const toN = Math.min(totalPages, Number(rangeTo || totalPages));
    if (!Number.isFinite(fromN) || !Number.isFinite(toN) || toN < fromN) {
      append(t('batch.errorRange', { from: rangeFrom, to: rangeTo }));
      return;
    }
    const pageNums: number[] = [];
    for (let i = fromN - 1; i <= toN - 1; i++) pageNums.push(i);
    start(pageNums);
  };

  const runSelected = () => {
    if (selectedPages.size === 0) return;
    start([...selectedPages].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={() => start(eligible)} disabled={running || eligible.length === 0}>
          {t('batch.startAll', { n: eligible.length })}
        </Button>
        <Button variant="outline" onClick={() => abortRef.current?.abort()} disabled={!running}>
          {t('batch.stop')}
        </Button>
        <Button variant="outline" onClick={() => start(failed)} disabled={running || failed.length === 0}>
          {t('batch.retryFailed', { n: failed.length })}
        </Button>
      </div>

      {totalPages > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-gray-600">{t('batch.runPages')}</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            placeholder="1"
            className="w-20"
          />
          <span className="text-gray-600">{t('batch.to')}</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            placeholder={String(totalPages)}
            className="w-20"
          />
          <Button variant="outline" onClick={runRange} disabled={running}>
            {t('batch.runRange')}
          </Button>
        </div>
      )}

      {selectedPages.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-gray-600">{t('batch.selected', { n: selectedPages.size })}</span>
          <Button onClick={runSelected} disabled={running}>
            {t('batch.runSelected')}
          </Button>
          <Button variant="outline" onClick={clearSelection} disabled={running}>
            {t('batch.clearSelection')}
          </Button>
        </div>
      )}

      <button className="text-xs text-blue-600 underline" onClick={() => setShowLog((s) => !s)}>
        {showLog ? t('batch.hideLog', { n: log.length }) : t('batch.showLog', { n: log.length })}
      </button>
      {showLog && (
        <pre className="bg-gray-50 border text-xs p-2 max-h-48 overflow-auto whitespace-pre-wrap">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
