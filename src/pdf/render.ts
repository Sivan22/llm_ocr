import { loadPageImage } from '../store/pageImagesStore';
import { openPdfInWorker, renderPdfInWorker } from './renderClient';

export interface PdfDoc {
  type: 'pdf';
  docId: string;
  pageCount: number;
}

export interface ImageDoc {
  type: 'images';
  pages: { dataUrl: string; mediaType: string }[];
  pageCount: number;
}

export interface CombinedDoc {
  type: 'combined';
  pdf: PdfDoc;
  images: ImageDoc;
  pageCount: number;
}

export interface StoredDoc {
  type: 'stored';
  fileHash: string;
  pageCount: number;
  cache: Map<number, { dataUrl: string; mediaType: string }>;
}

export type LoadedDoc = PdfDoc | ImageDoc | CombinedDoc | StoredDoc;

export class MissingPageImageError extends Error {
  pageNum: number;
  constructor(pageNum: number) {
    super(`Page ${pageNum} image not stored`);
    this.name = 'MissingPageImageError';
    this.pageNum = pageNum;
  }
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const { docId, pageCount } = await openPdfInWorker(bytes);
  return { type: 'pdf', docId, pageCount };
}

export function imagesAsDoc(images: { bytes: Uint8Array; mediaType: string }[]): ImageDoc {
  const pages = images.map((img) => ({
    dataUrl: bytesToDataUrl(img.bytes, img.mediaType),
    mediaType: img.mediaType,
  }));
  return { type: 'images', pages, pageCount: pages.length };
}

export function combine(left: LoadedDoc, right: LoadedDoc): CombinedDoc {
  if (left.type === 'stored' || right.type === 'stored') {
    throw new Error('combine: cannot combine a stored doc');
  }
  const leftPdf  = left.type  === 'pdf' ? left  : left.type  === 'combined' ? left.pdf  : null;
  const rightPdf = right.type === 'pdf' ? right : right.type === 'combined' ? right.pdf : null;
  const leftImgs  = left.type  === 'images' ? left  : left.type  === 'combined' ? left.images  : null;
  const rightImgs = right.type === 'images' ? right : right.type === 'combined' ? right.images : null;

  if (leftPdf && rightPdf && leftPdf.pageCount > 0 && rightPdf.pageCount > 0) {
    throw new Error('combine: cannot merge two PDF docs');
  }
  const pdf: PdfDoc = (leftPdf && leftPdf.pageCount > 0)
    ? leftPdf
    : (rightPdf && rightPdf.pageCount > 0)
    ? rightPdf
    : { type: 'pdf', docId: '', pageCount: 0 };

  const imgs: { dataUrl: string; mediaType: string }[] = [
    ...(leftImgs?.pages ?? []),
    ...(rightImgs?.pages ?? []),
  ];
  const images: ImageDoc = { type: 'images', pages: imgs, pageCount: imgs.length };

  return { type: 'combined', pdf, images, pageCount: pdf.pageCount + images.pageCount };
}

export async function renderPageToPng(loaded: LoadedDoc, pageNum: number, dpi = 200): Promise<{ dataUrl: string; mediaType: string }> {
  if (loaded.type === 'stored') {
    const cached = loaded.cache.get(pageNum);
    if (cached) return cached;
    const v = await loadPageImage(loaded.fileHash, pageNum);
    if (!v) throw new MissingPageImageError(pageNum);
    loaded.cache.set(pageNum, v);
    return v;
  }
  if (loaded.type === 'images') {
    const p = loaded.pages[pageNum];
    if (!p) throw new Error(`Page ${pageNum} out of range`);
    return { dataUrl: p.dataUrl, mediaType: p.mediaType };
  }
  if (loaded.type === 'combined') {
    if (pageNum < loaded.pdf.pageCount) {
      return renderPageToPng(loaded.pdf, pageNum, dpi);
    }
    return renderPageToPng(loaded.images, pageNum - loaded.pdf.pageCount, dpi);
  }
  return renderPdfInWorker(loaded.docId, pageNum, dpi);
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return `data:${mediaType};base64,${btoa(bin)}`;
}
