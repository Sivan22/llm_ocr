// src/components/RunToolbar.tsx
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Grid3x3, List } from 'lucide-react';
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

const VIEW_ICONS: Record<ThumbMode, typeof LayoutGrid> = {
  grid: LayoutGrid,
  compact: Grid3x3,
  list: List,
};

export function RunToolbar({ mode, onModeChange }: Props) {
  const { t } = useI18n();
  const { loadedDoc, selectedPages, clearSelection, setSelectedPages, setSelectionAnchor } = useProject();
  const { running, runSelected, stop, pendingPages, failedPages } = useBatchRunner();
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

  const canHighlight = rangeError === null && rangePages.length > 0;

  const highlight = () => {
    if (!canHighlight) return;
    setSelectedPages(new Set(rangePages));
    setSelectionAnchor(rangePages[0]);
  };

  const selectPages = (nums: number[]) => {
    if (nums.length === 0) return;
    setSelectedPages(new Set(nums));
    setSelectionAnchor(nums[0]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runSelected} disabled={running || selectedPages.size === 0}>
          {t('batch.run')}
        </Button>
        <Button variant="outline" onClick={stop} disabled={!running}>
          {t('batch.stop')}
        </Button>
        <Button
          variant="outline"
          onClick={() => selectPages(pendingPages)}
          disabled={pendingPages.length === 0}
        >
          {t('batch.selectPending', { n: pendingPages.length })}
        </Button>
        <Button
          variant="outline"
          onClick={() => selectPages(failedPages)}
          disabled={failedPages.length === 0}
        >
          {t('batch.selectFailed', { n: failedPages.length })}
        </Button>

        <span className="ms-2 text-sm text-gray-600">{t('batch.runPages')}</span>
        <div className="relative w-48">
          <Input
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                highlight();
              }
            }}
            onBlur={highlight}
            placeholder={t('batch.range.placeholder')}
            className="w-full pe-8"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={highlight}
            disabled={!canHighlight}
            aria-label={t('batch.highlightInPreview')}
            title={t('batch.highlightInPreview')}
            className="absolute end-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            ✓
          </button>
        </div>

        <div className="ms-auto flex items-center gap-1">
          {(['grid', 'compact', 'list'] as ThumbMode[]).map((m) => {
            const Icon = VIEW_ICONS[m];
            const label = t(`view.${m}`);
            return (
              <Button
                key={m}
                variant={mode === m ? 'default' : 'outline'}
                aria-pressed={mode === m}
                aria-label={label}
                title={label}
                onClick={() => onModeChange(m)}
                className="h-8 w-8 p-0"
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
        </div>
      </div>

      {rangeError && (
        <p className="text-xs text-red-600">{t('batch.range.invalid')}</p>
      )}

      {selectedPages.size > 0 && (
        <div className={cn('flex items-center gap-2 text-sm rounded px-2 py-1 bg-blue-50 border border-blue-200')}>
          <span className="text-blue-900">{t('batch.selectedBar', { n: selectedPages.size })}</span>
          <Button variant="outline" onClick={clearSelection} disabled={running}>{t('batch.clearSelection')}</Button>
        </div>
      )}
    </div>
  );
}
