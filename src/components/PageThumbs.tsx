// src/components/PageThumbs.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { PageThumb, type ThumbMode } from './PageThumb';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'llm_ocr_web:pageView:v1';
const DRAG_MIME = 'application/x-llm-ocr-pages';

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

interface DropTarget { index: number; side: 'before' | 'after' }

export function PageThumbs({ mode, onOpenPage }: Props) {
  const {
    pages,
    pageOrder,
    currentPageNum,
    selectedPages,
    selectionAnchor,
    togglePageSelected,
    setSelectedPages,
    setSelectionAnchor,
    selectAllPages,
    clearSelection,
    removePages,
    movePages,
  } = useProject();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragPages, setDragPages] = useState<number[] | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const pagesByNum = useMemo(() => {
    const m = new Map<number, typeof pages[number]>();
    for (const p of pages) m.set(p.pageNum, p);
    return m;
  }, [pages]);

  const orderedPages = useMemo(
    () => pageOrder.map((n) => pagesByNum.get(n)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [pageOrder, pagesByNum],
  );

  const draggingSet = useMemo(() => new Set(dragPages ?? []), [dragPages]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (!node.contains(document.activeElement)) return;
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllPages();
      } else if (e.key === 'Escape') {
        clearSelection();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPages.size > 0) {
        e.preventDefault();
        removePages([...selectedPages]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectAllPages, clearSelection, removePages, selectedPages]);

  if (pageOrder.length === 0) return null;

  const handleClick = (n: number, e: React.MouseEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (shift) {
      const anchor = selectionAnchor ?? n;
      const ai = pageOrder.indexOf(anchor);
      const ni = pageOrder.indexOf(n);
      if (ai === -1 || ni === -1) {
        setSelectedPages(new Set([n]));
      } else {
        const lo = Math.min(ai, ni);
        const hi = Math.max(ai, ni);
        const next = new Set<number>();
        for (let i = lo; i <= hi; i++) next.add(pageOrder[i]);
        setSelectedPages(next);
      }
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

  const handleDragStart = (n: number, e: React.DragEvent) => {
    const moving = selectedPages.has(n) ? [...selectedPages] : [n];
    setDragPages(moving);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(moving)); } catch { /* ignore */ }
  };

  const handleDragEnd = () => {
    setDragPages(null);
    setDropTarget(null);
  };

  const computeSide = (e: React.DragEvent): 'before' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (mode === 'list') {
      return (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    }
    return (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    if (!dragPages) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const side = computeSide(e);
    setDropTarget((cur) => (cur && cur.index === index && cur.side === side ? cur : { index, side }));
  };

  const handleDrop = (index: number, e: React.DragEvent) => {
    if (!dragPages) return;
    e.preventDefault();
    const side = computeSide(e);
    const toIndex = side === 'before' ? index : index + 1;
    movePages(dragPages, toIndex);
    setDragPages(null);
    setDropTarget(null);
  };

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
      {orderedPages.map((p, i) => (
        <PageThumb
          key={p.pageNum}
          page={p}
          displayIndex={i}
          mode={mode}
          selected={selectedPages.has(p.pageNum)}
          viewing={currentPageNum === p.pageNum}
          dragging={draggingSet.has(p.pageNum)}
          dropBefore={dropTarget?.index === i && dropTarget.side === 'before'}
          dropAfter={dropTarget?.index === i && dropTarget.side === 'after'}
          onClick={(e) => handleClick(p.pageNum, e)}
          onDoubleClick={() => handleDoubleClick(p.pageNum)}
          onRemove={() => removePages([p.pageNum])}
          onDragStart={(e) => handleDragStart(p.pageNum, e)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(i, e)}
          onDrop={(e) => handleDrop(i, e)}
        />
      ))}
    </div>
  );
}

export { readMode as readSavedThumbMode, STORAGE_KEY as THUMB_VIEW_STORAGE_KEY };
