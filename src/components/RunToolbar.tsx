// src/components/RunToolbar.tsx
import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { useBatchRunner } from '../hooks/useBatchRunner';
import { parsePageRange } from '../lib/pageRange';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { ThumbMode } from './PageThumb';
import { THUMB_VIEW_STORAGE_KEY } from './PageThumbs';
import { cn } from '../lib/utils';

interface Props {
  mode: ThumbMode;
  onModeChange: (m: ThumbMode) => void;
}

export function RunToolbar({ mode, onModeChange }: Props) {
  const { t } = useI18n();
  const { loadedDoc, selectedPages, clearSelection, setSelectedPages, setSelectionAnchor } = useProject();
  const { running, startAll, retryFailed, runRange, runSelected, stop, eligibleCount, failedCount } = useBatchRunner();
  const [rangeInput, setRangeInput] = useState('');

  const totalPages = loadedDoc?.pageCount ?? 0;
  const { pages: rangePages, error: rangeError } = useMemo(
    () => parsePageRange(rangeInput, totalPages),
    [rangeInput, totalPages],
  );

  useEffect(() => {
    try { localStorage.setItem(THUMB_VIEW_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  if (!loadedDoc) return null;

  const setModePersist = (m: ThumbMode) => onModeChange(m);

  const highlight = () => {
    setSelectedPages(new Set(rangePages));
    if (rangePages.length > 0) setSelectionAnchor(rangePages[0]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startAll} disabled={running || eligibleCount === 0}>
          {t('batch.startAll', { n: eligibleCount })}
        </Button>
        <Button variant="outline" onClick={retryFailed} disabled={running || failedCount === 0}>
          {t('batch.retryFailed', { n: failedCount })}
        </Button>
        <Button variant="outline" onClick={stop} disabled={!running}>
          {t('batch.stop')}
        </Button>

        <span className="ms-2 text-sm text-gray-600">{t('batch.runPages')}</span>
        <Input
          type="text"
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          placeholder={t('batch.range.placeholder')}
          className="w-48"
        />
        <Button
          variant="outline"
          onClick={() => runRange(rangePages)}
          disabled={running || rangeError !== null || rangePages.length === 0}
        >
          {t('batch.runRange')}
        </Button>
        <Button
          variant="outline"
          onClick={highlight}
          disabled={rangeError !== null || rangePages.length === 0}
        >
          {t('batch.highlightInPreview')}
        </Button>

        <div className="ms-auto flex items-center gap-1">
          {(['grid', 'compact', 'list'] as ThumbMode[]).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              aria-pressed={mode === m}
              onClick={() => setModePersist(m)}
              className="px-2 py-1 text-xs"
            >
              {t(`view.${m}`)}
            </Button>
          ))}
        </div>
      </div>

      {rangeError && (
        <p className="text-xs text-red-600">{t('batch.range.invalid')}</p>
      )}

      {selectedPages.size > 0 && (
        <div className={cn('flex items-center gap-2 text-sm rounded px-2 py-1 bg-blue-50 border border-blue-200')}>
          <span className="text-blue-900">{t('batch.selectedBar', { n: selectedPages.size })}</span>
          <Button onClick={runSelected} disabled={running}>{t('batch.runSelected')}</Button>
          <Button variant="outline" onClick={clearSelection} disabled={running}>{t('batch.clearSelection')}</Button>
        </div>
      )}
    </div>
  );
}
