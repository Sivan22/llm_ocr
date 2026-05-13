import { useCallback, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { openPdf, imagesAsDoc, combine, readFileBytes, type LoadedDoc } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadAllPageResults } from '../store/persistence';
import { upsertJob, pruneJobs } from '../store/jobs';
import { savePageImage } from '../store/pageImagesStore';
import { cn } from '../lib/utils';

export function FileDrop() {
  const { setProject, loadedDoc, fileName } = useProject();
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    try {
      const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));

      let doc: LoadedDoc;
      const combinedBytes: Uint8Array[] = [];
      let displayName = files.map((f) => f.name).join(' + ');

      if (pdfFiles.length === 1 && imageFiles.length === 0) {
        const bytes = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(bytes);
        doc = await openPdf(bytes);
        displayName = pdfFiles[0].name;
      } else if (pdfFiles.length === 0 && imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.map(async (f) => {
          const bytes = await readFileBytes(f);
          combinedBytes.push(bytes);
          return { bytes, mediaType: f.type || 'image/png' };
        }));
        doc = imagesAsDoc(imgs);
      } else if (pdfFiles.length === 1 && imageFiles.length > 0) {
        const pdfBytes = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(pdfBytes);
        const pdfDoc = await openPdf(pdfBytes);

        const extraImages = await Promise.all(imageFiles.map(async (f) => {
          const bytes = await readFileBytes(f);
          combinedBytes.push(bytes);
          return { bytes, mediaType: f.type || 'image/png' };
        }));
        const imgDoc = imagesAsDoc(extraImages);

        doc = combine(pdfDoc, imgDoc);
      } else {
        throw new Error(t('file.errorMixed'));
      }

      const concat = concatBytes(combinedBytes);
      const fileHash = await sha256(concat);
      const restored = await loadAllPageResults(fileHash);
      setProject({ doc, fileHash, fileName: displayName, restored });

      try {
        await upsertJob({ fileHash, fileName: displayName, pageCount: doc.pageCount });
        await pruneJobs(20);

        if (doc.type === 'images') {
          await Promise.all(doc.pages.map((p, i) =>
            savePageImage(fileHash, i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        } else if (doc.type === 'combined') {
          const offset = doc.pdf.pageCount;
          await Promise.all(doc.images.pages.map((p, i) =>
            savePageImage(fileHash, offset + i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        }
      } catch (err) {
        console.warn('FileDrop: job persistence failed', err);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setProject, t]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
        )}
      >
        <p className="text-gray-700">{t('file.dropHint')}</p>
        <p className="text-xs text-gray-500 mt-1">{t('file.formatHint')}</p>
        <label className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded cursor-pointer">
          {t('file.choose')}
          <input
            type="file"
            multiple
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {loadedDoc && (
          <p className="mt-3 text-sm text-gray-800">
            {t('file.loaded', { name: fileName, n: loadedDoc.pageCount })}
          </p>
        )}
      </div>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}

function concatBytes(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
