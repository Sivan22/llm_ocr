// src/components/PageThumb.tsx
import { useEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
import { loadPageImage, savePageImage } from '../store/pageImagesStore';
import { useI18n } from '../i18n/I18nContext';
import type { PageResult } from '../lib/types';
import { cn } from '../lib/utils';

export type ThumbMode = 'grid' | 'compact' | 'list';

interface Props {
  page: PageResult;
  mode: ThumbMode;
  selected: boolean;
  viewing: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
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

export function PageThumb({ page, mode, selected, viewing, onClick, onDoubleClick }: Props) {
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

  if (mode === 'list') {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          'flex items-center gap-3 px-2 py-1 rounded cursor-pointer select-none border',
          STATUS_BG[page.status],
          selected ? 'ring-2 ring-blue-600' : 'ring-0',
          viewing && !selected && 'ring-1 ring-gray-400',
        )}
      >
        <div className="w-10 h-14 bg-white border flex items-center justify-center overflow-hidden">
          {src
            ? <img src={src} alt="" className="object-cover w-full h-full" />
            : <span className="text-[10px] text-gray-400">{missing ? '×' : '…'}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono">{page.pageNum + 1}</div>
          <div className="text-xs text-gray-600 truncate" title={page.error ?? ''}>
            {t(`pages.status.${page.status}`)}
            {page.status === 'ok' && page.text ? ` · ${page.text.length} chars` : ''}
            {page.status === 'error' && page.error ? ` · ${page.error}` : ''}
          </div>
        </div>
      </div>
    );
  }

  const wrapperBase = mode === 'compact'
    ? 'aspect-[5/7] text-[10px]'
    : 'aspect-[5/7] text-xs';

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={page.error ?? t(`pages.status.${page.status}`)}
      className={cn(
        wrapperBase,
        'relative overflow-hidden rounded border cursor-pointer select-none',
        'ring-2',
        selected ? 'ring-blue-600' : viewing ? 'ring-gray-400' : STATUS_RING[page.status],
      )}
    >
      {src
        ? <img src={src} alt="" className="w-full h-full object-cover" />
        : <div className={cn('w-full h-full flex items-center justify-center', STATUS_BG[page.status])}>
            <span className="text-gray-500">{missing ? t('thumb.placeholderTooltip') : '…'}</span>
          </div>}
      <span className="absolute top-0 left-0 px-1 bg-white/80 font-mono">{page.pageNum + 1}</span>
    </div>
  );
}
