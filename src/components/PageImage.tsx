import { useEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { renderPageToPng } from '../pdf/render';
import { Button } from './ui/button';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2;

export function PageImage() {
  const { loadedDoc, currentPageNum } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc('');
    setErr(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNatural({ w: 0, h: 0 });
    if (!loadedDoc) return;
    renderPageToPng(loadedDoc, currentPageNum)
      .then((r) => { if (!cancelled) setSrc(r.dataUrl); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [loadedDoc, currentPageNum]);

  const measure = (z: number) => {
    const el = viewportRef.current;
    if (!el || !natural.w) return { w: 0, h: 0, vw: 0, vh: 0 };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const fs = vw / natural.w;
    return { w: natural.w * fs * z, h: natural.h * fs * z, vw, vh };
  };

  const clampPan = (p: { x: number; y: number }, z: number) => {
    const { w, h, vw, vh } = measure(z);
    let x: number;
    let y: number;
    if (w <= vw) x = (vw - w) / 2;
    else x = Math.min(0, Math.max(vw - w, p.x));
    if (h <= vh) y = 0;
    else y = Math.min(0, Math.max(vh - h, p.y));
    return { x, y };
  };

  const setZoomAt = (next: number, cx: number, cy: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    const ratio = clamped / zoom;
    const np = clampPan({ x: cx - (cx - pan.x) * ratio, y: cy - (cy - pan.y) * ratio }, clamped);
    setPan(np);
    setZoom(clamped);
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoomAt(zoom * factor, cx, cy);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, pan, natural]);

  const zoomByCenter = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    setZoomAt(zoom * factor, el.clientWidth / 2, el.clientHeight / 2);
  };
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }, zoom));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
    setIsDragging(false);
  };

  if (err) return <div className="text-red-600 text-sm p-2">{err}</div>;

  const rs = measure(zoom);
  const imgStyle: React.CSSProperties = rs.w
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${rs.w}px`,
        height: 'auto',
        transform: `translate(${pan.x}px, ${pan.y}px)`,
        transformOrigin: '0 0',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : { position: 'absolute', top: 0, left: 0, width: '100%', height: 'auto', pointerEvents: 'none', userSelect: 'none' };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => zoomByCenter(1 / ZOOM_STEP)} aria-label={t('image.zoomOut')} title={t('image.zoomOut')}>−</Button>
        <span className="text-xs text-gray-600 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="sm" onClick={() => zoomByCenter(ZOOM_STEP)} aria-label={t('image.zoomIn')} title={t('image.zoomIn')}>+</Button>
        <Button variant="outline" size="sm" onClick={reset} title={t('image.fit')}>{t('image.fit')}</Button>
      </div>
      <div
        ref={viewportRef}
        className="border rounded relative overflow-hidden h-[70vh] bg-gray-50 select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!src ? (
          <div className="text-gray-500 text-sm p-2">{t('image.rendering')}</div>
        ) : (
          <img
            src={src}
            alt={`page ${currentPageNum + 1}`}
            style={imgStyle}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
        )}
      </div>
    </div>
  );
}
