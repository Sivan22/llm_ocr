// src/components/DropStrip.tsx
import { useCallback, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { openPdf, imagesAsDoc, combine, readFileBytes, type LoadedDoc } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { upsertJob, pruneJobs } from '../store/jobs';
import { savePageImage } from '../store/pageImagesStore';
import { concatBytes } from '../lib/bytes';
import { cn } from '../lib/utils';

export function DropStrip() {
  const { setProject, loadedDoc, fileName, bytes, pages, pageOrder, resetProject, appendFiles } = useProject();
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 3000);
  };

  const replaceProject = useCallback(async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    try {
      const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
      if (pdfFiles.length > 1) throw new Error(t('file.errorMixed'));

      const combinedBytes: Uint8Array[] = [];
      let doc: LoadedDoc | null = null;
      const displayName = files.map((f) => f.name).join(' + ');

      if (pdfFiles.length === 1) {
        const pb = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(pb);
        doc = await openPdf(pb);
      }
      if (imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.map(async (f) => {
          const b = await readFileBytes(f);
          combinedBytes.push(b);
          return { bytes: b, mediaType: f.type || 'image/png' };
        }));
        const imgDoc = imagesAsDoc(imgs);
        doc = doc ? combine(doc, imgDoc) : imgDoc;
      }
      if (!doc) throw new Error(t('file.errorMixed'));

      const concat = concatBytes(combinedBytes);
      const contentHash = await sha256(concat);
      // Tag each upload as a fresh job so re-uploading the same file does not
      // resurrect a prior session's OCR data. Prior runs remain reachable via
      // the Jobs list "Reload" button, which restores by the tagged hash.
      const newHash = `${contentHash}-${Date.now().toString(36)}`;
      setProject({ doc, fileHash: newHash, fileName: displayName, restored: [], bytes: concat });

      try {
        await upsertJob({ fileHash: newHash, fileName: displayName, pageCount: doc.pageCount });
        await pruneJobs(20);
        if (doc.type === 'images') {
          await Promise.all(doc.pages.map((p, i) =>
            savePageImage(newHash, i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        } else if (doc.type === 'combined') {
          const offset = doc.pdf.pageCount;
          await Promise.all(doc.images.pages.map((p, i) =>
            savePageImage(newHash, offset + i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        }
      } catch (err) {
        console.warn('DropStrip: job persistence failed', err);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setProject, t]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!loadedDoc) return replaceProject(files);
    if (loadedDoc.type === 'stored' || !bytes) {
      flashNotice(t('drop.disabledForStoredJob'));
      return;
    }
    setError(null);
    try {
      const { appended, warning } = await appendFiles(files);
      if (warning === 'too-many-pdfs') flashNotice(t('file.errorMixed'));
      else if (appended === 0 && warning) flashNotice(t('drop.disabledForStoredJob'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadedDoc, bytes, appendFiles, replaceProject, t]);

  const handleClick = () => inputRef.current?.click();
  const handleStartOver = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetProject();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const visible = new Set(pageOrder);
  const visiblePages = pages.filter((p) => visible.has(p.pageNum));
  const nDone = visiblePages.filter((p) => p.status === 'ok' || p.status === 'edited').length;
  const nTodo = visiblePages.filter((p) => p.status === 'pending').length;
  const nError = visiblePages.filter((p) => p.status === 'error').length;

  // Empty state
  if (!loadedDoc) {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 sm:p-12 text-center cursor-pointer select-none',
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
          )}
        >
          <p className="text-gray-700">{t('drop.empty.title')}</p>
          <p className="text-xs text-gray-500 mt-1">{t('drop.empty.hint')}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  // Loaded state
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border border-dashed rounded-md px-3 py-2 flex flex-wrap justify-between items-center gap-x-3 gap-y-1 cursor-pointer select-none text-sm',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
        )}
      >
        <div className="min-w-0 truncate flex-1">
          <span className="font-medium">{fileName}</span>
          <span className="text-gray-500"> · {t('drop.loaded.summary.pages', { pages: pageOrder.length })}</span>
          {nDone   > 0 && <span className="text-gray-500"> · {t('drop.loaded.summary.done',  { n: nDone   })}</span>}
          {nTodo   > 0 && <span className="text-gray-500"> · {t('drop.loaded.summary.todo',  { n: nTodo   })}</span>}
          {nError  > 0 && <span className="text-red-600"> · {t('drop.loaded.summary.error', { n: nError  })}</span>}
        </div>
        <div className="flex items-center gap-3 text-gray-500 shrink-0">
          <span className="hidden sm:inline">{t('drop.loaded.appendHint')}</span>
          <button onClick={handleStartOver} className="text-red-600 underline-offset-2 hover:underline">
            {t('drop.loaded.startOver')}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
      />
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {notice && <p className="text-amber-700 text-sm mt-2">{notice}</p>}
    </div>
  );
}
