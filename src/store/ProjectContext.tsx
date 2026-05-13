// src/store/ProjectContext.tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageResult, Status, Correction } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';
import { combine, imagesAsDoc, openPdf, readFileBytes } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadCorrections, saveCorrections } from './correctionsStore';
import { rekeyJob, pruneJobs } from './jobs';
import { concatBytes } from '../lib/bytes';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  bytes: Uint8Array | null;
  pages: PageResult[];
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
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<PageResult[]>([]);
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

  const setProject: Ctx['setProject'] = ({ doc, fileHash, fileName, restored, bytes: nextBytes = null }) => {
    setLoadedDoc(doc);
    setFileHash(fileHash);
    setFileName(fileName);
    setBytes(nextBytes);
    const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
      const found = restored.find((r) => r.pageNum === i);
      return found ?? { pageNum: i, text: '', status: 'pending' as Status };
    });
    setPages(init);
    setCurrentPageNumRaw(0);
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
    setCurrentPageNumRaw(0);
    setSelectedPagesState(new Set());
    setSelectionAnchor(null);
    setSelectedCid(null);
  };

  const setSelectedPages: Ctx['setSelectedPages'] = (next) => {
    setSelectedPagesState((prev) => (typeof next === 'function' ? next(prev) : next));
  };

  const selectAllPages = () => {
    setSelectedPagesState(new Set(pages.map((p) => p.pageNum)));
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

    await rekeyJob({ oldHash, newHash, fileName: mergedName, pageCount: mergedDoc.pageCount });

    setProject({
      doc: mergedDoc,
      fileHash: newHash,
      fileName: mergedName,
      restored: pages.slice(),
      bytes: merged,
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
  }), [loadedDoc, fileHash, fileName, bytes, pages, currentPageNum, selectedPages, selectionAnchor, corrections, selectedCid, selectionTick]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

