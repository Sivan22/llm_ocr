// src/components/PageThumbs.tsx
import { useEffect, useRef } from 'react';
import { useProject } from '../store/ProjectContext';
import { PageThumb, type ThumbMode } from './PageThumb';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'llm_ocr_web:pageView:v1';

function readMode(): ThumbMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'grid' || v === 'compact' || v === 'list') return v;
  } catch { /* ignore */ }
  return 'grid';
}

interface Props {
  mode: ThumbMode;
  onOpenPage: (pageNum: number) => void;
}

export function PageThumbs({ mode, onOpenPage }: Props) {
  const {
    pages,
    currentPageNum,
    selectedPages,
    selectionAnchor,
    togglePageSelected,
    setSelectedPages,
    setSelectionAnchor,
    selectAllPages,
    clearSelection,
  } = useProject();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (!node.contains(document.activeElement)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllPages();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectAllPages, clearSelection]);

  if (pages.length === 0) return null;

  const handleClick = (n: number, e: React.MouseEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (shift) {
      const anchor = selectionAnchor ?? n;
      const lo = Math.min(anchor, n);
      const hi = Math.max(anchor, n);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelectedPages(next);
      // Shift-click does NOT move the anchor.
      if (selectionAnchor === null) setSelectionAnchor(n);
      return;
    }
    if (meta) {
      togglePageSelected(n);
      setSelectionAnchor(n);
      return;
    }
    setSelectedPages(new Set([n]));
    setSelectionAnchor(n);
  };

  const handleDoubleClick = (n: number) => onOpenPage(n);

  const gridClass = mode === 'compact'
    ? 'grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-1'
    : mode === 'grid'
    ? 'grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2'
    : 'flex flex-col gap-1';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn('outline-none focus:ring-1 focus:ring-blue-200 rounded p-1 border max-h-[60vh] overflow-auto', gridClass)}
    >
      {pages.map((p) => (
        <PageThumb
          key={p.pageNum}
          page={p}
          mode={mode}
          selected={selectedPages.has(p.pageNum)}
          viewing={currentPageNum === p.pageNum}
          onClick={(e) => handleClick(p.pageNum, e)}
          onDoubleClick={() => handleDoubleClick(p.pageNum)}
        />
      ))}
    </div>
  );
}

export { readMode as readSavedThumbMode, STORAGE_KEY as THUMB_VIEW_STORAGE_KEY };
