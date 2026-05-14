// Main-thread client for the PDF render worker. Lazy-spawns a single worker
// and exposes a promise-based API. Render work runs off the main thread so
// thumbnail scrolling stays smooth.
import type { WorkerReq, WorkerResp } from './render.worker';

type PendingResolve = (value: WorkerResp) => void;

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingResolve>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResp>) => {
    const resp = e.data;
    const resolve = pending.get(resp.requestId);
    if (!resolve) return;
    pending.delete(resp.requestId);
    resolve(resp);
  };
  worker.onerror = (e) => {
    const err = `PDF render worker error: ${e.message}`;
    for (const [id, resolve] of pending) {
      resolve({ type: 'error', requestId: id, error: err });
    }
    pending.clear();
  };
  return worker;
}

function send(msg: WorkerReq): Promise<WorkerResp> {
  return new Promise((resolve) => {
    pending.set(msg.requestId, resolve);
    getWorker().postMessage(msg);
  });
}

let nextDocId = 1;

export async function openPdfInWorker(bytes: Uint8Array): Promise<{ docId: string; pageCount: number }> {
  const docId = `pdf-${nextDocId++}`;
  const resp = await send({ type: 'open', requestId: nextRequestId++, docId, bytes });
  if (resp.type === 'error') throw new Error(resp.error);
  if (resp.type !== 'open-ok') throw new Error(`Unexpected response: ${resp.type}`);
  return { docId, pageCount: resp.pageCount };
}

export async function renderPdfInWorker(
  docId: string,
  pageNum: number,
  dpi: number,
): Promise<{ dataUrl: string; mediaType: string }> {
  const resp = await send({ type: 'render', requestId: nextRequestId++, docId, pageNum, dpi });
  if (resp.type === 'error') throw new Error(resp.error);
  if (resp.type !== 'render-ok') throw new Error(`Unexpected response: ${resp.type}`);
  return { dataUrl: resp.dataUrl, mediaType: resp.mediaType };
}

export async function closePdfInWorker(docId: string): Promise<void> {
  await send({ type: 'close', requestId: nextRequestId++, docId });
}
