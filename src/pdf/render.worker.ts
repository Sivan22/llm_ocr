/// <reference lib="webworker" />
// PDF rendering worker. Owns all MuPDF state so the main thread stays free
// even when many thumbnails request renders during scrolling.
import * as mupdf from 'mupdf';

export interface OpenReq {
  type: 'open';
  requestId: number;
  docId: string;
  bytes: Uint8Array;
}

export interface RenderReq {
  type: 'render';
  requestId: number;
  docId: string;
  pageNum: number;
  dpi: number;
}

export interface CloseReq {
  type: 'close';
  requestId: number;
  docId: string;
}

export type WorkerReq = OpenReq | RenderReq | CloseReq;

export interface OpenResp { type: 'open-ok'; requestId: number; pageCount: number }
export interface RenderResp { type: 'render-ok'; requestId: number; dataUrl: string; mediaType: string }
export interface CloseResp { type: 'close-ok'; requestId: number }
export interface ErrorResp { type: 'error'; requestId: number; error: string }
export type WorkerResp = OpenResp | RenderResp | CloseResp | ErrorResp;

const docs = new Map<string, mupdf.PDFDocument>();

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return `data:${mediaType};base64,${btoa(bin)}`;
}

function handleOpen(msg: OpenReq): WorkerResp {
  const doc = mupdf.Document.openDocument(msg.bytes, 'application/pdf');
  const pdf = doc.asPDF();
  if (!pdf) return { type: 'error', requestId: msg.requestId, error: 'Failed to open PDF' };
  docs.set(msg.docId, pdf);
  return { type: 'open-ok', requestId: msg.requestId, pageCount: pdf.countPages() };
}

function handleRender(msg: RenderReq): WorkerResp {
  const pdf = docs.get(msg.docId);
  if (!pdf) return { type: 'error', requestId: msg.requestId, error: `Unknown docId: ${msg.docId}` };
  const page = pdf.loadPage(msg.pageNum);
  try {
    const scale = msg.dpi / 72;
    const matrix: mupdf.Matrix = [scale, 0, 0, scale, 0, 0];
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const png = pixmap.asPNG();
      return {
        type: 'render-ok',
        requestId: msg.requestId,
        dataUrl: bytesToDataUrl(png, 'image/png'),
        mediaType: 'image/png',
      };
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

function handleClose(msg: CloseReq): WorkerResp {
  const pdf = docs.get(msg.docId);
  if (pdf) {
    try { pdf.destroy(); } catch { /* ignore */ }
    docs.delete(msg.docId);
  }
  return { type: 'close-ok', requestId: msg.requestId };
}

self.onmessage = (e: MessageEvent<WorkerReq>) => {
  const msg = e.data;
  try {
    let resp: WorkerResp;
    if (msg.type === 'open') resp = handleOpen(msg);
    else if (msg.type === 'render') resp = handleRender(msg);
    else if (msg.type === 'close') resp = handleClose(msg);
    else resp = { type: 'error', requestId: (msg as { requestId: number }).requestId, error: 'Unknown request type' };
    (self as unknown as Worker).postMessage(resp);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      requestId: msg.requestId,
      error: err instanceof Error ? err.message : String(err),
    } as ErrorResp);
  }
};
