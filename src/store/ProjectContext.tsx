import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PageResult, Status } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  pages: PageResult[];
  currentPageNum: number;
  selectedPages: Set<number>;
  setProject: (args: { doc: LoadedDoc; fileHash: string; fileName: string; restored: PageResult[] }) => void;
  resetProject: () => void;
  setPage: (page: PageResult) => void;
  setPageStatus: (pageNum: number, status: Status, extra?: Partial<PageResult>) => void;
  setCurrentPageNum: (n: number) => void;
  togglePageSelected: (n: number) => void;
  clearSelection: () => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPageNum, setCurrentPageNum] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());

  const ctx: Ctx = useMemo(() => ({
    loadedDoc,
    fileHash,
    fileName,
    pages,
    currentPageNum,
    selectedPages,
    setProject: ({ doc, fileHash, fileName, restored }) => {
      setLoadedDoc(doc);
      setFileHash(fileHash);
      setFileName(fileName);
      const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
        const found = restored.find((r) => r.pageNum === i);
        return found ?? { pageNum: i, text: '', status: 'pending' as Status };
      });
      setPages(init);
      setCurrentPageNum(0);
      setSelectedPages(new Set());
    },
    resetProject: () => {
      setLoadedDoc(null);
      setFileHash('');
      setFileName('');
      setPages([]);
      setCurrentPageNum(0);
      setSelectedPages(new Set());
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
  }), [loadedDoc, fileHash, fileName, pages, currentPageNum, selectedPages]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
