// src/store/ProjectContext.tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageResult, Status, Correction } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';
import { combine, imagesAsDoc, openPdf, readFileBytes } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadCorrections, saveCorrections } from './correctionsStore';
import { rekeyJob, pruneJobs, updateJobPageOrder } from './jobs';
import { concatBytes } from '../lib/bytes';
import { applyMove, sanitizePageOrder } from '../lib/pageOrder';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  bytes: Uint8Array | null;
  pages: PageResult[];
  pageOrder: number[];
  currentPageNum: number;
  selectedPages: Set<number>;
  selectionAnchor: number | null;
  corrections: Correction[];
  selectedCid: string | null;
  selectionTick: number;
  setProject: (args: {
    doc: LoadedDoc;
    fileHash: string;
    fileName: string;
    restored: PageResult[];
    bytes?: Uint8Array | null;
    pageOrder?: number[];
  }) => void;
  resetProject: () => void;
  setPage: (page: PageResult) => void;
  setPageStatus: (pageNum: number, status: Status, extra?: Partial<PageResult>) => void;
  setCurrentPageNum: (n: number) => void;
  togglePageSelected: (n: number) => void;
  setSelectedPages: (next: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  selectAllPages: () => void;
  setSelectionAnchor: (n: number | null) => void;
  clearSelection: () => void;
  setCorrections: (next: Correction[] | ((prev: Correction[]) => Correction[])) => void;
  selectCorrection: (cid: string | null) => void;
  appendFiles: (files: File[]) => Promise<{ appended: number; warning?: string }>;
  removePages: (nums: number[]) => void;
  movePages: (nums: number[], toIndex: number) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [pageOrder, setPageOrderState] = useState<number[]>([]);
  const [currentPageNum, setCurrentPageNumRaw] = useState<number>(0);
  const [selectedPages, setSelectedPagesState] = useState<Set<number>>(() => new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
  const [selectionTick, setSelectionTick] = useState<number>(0);

  const setCurrentPageNum = (n: number) => {
    setCurrentPageNumRaw(n);
    setSelectedCid(null);
  };

  const selectCorrection = (cid: string | null) => {
    setSelectedCid(cid);
    setSelectionTick((x) => x + 1);
  };

  const hydratingForKey = useRef<string>('');

  useEffect(() => {
    if (!fileHash) {
      setCorrections([]);
      return;
    }
    const key = `${fileHash}:${currentPageNum}`;
    hydratingForKey.current = key;
    let cancelled = false;
    loadCorrections(fileHash, currentPageNum).then((arr) => {
      if (cancelled) return;
      if (hydratingForKey.current !== key) return;
      setCorrections(arr);
    });
    return () => { cancelled = true; };
  }, [fileHash, currentPageNum]);

  useEffect(() => {
    if (!fileHash) return;
    const key = `${fileHash}:${currentPageNum}`;
    if (hydratingForKey.current === key) {
      hydratingForKey.current = '';
      return;
    }
    saveCorrections(fileHash, currentPageNum, corrections);
  }, [fileHash, currentPageNum, corrections]);

  const lastSavedOrderHash = useRef<string>('');
  useEffect(() => {
    if (!fileHash) { lastSavedOrderHash.current = ''; return; }
    const hash = `${fileHash}|${pageOrder.join(',')}`;
    if (lastSavedOrderHash.current === hash) return;
    lastSavedOrderHash.current = hash;
    updateJobPageOrder(fileHash, pageOrder).catch((err) => {
      console.warn('ProjectContext: updateJobPageOrder failed', err);
    });
  }, [fileHash, pageOrder]);

  const setProject: Ctx['setProject'] = ({ doc, fileHash, fileName, restored, bytes: nextBytes = null, pageOrder: restoredOrder }) => {
    setLoadedDoc(doc);
    setFileHash(fileHash);
    setFileName(fileName);
    setBytes(nextBytes);
    const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
      const found = restored.find((r) => r.pageNum === i);
      return found ?? { pageNum: i, text: '', status: 'pending' as Status };
    });
    setPages(init);
    const defaultOrder = Array.from({ length: doc.pageCount }, (_, i) => i);
    const validOrder = restoredOrder
      ? sanitizePageOrder(restoredOrder, doc.pageCount)
      : defaultOrder;
    setPageOrderState(validOrder);
    setCurrentPageNumRaw(validOrder[0] ?? 0);
    setSelectedPagesState(new Set());
    setSelectionAnchor(null);
    setSelectedCid(null);
  };

  const resetProject = () => {
    setLoadedDoc(null);
    setFileHash('');
    setFileName('');
    setBytes(null);
    setPages([]);
    setPageOrderState([]);
    setCurrentPageNumRaw(0);
    setSelectedPagesState(new Set());
    setSelectionAnchor(null);
    setSelectedCid(null);
  };

  const setSelectedPages: Ctx['setSelectedPages'] = (next) => {
    setSelectedPagesState((prev) => (typeof next === 'function' ? next(prev) : next));
  };

  const selectAllPages = () => {
    setSelectedPagesState(new Set(pageOrder));
  };

  const clearSelection = () => {
    setSelectedPagesState(new Set());
    setSelectionAnchor(null);
  };

  const togglePageSelected = (n: number) => {
    setSelectedPagesState((prev) => {
      const out = new Set(prev);
      if (out.has(n)) out.delete(n); else out.add(n);
      return out;
    });
  };

  const removePages: Ctx['removePages'] = (nums) => {
    if (nums.length === 0) return;
    const removed = new Set(nums);
    if (removed.has(currentPageNum)) {
      const oldIdx = pageOrder.indexOf(currentPageNum);
      const nextOrder = pageOrder.filter((n) => !removed.has(n));
      const newIdx = Math.min(Math.max(oldIdx, 0), nextOrder.length - 1);
      if (newIdx >= 0) setCurrentPageNumRaw(nextOrder[newIdx]);
    }
    setPageOrderState((prev) => prev.filter((n) => !removed.has(n)));
    setSelectedPagesState((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const n of prev) {
        if (removed.has(n)) { changed = true; continue; }
        next.add(n);
      }
      return changed ? next : prev;
    });
    setSelectionAnchor((a) => (a !== null && removed.has(a) ? null : a));
  };

  const movePages: Ctx['movePages'] = (nums, toIndex) => {
    if (nums.length === 0) return;
    setPageOrderState((prev) => applyMove(prev, nums, toIndex));
  };

  const appendFiles: Ctx['appendFiles'] = async (files) => {
    if (!loadedDoc || !bytes) {
      return { appended: 0, warning: 'append-disabled' };
    }
    if (loadedDoc.type === 'stored') {
      return { appended: 0, warning: 'append-disabled' };
    }

    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
    if (pdfFiles.length === 0 && imageFiles.length === 0) return { appended: 0 };
    if (pdfFiles.length > 1) return { appended: 0, warning: 'too-many-pdfs' };

    const addedBytes: Uint8Array[] = [];
    let addedDoc: LoadedDoc | null = null;
    if (pdfFiles.length === 1) {
      const pdfBytes = await readFileBytes(pdfFiles[0]);
      addedBytes.push(pdfBytes);
      addedDoc = await openPdf(pdfBytes);
    }
    if (imageFiles.length > 0) {
      const imgs = await Promise.all(imageFiles.map(async (f) => {
        const b = await readFileBytes(f);
        addedBytes.push(b);
        return { bytes: b, mediaType: f.type || 'image/png' };
      }));
      const imgDoc = imagesAsDoc(imgs);
      addedDoc = addedDoc ? combine(addedDoc, imgDoc) : imgDoc;
    }
    if (!addedDoc) return { appended: 0 };

    const oldHash = fileHash;
    const merged = concatBytes([bytes, ...addedBytes]);
    const newHash = await sha256(merged);
    const mergedDoc = combine(loadedDoc, addedDoc);
    const mergedName = `${fileName} + ${files.map((f) => f.name).join(' + ')}`;

    const appendedOrder = [
      ...pageOrder,
      ...Array.from({ length: addedDoc.pageCount }, (_, i) => loadedDoc.pageCount + i),
    ];

    await rekeyJob({ oldHash, newHash, fileName: mergedName, pageCount: mergedDoc.pageCount, pageOrder: appendedOrder });

    setProject({
      doc: mergedDoc,
      fileHash: newHash,
      fileName: mergedName,
      restored: pages.slice(),
      bytes: merged,
      pageOrder: appendedOrder,
    });

    await pruneJobs(20);
    return { appended: addedDoc.pageCount };
  };

  const ctx: Ctx = useMemo(() => ({
    loadedDoc,
    fileHash,
    fileName,
    bytes,
    pages,
    pageOrder,
    currentPageNum,
    selectedPages,
    selectionAnchor,
    corrections,
    selectedCid,
    selectionTick,
    setProject,
    resetProject,
    setPage: (p) => setPages((arr) => arr.map((x) => (x.pageNum === p.pageNum ? p : x))),
    setPageStatus: (n, status, extra) =>
      setPages((arr) => arr.map((x) => (x.pageNum === n ? { ...x, status, ...extra } : x))),
    setCurrentPageNum,
    togglePageSelected,
    setSelectedPages,
    selectAllPages,
    setSelectionAnchor,
    clearSelection,
    setCorrections,
    selectCorrection,
    appendFiles,
    removePages,
    movePages,
  }), [loadedDoc, fileHash, fileName, bytes, pages, pageOrder, currentPageNum, selectedPages, selectionAnchor, corrections, selectedCid, selectionTick]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

