// src/components/PageThumb.tsx
import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useProject } from '../store/ProjectContext';
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
import { loadPageImage, savePageImage } from '../store/pageImagesStore';
import { useI18n } from '../i18n/I18nContext';
import type { PageResult } from '../lib/types';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type ThumbMode = 'grid' | 'compact' | 'list';

interface Props {
  page: PageResult;
  displayIndex: number;
  mode: ThumbMode;
  selected: boolean;
  viewing: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const STATUS_RING: Record<PageResult['status'], string> = {
  pending: 'ring-gray-300',
  running: 'ring-blue-400 animate-pulse',
  ok:      'ring-green-500',
  error:   'ring-red-500',
  edited:  'ring-amber-500',
};

const STATUS_BG: Record<PageResult['status'], string> = {
  pending: 'bg-gray-100',
  running: 'bg-blue-100',
  ok:      'bg-green-50',
  error:   'bg-red-50',
  edited:  'bg-amber-50',
};

export function PageThumb({
  page,
  displayIndex,
  mode,
  selected,
  viewing,
  dragging,
  dropBefore,
  dropAfter,
  onClick,
  onDoubleClick,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: Props) {
  const { loadedDoc, fileHash } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fileHash) return;
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const tryLoad = async () => {
      const stored = await loadPageImage(fileHash, page.pageNum);
      if (cancelled) return;
      if (stored) { setSrc(stored.dataUrl); return; }
      if (!loadedDoc) return;
      if (loadedDoc.type === 'stored') { setMissing(true); return; }
      try {
        const img = await renderPageToPng(loadedDoc, page.pageNum);
        if (cancelled) return;
        setSrc(img.dataUrl);
        savePageImage(fileHash, page.pageNum, img).catch((err) => {
          console.warn('PageThumb: savePageImage failed', err);
        });
      } catch (err) {
        if (err instanceof MissingPageImageError) setMissing(true);
        else console.warn('PageThumb: render failed', err);
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      tryLoad();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          observer?.disconnect();
          tryLoad();
        }
      }, { rootMargin: '200px' });
      if (ref.current) observer.observe(ref.current);
    }

    return () => { cancelled = true; observer?.disconnect(); };
  }, [fileHash, loadedDoc, page.pageNum]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e as unknown as React.MouseEvent);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  const removeBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onClick={handleRemoveClick}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={t('thumb.remove')}
          className={cn(
            'absolute top-1 end-1 h-7 w-7 inline-flex items-center justify-center rounded',
            'bg-white/90 text-gray-700 hover:bg-red-600 hover:text-white',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            'transition-opacity z-10 shadow-sm',
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{t('thumb.remove')}</TooltipContent>
    </Tooltip>
  );

  if (mode === 'list') {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={cn(
          'group relative flex items-center gap-3 px-2 py-1 rounded cursor-pointer select-none border',
          STATUS_BG[page.status],
          selected ? 'ring-2 ring-blue-600' : 'ring-0',
          viewing && !selected && 'ring-1 ring-gray-400',
          dragging && 'opacity-50',
          dropBefore && 'border-t-2 border-t-blue-500',
          dropAfter && 'border-b-2 border-b-blue-500',
        )}
      >
        <div className="w-10 h-14 bg-white border flex items-center justify-center overflow-hidden">
          {src
            ? <img src={src} alt="" className="object-cover w-full h-full" draggable={false} />
            : <span className="text-[10px] text-gray-400">{missing ? '×' : '…'}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono">{displayIndex + 1}</div>
          {page.error ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs text-gray-600 truncate">
                  {t(`pages.status.${page.status}`)}
                  {page.status === 'ok' && page.text ? ` · ${page.text.length} chars` : ''}
                  {page.status === 'error' && page.error ? ` · ${page.error}` : ''}
                </div>
              </TooltipTrigger>
              <TooltipContent>{page.error}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="text-xs text-gray-600 truncate">
              {t(`pages.status.${page.status}`)}
              {page.status === 'ok' && page.text ? ` · ${page.text.length} chars` : ''}
            </div>
          )}
        </div>
        {removeBtn}
      </div>
    );
  }

  const wrapperBase = mode === 'compact'
    ? 'aspect-[5/7] text-[10px]'
    : 'aspect-[5/7] text-xs';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          className={cn(
            wrapperBase,
            'group relative overflow-hidden rounded border cursor-pointer select-none',
            'ring-2',
            selected ? 'ring-blue-600' : viewing ? 'ring-gray-400' : STATUS_RING[page.status],
            dragging && 'opacity-50',
            dropBefore && 'outline outline-2 outline-blue-500 outline-offset-[-2px]',
            dropAfter && 'outline outline-2 outline-blue-500 outline-offset-[-2px]',
          )}
        >
          {src
            ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
            : <div className={cn('w-full h-full flex items-center justify-center', STATUS_BG[page.status])}>
                <span className="text-gray-500">{missing ? t('thumb.placeholderTooltip') : '…'}</span>
              </div>}
          <span className="absolute top-0 left-0 px-1 bg-white/80 font-mono">{displayIndex + 1}</span>
          {removeBtn}
        </div>
      </TooltipTrigger>
      <TooltipContent>{page.error ?? t(`pages.status.${page.status}`)}</TooltipContent>
    </Tooltip>
  );
}
