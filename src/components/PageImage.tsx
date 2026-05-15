import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2;
const WHEEL_SENS = 0.0015;

type Transform = { scale: number; tx: number; ty: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PageImage() {
  const { loadedDoc, currentPageNum, setCurrentPageNum, pageOrder } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const total = pageOrder.length;
  const currentIdx = pageOrder.indexOf(currentPageNum);
  const displayPos = currentIdx >= 0 ? currentIdx + 1 : 0;
  const [pageInput, setPageInput] = useState(String(displayPos || 1));

  useEffect(() => {
    setPageInput(String(displayPos || 1));
  }, [displayPos]);

  const goToDisplayIdx = (idx: number) => {
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(total - 1, idx));
    setCurrentPageNum(pageOrder[clamped]);
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isFinite(parsed) && total > 0) {
      const clamped = Math.min(total, Math.max(1, parsed));
      goToDisplayIdx(clamped - 1);
      setPageInput(String(clamped));
    } else {
      setPageInput(String(displayPos || 1));
    }
  };

  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  const naturalRef = useRef({ w: 0, h: 0 });

  const clampTransform = (tr: Transform): Transform => {
    const el = viewportRef.current;
    const nat = naturalRef.current;
    if (!el || !nat.w) return tr;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const scale = clamp(tr.scale, ZOOM_MIN, ZOOM_MAX);
    // Image base size = fit-to-width at scale=1.
    const w = vw * scale;
    const h = (nat.h / nat.w) * vw * scale;
    let tx: number;
    let ty: number;
    if (w <= vw) tx = (vw - w) / 2;
    else tx = clamp(tr.tx, vw - w, 0);
    if (h <= vh) ty = 0;
    else ty = clamp(tr.ty, vh - h, 0);
    return { scale, tx, ty };
  };

  const applyTransform = () => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = transformRef.current;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    setZoomPct(Math.round(scale * 100));
  };

  const setTransform = (next: Transform) => {
    transformRef.current = clampTransform(next);
    applyTransform();
  };

  // Zoom around viewport-local point (cx, cy) so that point stays fixed.
  const zoomAt = (targetScale: number, cx: number, cy: number) => {
    const cur = transformRef.current;
    const newScale = clamp(targetScale, ZOOM_MIN, ZOOM_MAX);
    const ratio = newScale / cur.scale;
    setTransform({
      scale: newScale,
      tx: cx - (cx - cur.tx) * ratio,
      ty: cy - (cy - cur.ty) * ratio,
    });
  };

  const zoomByCenter = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    zoomAt(transformRef.current.scale * factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  const reset = () => setTransform({ scale: 1, tx: 0, ty: 0 });

  // Fit entire page inside the viewport (contain). Falls back to scale=1 until the
  // image's natural size is known.
  const fitPage = () => {
    const el = viewportRef.current;
    const nat = naturalRef.current;
    if (!el || !nat.w) { reset(); return; }
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const baseH = (nat.h / nat.w) * vw;
    const scale = Math.min(1, vh / baseH);
    setTransform({ scale, tx: 0, ty: 0 });
  };

  // Load page image; reset transform.
  useEffect(() => {
    let cancelled = false;
    setSrc('');
    setErr(null);
    transformRef.current = { scale: 1, tx: 0, ty: 0 };
    naturalRef.current = { w: 0, h: 0 };
    setZoomPct(100);
    if (!loadedDoc) return;
    renderPageToPng(loadedDoc, currentPageNum)
      .then((r) => { if (!cancelled) setSrc(r.dataUrl); })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof MissingPageImageError) {
          setErr(t('image.notStored'));
        } else {
          setErr(e instanceof Error ? e.message : String(e));
        }
      });
    return () => { cancelled = true; };
  }, [loadedDoc, currentPageNum, t]);

  // Attach wheel + pointer + resize handlers once. Live state read from refs,
  // so no closure-staleness and no remove/re-add churn.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_SENS);
      zoomAt(transformRef.current.scale * factor, cx, cy);
    };

    let drag: { startX: number; startY: number; tx: number; ty: number; pointerId: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Don't start panning when interacting with the floating toolbar.
      if ((e.target as HTMLElement | null)?.closest('[data-page-controls]')) return;
      el.setPointerCapture(e.pointerId);
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
        pointerId: e.pointerId,
      };
      el.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      setTransform({
        scale: transformRef.current.scale,
        tx: drag.tx + (e.clientX - drag.startX),
        ty: drag.ty + (e.clientY - drag.startY),
      });
    };
    const endDrag = (e: PointerEvent) => {
      if (!drag) return;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = null;
      el.style.cursor = 'grab';
    };

    const ro = new ResizeObserver(() => setTransform(transformRef.current));

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    ro.observe(el);
    el.style.cursor = 'grab';

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      ro.disconnect();
    };
  }, []);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    setTransform(transformRef.current);
  };

  return (
    <div
      ref={viewportRef}
      className="border rounded relative overflow-hidden h-[70vh] bg-gray-50 select-none"
      style={{ touchAction: 'none' }}
    >
      {err ? (
        <div className="text-red-600 text-sm p-2">{err}</div>
      ) : !src ? (
        <div className="text-gray-500 text-sm p-2">{t('image.rendering')}</div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={`page ${currentPageNum + 1}`}
          draggable={false}
          onLoad={onImgLoad}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 'auto',
            transformOrigin: '0 0',
            userSelect: 'none',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
      )}
      <div
        data-page-controls
        dir="ltr"
        className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-white/95 px-2 py-1 text-xs shadow-md backdrop-blur"
        style={{ cursor: 'auto' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => goToDisplayIdx(currentIdx - 1)}
              aria-label={t('image.prevPage')}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.prevPage')}</TooltipContent>
        </Tooltip>
        <input
          type="text"
          inputMode="numeric"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitPageInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          aria-label={t('editor.page', { n: displayPos, total })}
          className="w-14 rounded border bg-white px-1 py-0.5 text-center tabular-nums"
        />
        <span className="whitespace-nowrap text-gray-500 tabular-nums">/ {total}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={currentIdx < 0 || currentIdx >= total - 1}
              onClick={() => goToDisplayIdx(currentIdx + 1)}
              aria-label={t('image.nextPage')}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.nextPage')}</TooltipContent>
        </Tooltip>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => zoomByCenter(1 / ZOOM_STEP)}
              aria-label={t('image.zoomOut')}
              className="rounded p-1 hover:bg-gray-100"
            >
              <ZoomOut className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.zoomOut')}</TooltipContent>
        </Tooltip>
        <span className="min-w-[3rem] text-center font-mono tabular-nums text-gray-600">{zoomPct}%</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => zoomByCenter(ZOOM_STEP)}
              aria-label={t('image.zoomIn')}
              className="rounded p-1 hover:bg-gray-100"
            >
              <ZoomIn className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.zoomIn')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={reset}
              aria-label={t('image.fit')}
              className="rounded p-1 hover:bg-gray-100"
            >
              <MoveHorizontal className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.fit')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={fitPage}
              aria-label={t('image.fill')}
              className="rounded p-1 hover:bg-gray-100"
            >
              <Maximize2 className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('image.fill')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
