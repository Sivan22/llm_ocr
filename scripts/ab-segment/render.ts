import * as mupdf from 'mupdf';

export interface RenderDoc {
  pdf: mupdf.PDFDocument;
  count: number;
}

export function openDoc(bytes: Uint8Array): RenderDoc {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const pdf = doc.asPDF();
  if (!pdf) throw new Error('Failed to open PDF (not a PDF or password-protected).');
  return { pdf, count: pdf.countPages() };
}

// pageIndex is 0-indexed. Returns PNG bytes.
export function renderPage(doc: RenderDoc, pageIndex: number, dpi: number): Uint8Array {
  const page = doc.pdf.loadPage(pageIndex);
  try {
    const scale = dpi / 72;
    const matrix: mupdf.Matrix = [scale, 0, 0, scale, 0, 0];
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      return pixmap.asPNG();
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}
