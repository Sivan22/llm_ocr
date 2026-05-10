import * as mupdf from 'mupdf';

export interface PdfDoc {
  type: 'pdf';
  doc: mupdf.PDFDocument;
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

export type LoadedDoc = PdfDoc | ImageDoc | CombinedDoc;

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const pdfDoc = doc.asPDF();
  if (!pdfDoc) throw new Error('Failed to open PDF');
  return { type: 'pdf', doc: pdfDoc, pageCount: pdfDoc.countPages() };
}

export function imagesAsDoc(images: { bytes: Uint8Array; mediaType: string }[]): ImageDoc {
  const pages = images.map((img) => ({
    dataUrl: bytesToDataUrl(img.bytes, img.mediaType),
    mediaType: img.mediaType,
  }));
  return { type: 'images', pages, pageCount: pages.length };
}

export function combine(pdf: PdfDoc, images: ImageDoc): CombinedDoc {
  return { type: 'combined', pdf, images, pageCount: pdf.pageCount + images.pageCount };
}

export async function renderPageToPng(loaded: LoadedDoc, pageNum: number, dpi = 200): Promise<{ dataUrl: string; mediaType: string }> {
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
  const page = loaded.doc.loadPage(pageNum);
  const scale = dpi / 72;
  const matrix: mupdf.Matrix = [scale, 0, 0, scale, 0, 0];
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();
  pixmap.destroy();
  page.destroy();
  return { dataUrl: bytesToDataUrl(png, 'image/png'), mediaType: 'image/png' };
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mediaType};base64,${btoa(bin)}`;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
