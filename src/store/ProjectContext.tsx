import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageResult, Status, Correction } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';
import { loadCorrections, saveCorrections } from './correctionsStore';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  pages: PageResult[];
  currentPageNum: number;
  selectedPages: Set<number>;
  corrections: Correction[];
  selectedCid: string | null;
  selectionTick: number;
  setProject: (args: { doc: LoadedDoc; fileHash: string; fileName: string; restored: PageResult[] }) => void;
  resetProject: () => void;
  setPage: (page: PageResult) => void;
  setPageStatus: (pageNum: number, status: Status, extra?: Partial<PageResult>) => void;
  setCurrentPageNum: (n: number) => void;
  togglePageSelected: (n: number) => void;
  clearSelection: () => void;
  setCorrections: (next: Correction[] | ((prev: Correction[]) => Correction[])) => void;
  selectCorrection: (cid: string | null) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPageNum, setCurrentPageNumRaw] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
  const [selectionTick, setSelectionTick] = useState<number>(0);

  const setCurrentPageNum = (n: number) => {
    setCurrentPageNumRaw(n);
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
      // First write after hydrate marks hydration done.
      hydratingForKey.current = '';
      return;
    }
    const t = setTimeout(() => {
      saveCorrections(fileHash, currentPageNum, corrections);
    }, 200);
    return () => clearTimeout(t);
  }, [fileHash, currentPageNum, corrections]);

  const ctx: Ctx = useMemo(() => ({
    loadedDoc,
    fileHash,
    fileName,
    pages,
    currentPageNum,
    selectedPages,
    corrections,
    selectedCid,
    selectionTick,
    setProject: ({ doc, fileHash, fileName, restored }) => {
      setLoadedDoc(doc);
      setFileHash(fileHash);
      setFileName(fileName);
      const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
        const found = restored.find((r) => r.pageNum === i);
        return found ?? { pageNum: i, text: '', status: 'pending' as Status };
      });
      setPages(init);
      setCurrentPageNumRaw(0);
      setSelectedPages(new Set());
      setSelectedCid(null);
    },
    resetProject: () => {
      setLoadedDoc(null);
      setFileHash('');
      setFileName('');
      setPages([]);
      setCurrentPageNumRaw(0);
      setSelectedPages(new Set());
      setSelectedCid(null);
    },
    setPage: (p) => setPages((arr) => arr.map((x) => (x.pageNum === p.pageNum ? p : x))),
    setPageStatus: (n, status, extra) =>
      setPages((arr) => arr.map((x) => (x.pageNum === n ? { ...x, status, ...extra } : x))),
    setCurrentPageNum,
    togglePageSelected: (n) => setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    }),
    clearSelection: () => setSelectedPages(new Set()),
    setCorrections,
    selectCorrection,
  }), [loadedDoc, fileHash, fileName, pages, currentPageNum, selectedPages, corrections, selectedCid, selectionTick]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
