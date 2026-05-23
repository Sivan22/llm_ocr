import { useEffect, useMemo, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { joinPages, extractToc, type TocEntry } from '../docx/markdown';
import { mdToDocxBlob, downloadBlob } from '../docx/export';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

export function ExportPanel() {
  const { pages, pageOrder, fileName } = useProject();
  const { t } = useI18n();
  const md = useMemo(() => joinPages(pages, pageOrder), [pages, pageOrder]);
  const toc = useMemo(() => extractToc(md), [md]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'word' | 'markdown'>('word');
  const [rendering, setRendering] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const stem = fileName.replace(/\.[^.]+$/, '') || 'ocr';

  const onDownloadDocx = async () => {
    setBusy(true);
    try {
      const blob = await mdToDocxBlob(md);
      downloadBlob(blob, `${stem}_ocr.docx`);
    } finally {
      setBusy(false);
    }
  };

  const onDownloadMd = () => {
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${stem}_ocr.md`);
  };

  const onTocClick = (entry: TocEntry) => {
    const target = containerRef.current?.querySelector<HTMLElement>(`#${entry.id}`);
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab !== 'word' || !md) {
      setRendering(false);
      setPreviewError(false);
      if (containerRef.current) containerRef.current.innerHTML = '';
      return;
    }
    let cancelled = false;
    setRendering(true);
    setPreviewError(false);
    const handle = window.setTimeout(async () => {
      try {
        const blob = await mdToDocxBlob(md);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        await renderAsync(blob, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });
        if (cancelled || !containerRef.current) return;
        const paragraphs = containerRef.current.querySelectorAll<HTMLElement>('article p');
        for (const entry of toc) {
          const el = paragraphs[entry.paragraphIndex];
          if (el) el.id = entry.id;
        }
      } catch (err) {
        if (cancelled) return;
        console.error('docx preview render failed', err);
        setPreviewError(true);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [md, activeTab, toc]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          onClick={activeTab === 'word' ? onDownloadDocx : onDownloadMd}
          disabled={!md || busy}
        >
          {busy
            ? t('export.building')
            : activeTab === 'word'
              ? t('export.download')
              : t('export.download_md')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'word' | 'markdown')}>
        <TabsList>
          <TabsTrigger value="word">{t('export.preview_word')}</TabsTrigger>
          <TabsTrigger value="markdown">{t('export.preview_markdown')}</TabsTrigger>
        </TabsList>

        <TabsContent value="word">
          {!md ? (
            <div dir="rtl" className="border rounded p-2 bg-gray-50 text-sm text-gray-500">
              {t('export.empty')}
            </div>
          ) : previewError ? (
            <div className="border rounded p-2 bg-red-50 text-sm text-red-700">
              {t('export.preview_error')}
            </div>
          ) : (
            <div className="flex gap-3">
              {toc.length > 0 && (
                <nav
                  dir="rtl"
                  aria-label={t('export.toc')}
                  className="w-48 shrink-0 border rounded p-2 max-h-[60vh] overflow-auto bg-gray-50 text-sm"
                >
                  <div className="font-bold mb-1 text-gray-700">{t('export.toc')}</div>
                  <ul className="space-y-0.5">
                    {toc.map((entry) => (
                      <li key={entry.id} style={{ paddingInlineStart: `${(entry.depth - 1) * 0.75}rem` }}>
                        <button
                          type="button"
                          onClick={() => onTocClick(entry)}
                          className="text-right w-full truncate text-blue-700 hover:underline cursor-pointer"
                          title={entry.text}
                        >
                          {entry.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="relative flex-1 min-w-0">
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600 z-10">
                    {t('export.rendering')}
                  </div>
                )}
                <div
                  ref={containerRef}
                  dir="rtl"
                  className="export-word-preview border rounded p-2 max-h-[60vh] overflow-auto bg-white"
                />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="markdown">
          <pre
            dir="rtl"
            className="border rounded p-2 max-h-[60vh] overflow-auto whitespace-pre-wrap font-serif text-sm bg-gray-50"
          >
            {md || t('export.empty')}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
