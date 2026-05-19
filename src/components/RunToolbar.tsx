// src/components/RunToolbar.tsx
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Grid3x3, List, Play, Square, X, Clock, AlertTriangle, Check, ListChecks } from 'lucide-react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { useBatchRunner } from '../hooks/useBatchRunner';
import { hasApiKey } from '../ai/providers';
import { parsePageRange } from '../lib/pageRange';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
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
  const { settings } = useSettings();
  const { loadedDoc, pageOrder, selectedPages, clearSelection, setSelectedPages, setSelectionAnchor, selectAllPages } = useProject();
  const { running, runSelected, stop, pendingPages, failedPages } = useBatchRunner();
  const [rangeInput, setRangeInput] = useState('');

  const keyMissing = !hasApiKey(settings);
  const keyMissingMsg = t('batch.apiKeyMissing', { provider: t(`route.${settings.route}`) });

  const visibleCount = pageOrder.length;
  const { pages: rangeDisplayIdxs, error: rangeError } = useMemo(
    () => parsePageRange(rangeInput, visibleCount),
    [rangeInput, visibleCount],
  );
  // Range refers to display positions (1-indexed). Map back to actual pageNums.
  const rangePages = useMemo(
    () => rangeDisplayIdxs.map((i) => pageOrder[i]).filter((n): n is number => n !== undefined),
    [rangeDisplayIdxs, pageOrder],
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
        <span className="text-sm text-gray-600">{t('batch.runPages')}</span>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={highlight}
                disabled={!canHighlight}
                aria-label={t('batch.highlightInPreview')}
                className="absolute end-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <Check className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('batch.highlightInPreview')}</TooltipContent>
          </Tooltip>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            selectAllPages();
            if (pageOrder[0] !== undefined) setSelectionAnchor(pageOrder[0]);
          }}
          disabled={pageOrder.length === 0}
        >
          <ListChecks className="h-4 w-4 me-1" />
          {t('batch.selectAll', { n: pageOrder.length })}
        </Button>
        <Button
          variant="outline"
          onClick={() => selectPages(pendingPages)}
          disabled={pendingPages.length === 0}
        >
          <Clock className="h-4 w-4 me-1" />
          {t('batch.selectPending', { n: pendingPages.length })}
        </Button>
        {failedPages.length > 1 && (
          <Button variant="outline" onClick={() => selectPages(failedPages)}>
            <AlertTriangle className="h-4 w-4 me-1" />
            {t('batch.selectFailed', { n: failedPages.length })}
          </Button>
        )}

        {running ? (
          <Button className="ms-2" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4 me-1 fill-current" />
            {t('batch.stop')}
          </Button>
        ) : keyMissing ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="ms-2 inline-flex">
                <Button disabled className="pointer-events-none">
                  <Play className="h-4 w-4 me-1 fill-current rtl:-scale-x-100" />
                  {selectedPages.size > 0
                    ? t('batch.runSelected', { n: selectedPages.size })
                    : t('batch.run')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{keyMissingMsg}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            className="ms-2"
            onClick={() => {
              runSelected();
              clearSelection();
            }}
            disabled={selectedPages.size === 0}
          >
            <Play className="h-4 w-4 me-1 fill-current rtl:-scale-x-100" />
            {selectedPages.size > 0
              ? t('batch.runSelected', { n: selectedPages.size })
              : t('batch.run')}
          </Button>
        )}
        {selectedPages.size > 0 && !running && (
          <Button variant="outline" onClick={clearSelection}>
            <X className="h-4 w-4 me-1" />
            {t('batch.clearSelectedN', { n: selectedPages.size })}
          </Button>
        )}

        <div className="ms-auto flex items-center gap-1">
          {(['grid', 'compact', 'list'] as ThumbMode[]).map((m) => {
            const Icon = VIEW_ICONS[m];
            const label = t(`view.${m}`);
            return (
              <Tooltip key={m}>
                <TooltipTrigger asChild>
                  <Button
                    variant={mode === m ? 'default' : 'outline'}
                    aria-pressed={mode === m}
                    aria-label={label}
                    onClick={() => onModeChange(m)}
                    className="h-8 w-8 p-0"
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {keyMissing && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {keyMissingMsg}
        </p>
      )}

      {rangeError && (
        <p className="text-xs text-red-600">{t('batch.range.invalid')}</p>
      )}

      {selectedPages.size > 0 && (
        <div className={cn('flex items-center gap-2 text-sm rounded px-2 py-1 bg-blue-50 border border-blue-200')}>
          <span className="text-blue-900">{t('batch.selectedBar', { n: selectedPages.size })}</span>
        </div>
      )}
    </div>
  );
}
