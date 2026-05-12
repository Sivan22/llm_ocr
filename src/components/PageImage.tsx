import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { renderPageToPng } from '../pdf/render';

export function PageImage() {
  const { loadedDoc, currentPageNum } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(''); setErr(null);
    if (!loadedDoc) return;
    renderPageToPng(loadedDoc, currentPageNum)
      .then((r) => { if (!cancelled) setSrc(r.dataUrl); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [loadedDoc, currentPageNum]);

  if (err) return <div className="text-red-600 text-sm p-2">{err}</div>;
  if (!src) return <div className="text-gray-500 text-sm p-2">{t('image.rendering')}</div>;
  return (
    <div className="border rounded overflow-auto h-[70vh] bg-gray-50">
      <img src={src} alt={`page ${currentPageNum + 1}`} className="max-w-full" />
    </div>
  );
}
