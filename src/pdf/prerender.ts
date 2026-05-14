// Eagerly renders every page through the worker and persists to IDB so
// page images survive even if the user never scrolls to them.
import { loadPageImage, savePageImage } from '../store/pageImagesStore';
import { renderPageToPng, type LoadedDoc } from './render';

export async function prerenderAllPages(
  doc: LoadedDoc,
  fileHash: string,
  signal: AbortSignal,
): Promise<void> {
  if (doc.type === 'stored') return;
  for (let pageNum = 0; pageNum < doc.pageCount; pageNum++) {
    if (signal.aborted) return;
    const existing = await loadPageImage(fileHash, pageNum);
    if (existing) continue;
    if (signal.aborted) return;
    try {
      const img = await renderPageToPng(doc, pageNum);
      if (signal.aborted) return;
      await savePageImage(fileHash, pageNum, img);
    } catch (err) {
      console.warn(`prerender page ${pageNum} failed`, err);
    }
  }
}
