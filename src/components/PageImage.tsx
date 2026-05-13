import { useEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
import { Button } from './ui/button';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2;
const WHEEL_SENS = 0.0015;

type Transform = { scale: number; tx: number; ty: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PageImage() {
  const { loadedDoc, currentPageNum } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

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

  if (err) return <div className="text-red-600 text-sm p-2">{err}</div>;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => zoomByCenter(1 / ZOOM_STEP)} aria-label={t('image.zoomOut')} title={t('image.zoomOut')}>−</Button>
        <span className="text-xs text-gray-600 w-12 text-center tabular-nums">{zoomPct}%</span>
        <Button variant="outline" size="sm" onClick={() => zoomByCenter(ZOOM_STEP)} aria-label={t('image.zoomIn')} title={t('image.zoomIn')}>+</Button>
        <Button variant="outline" size="sm" onClick={reset} title={t('image.fit')}>{t('image.fit')}</Button>
      </div>
      <div
        ref={viewportRef}
        className="border rounded relative overflow-hidden h-[70vh] bg-gray-50 select-none"
        style={{ touchAction: 'none' }}
      >
        {!src ? (
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
      </div>
    </div>
  );
}
