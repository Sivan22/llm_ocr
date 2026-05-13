# OCR Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the OCR tab so settings collapse, the drop/upload area is the whole region (no inner button) and supports appending more files, pages render as thumbnails with a Grid/List/Compact view picker, selection uses file-explorer semantics (plain/Ctrl/Shift + double-click-to-open), and the page-range field accepts printer-style ranges.

**Architecture:**
- Pure-function additions (`src/lib/pageRange.ts`) and store changes (`rekeyJob` in `src/store/jobs.ts`, `combine()` widening in `src/pdf/render.ts`) are TDD'd against the existing vitest + fake-indexeddb setup.
- `ProjectContext` gains `bytes` / `selectionAnchor` / `setSelectedPages` / `selectAllPages` / `appendFiles`.
- `BatchRunner.tsx` splits into a `useBatchRunner` hook + a `BatchRunnerProvider` that `RunToolbar.tsx` and `RunLog.tsx` consume.
- `FileDrop.tsx`/`PageList.tsx` are replaced by `DropStrip.tsx`, `PageThumbs.tsx`, and `PageThumb.tsx`. `SettingsPanel` keeps its current code but renders inside a new `CollapsibleSettings.tsx`.
- Spec: `docs/superpowers/specs/2026-05-13-ocr-tab-redesign-design.md` is the single source of truth.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, jsdom, fake-indexeddb, idb, Tailwind, mupdf.

---

## File map

**Create**
- `src/lib/pageRange.ts`
- `src/lib/pageRange.test.ts`
- `src/components/DropStrip.tsx`
- `src/components/CollapsibleSettings.tsx`
- `src/components/RunToolbar.tsx`
- `src/components/RunLog.tsx`
- `src/components/PageThumb.tsx`
- `src/components/PageThumbs.tsx`
- `src/hooks/useBatchRunner.tsx`
- `src/pdf/render.test.ts` (extends existing tests; create if missing)

**Modify**
- `src/pdf/render.ts` — widen `combine()` to accept any `LoadedDoc` on either side, flatten to a single `CombinedDoc`. Update tests.
- `src/store/jobs.ts` — add `rekeyJob`.
- `src/store/jobs.test.ts` — add `rekeyJob` tests.
- `src/store/ProjectContext.tsx` — add `bytes`, `selectionAnchor`, `setSelectedPages`, `selectAllPages`, `appendFiles`; extend `setProject` signature.
- `src/i18n/translations.ts` — add new strings, remove unused ones.
- `src/App.tsx` — replace `<FileDrop /><BatchRunner /><PageList />` with the new components, wrap OCR tab in `<BatchRunnerProvider>`.

**Delete**
- `src/components/FileDrop.tsx`
- `src/components/BatchRunner.tsx`
- `src/components/PageList.tsx`

---

## Task 1: Page-range parser

**Files:**
- Create: `src/lib/pageRange.ts`
- Test: `src/lib/pageRange.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pageRange.test.ts
import { describe, it, expect } from 'vitest';
import { parsePageRange } from './pageRange';

describe('parsePageRange', () => {
  it('empty input -> empty array, no error', () => {
    expect(parsePageRange('', 10)).toEqual({ pages: [], error: null });
    expect(parsePageRange('   ', 10)).toEqual({ pages: [], error: null });
  });

  it('single integer is parsed as 0-based', () => {
    expect(parsePageRange('5', 10)).toEqual({ pages: [4], error: null });
  });

  it('simple ranges, inclusive both ends', () => {
    expect(parsePageRange('1-3', 10)).toEqual({ pages: [0, 1, 2], error: null });
    expect(parsePageRange('7-9', 10)).toEqual({ pages: [6, 7, 8], error: null });
  });

  it('reversed ranges are normalized', () => {
    expect(parsePageRange('9-7', 10)).toEqual({ pages: [6, 7, 8], error: null });
  });

  it('open-ended ranges', () => {
    expect(parsePageRange('-3', 10)).toEqual({ pages: [0, 1, 2], error: null });
    expect(parsePageRange('8-', 10)).toEqual({ pages: [7, 8, 9], error: null });
  });

  it('mixed tokens, comma- and whitespace-separated, sorted and deduped', () => {
    expect(parsePageRange('1-3, 5 7-9,12', 12)).toEqual({
      pages: [0, 1, 2, 4, 6, 7, 8, 11],
      error: null,
    });
  });

  it('overlapping tokens dedupe', () => {
    expect(parsePageRange('1-3, 2-4', 10)).toEqual({ pages: [0, 1, 2, 3], error: null });
  });

  it('out-of-bounds numbers clamp to [1, pageCount]', () => {
    expect(parsePageRange('0, 50-60', 10)).toEqual({ pages: [0, 9], error: null });
  });

  it('malformed input returns an error and empty pages', () => {
    expect(parsePageRange('1-a', 10)).toEqual({ pages: [], error: 'parse' });
    expect(parsePageRange('!!', 10)).toEqual({ pages: [], error: 'parse' });
  });

  it('pageCount of 0 yields empty result even for valid-looking input', () => {
    expect(parsePageRange('1-3', 0)).toEqual({ pages: [], error: null });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `pnpm vitest run src/lib/pageRange.test.ts`
Expected: FAIL with "Cannot find module './pageRange'".

- [ ] **Step 3: Implement `parsePageRange`**

```ts
// src/lib/pageRange.ts
export interface ParsePageRangeResult {
  pages: number[];        // sorted, deduped, 0-based, in [0, pageCount-1]
  error: 'parse' | null;
}

const TOKEN = /^\s*(\d*)\s*-\s*(\d*)\s*$|^\s*(\d+)\s*$/;

export function parsePageRange(input: string, pageCount: number): ParsePageRangeResult {
  const trimmed = input.trim();
  if (trimmed === '' || pageCount <= 0) return { pages: [], error: null };

  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const set = new Set<number>();

  for (const tok of tokens) {
    const m = tok.match(TOKEN);
    if (!m) return { pages: [], error: 'parse' };

    let aRaw: string | undefined;
    let bRaw: string | undefined;
    let isRange = false;
    if (m[3] !== undefined) {
      // bare integer
      aRaw = m[3];
      bRaw = m[3];
    } else {
      isRange = true;
      aRaw = m[1] || '';
      bRaw = m[2] || '';
      if (aRaw === '' && bRaw === '') return { pages: [], error: 'parse' };
    }

    const aOneBased = aRaw === '' ? 1 : Number(aRaw);
    const bOneBased = bRaw === '' ? pageCount : Number(bRaw);
    if (!Number.isFinite(aOneBased) || !Number.isFinite(bOneBased)) {
      return { pages: [], error: 'parse' };
    }

    const lo = Math.max(1, Math.min(aOneBased, bOneBased));
    const hi = Math.min(pageCount, Math.max(aOneBased, bOneBased));
    if (lo > pageCount || hi < 1) continue;
    for (let i = lo; i <= hi; i++) set.add(i - 1);
    // `isRange` is intentionally unused after parsing — bare integers and ranges
    // produce the same result through the lo/hi loop. Keep the flag so future
    // edits can distinguish them without re-deriving from the regex.
    void isRange;
  }

  return { pages: [...set].sort((a, b) => a - b), error: null };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm vitest run src/lib/pageRange.test.ts`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageRange.ts src/lib/pageRange.test.ts
git commit -m "feat(page-range): printer-style range parser"
```

---

## Task 2: Widen `combine()` to accept any `LoadedDoc`

**Why:** Append builds a new `LoadedDoc` from incoming files and merges it onto whatever's already loaded. The old `combine(PdfDoc, ImageDoc)` signature can't handle `combined + images`, `images + images`, etc.

**Files:**
- Modify: `src/pdf/render.ts`
- Test: `src/pdf/render.test.ts` (new file)

- [ ] **Step 1: Write the failing tests**

```ts
// src/pdf/render.test.ts
import { describe, it, expect } from 'vitest';
import { combine, imagesAsDoc, type ImageDoc, type CombinedDoc, type PdfDoc } from './render';

function fakePdf(pageCount: number): PdfDoc {
  // We never actually render in these tests — combine() only inspects pageCount and shape.
  return { type: 'pdf', doc: {} as unknown as PdfDoc['doc'], pageCount };
}

function imgDoc(n: number): ImageDoc {
  return imagesAsDoc(Array.from({ length: n }, (_, i) => ({
    bytes: new Uint8Array([i]),
    mediaType: 'image/png',
  })));
}

describe('combine()', () => {
  it('pdf + images -> combined with pdf pages first', () => {
    const out = combine(fakePdf(3), imgDoc(2));
    expect(out.type).toBe('combined');
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(3);
    expect(out.images.pageCount).toBe(2);
  });

  it('images + images -> combined with empty pdf and concatenated images', () => {
    const out = combine(imgDoc(2), imgDoc(3));
    expect(out.type).toBe('combined');
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(0);
    expect(out.images.pageCount).toBe(5);
  });

  it('combined + images flattens, preserving order', () => {
    const base = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const out = combine(base, imgDoc(2));
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('images + combined flattens, preserving order', () => {
    const base = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const out = combine(imgDoc(2), base);
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('combined + combined merges into one combined', () => {
    const a = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const b = combine(fakePdf(0), imgDoc(2)) as CombinedDoc;
    const out = combine(a, b);
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('refuses to combine when both sides have non-empty pdf', () => {
    expect(() => combine(fakePdf(2), fakePdf(3))).toThrow(/two pdf/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `pnpm vitest run src/pdf/render.test.ts`
Expected: FAIL on the new shapes (`images + images`, `combined + images`, etc.) because the old `combine()` only accepts `(PdfDoc, ImageDoc)`.

- [ ] **Step 3: Widen the implementation**

Replace the existing `combine` (lines 56–58 of `src/pdf/render.ts`) with:

```ts
// src/pdf/render.ts
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
    : { type: 'pdf', doc: {} as unknown as PdfDoc['doc'], pageCount: 0 };

  const imgs: { dataUrl: string; mediaType: string }[] = [
    ...(leftImgs?.pages ?? []),
    ...(rightImgs?.pages ?? []),
  ];
  const images: ImageDoc = { type: 'images', pages: imgs, pageCount: imgs.length };

  return { type: 'combined', pdf, images, pageCount: pdf.pageCount + images.pageCount };
}
```

Also update `renderPageToPng` so the synthetic empty `PdfDoc` is never asked to render: it has `pageCount: 0` so the `pageNum < loaded.pdf.pageCount` branch is skipped — no further change needed.

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm vitest run src/pdf/render.test.ts`
Expected: PASS, 6 green.

- [ ] **Step 5: Commit**

```bash
git add src/pdf/render.ts src/pdf/render.test.ts
git commit -m "feat(render): widen combine() to merge any two LoadedDocs"
```

---

## Task 3: `rekeyJob` — atomic IDB prefix rewrite for append

**Files:**
- Modify: `src/store/jobs.ts`
- Test: `src/store/jobs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/jobs.test.ts`:

```ts
import { rekeyJob } from './jobs';
import { savePageImage, loadPageImage } from './pageImagesStore';

describe('rekeyJob', () => {
  beforeEach(reset);

  it('moves pageResults, corrections, pageImages from oldHash to newHash and updates the Job row', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'one', status: 'ok' });
    await savePageResult(A, { pageNum: 1, text: 'two', status: 'edited' });
    await saveCorrections(A, 0, [{ id: 'c1', old: 'a', new: 'b', reason: 'r', status: 'pending' }]);
    await savePageImage(A, 0, { dataUrl: 'data:image/png;base64,AAA', mediaType: 'image/png' });

    await rekeyJob({ oldHash: A, newHash: B, fileName: 'a+b.pdf', pageCount: 5 });

    // Old hash is empty.
    expect(await loadAllPageResults(A)).toEqual([]);
    expect(await loadCorrections(A, 0)).toEqual([]);
    expect(await loadPageImage(A, 0)).toBeUndefined();
    expect(await getJob(A)).toBeUndefined();

    // New hash has everything.
    const restored = await loadAllPageResults(B);
    expect(restored.map((p) => p.pageNum)).toEqual([0, 1]);
    expect((await loadCorrections(B, 0)).length).toBe(1);
    expect((await loadPageImage(B, 0))?.dataUrl).toContain('AAA');
    const nj = await getJob(B);
    expect(nj?.fileName).toBe('a+b.pdf');
    expect(nj?.pageCount).toBe(5);
  });

  it('is a no-op when oldHash === newHash, only updating fileName/pageCount/lastOpenedAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'one', status: 'ok' });

    await rekeyJob({ oldHash: A, newHash: A, fileName: 'a-renamed.pdf', pageCount: 3 });

    const j = await getJob(A);
    expect(j?.fileName).toBe('a-renamed.pdf');
    expect(j?.pageCount).toBe(3);
    expect((await loadAllPageResults(A)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `pnpm vitest run src/store/jobs.test.ts`
Expected: FAIL with "rekeyJob is not exported".

- [ ] **Step 3: Implement `rekeyJob`**

Add to the bottom of `src/store/jobs.ts`:

```ts
export interface RekeyJobInput {
  oldHash: string;
  newHash: string;
  fileName: string;
  pageCount: number;
}

export async function rekeyJob(input: RekeyJobInput): Promise<JobRecord> {
  const { oldHash, newHash, fileName, pageCount } = input;
  const d = await db();
  const now = Date.now();

  if (oldHash === newHash) {
    const prev = (await d.get(STORE_JOBS, oldHash)) as JobRecord | undefined;
    const next: JobRecord = {
      fileHash: oldHash,
      fileName,
      pageCount,
      createdAt: prev?.createdAt ?? now,
      lastOpenedAt: now,
    };
    await d.put(STORE_JOBS, next, oldHash);
    return next;
  }

  const tx = d.transaction(
    [STORE_JOBS, STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES],
    'readwrite',
  );

  const jobsStore = tx.objectStore(STORE_JOBS);
  const prev = (await jobsStore.get(oldHash)) as JobRecord | undefined;

  for (const store of [STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES] as const) {
    const os = tx.objectStore(store);
    let cur = await os.openCursor(pageRangeFor(oldHash));
    while (cur) {
      const oldKey = cur.key as string;
      const suffix = oldKey.slice(oldHash.length + 1); // strip "oldHash:"
      const newKey = `${newHash}:${suffix}`;
      await os.put(cur.value, newKey);
      await cur.delete();
      cur = await cur.continue();
    }
  }

  const next: JobRecord = {
    fileHash: newHash,
    fileName,
    pageCount,
    createdAt: prev?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await jobsStore.put(next, newHash);
  await jobsStore.delete(oldHash);
  await tx.done;

  return next;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm vitest run src/store/jobs.test.ts`
Expected: PASS, including both new `rekeyJob` cases.

- [ ] **Step 5: Commit**

```bash
git add src/store/jobs.ts src/store/jobs.test.ts
git commit -m "feat(jobs): rekeyJob atomically rewrites IDB prefixes for append"
```

---

## Task 4: `ProjectContext` — bytes / selection anchor / append

**Files:**
- Modify: `src/store/ProjectContext.tsx`

- [ ] **Step 1: Extend the context interface and reducer state**

Replace the contents of `src/store/ProjectContext.tsx` with the version below (the change is additive: new `bytes`, `selectionAnchor`, `setSelectedPages`, `selectAllPages`, `appendFiles`; existing fields and effects preserved).

```tsx
// src/store/ProjectContext.tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageResult, Status, Correction } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';
import { combine, imagesAsDoc, openPdf, readFileBytes } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadCorrections, saveCorrections } from './correctionsStore';
import { rekeyJob, pruneJobs } from './jobs';

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

function concatBytes(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
```

- [ ] **Step 2: Type-check the workspace**

Run: `pnpm tsc --noEmit`
Expected: no errors related to `ProjectContext.tsx`. (Existing consumers — `FileDrop.tsx`, `BatchRunner.tsx`, etc. — won't reference the new fields yet and will still type-check.)

- [ ] **Step 3: Run the existing test suite to confirm nothing regressed**

Run: `pnpm vitest run`
Expected: all pre-existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/store/ProjectContext.tsx
git commit -m "feat(project): track bytes/selectionAnchor + appendFiles helper"
```

---

## Task 5: `useBatchRunner` hook + provider

**Why:** `RunToolbar` and `RunLog` are separate components but share the same run state (running flag, log, abort controller). Lifting that state to a small provider is the simplest fix.

**Files:**
- Create: `src/hooks/useBatchRunner.tsx`

- [ ] **Step 1: Write the hook + provider**

```tsx
// src/hooks/useBatchRunner.tsx
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import { runBatch } from '../runner/orchestrator';

interface BatchRunnerApi {
  running: boolean;
  log: string[];
  startAll: () => void;
  retryFailed: () => void;
  runRange: (pageNums: number[]) => void;
  runSelected: () => void;
  stop: () => void;
  eligibleCount: number;
  failedCount: number;
}

const Ctx = createContext<BatchRunnerApi | null>(null);

export function BatchRunnerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const { loadedDoc, fileHash, pages, setPageStatus, setPage, selectedPages } = useProject();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const append = (m: string) => setLog((l) => [...l, m]);

  // `Start all` skips pages that are `ok` or `edited` so user edits aren't overwritten.
  const eligible = pages.filter((p) => p.status === 'pending' || p.status === 'error').map((p) => p.pageNum);
  const failed = pages.filter((p) => p.status === 'error').map((p) => p.pageNum);

  const start = async (pageNums: number[]) => {
    if (!loadedDoc || pageNums.length === 0 || running) return;
    let model;
    try { model = createModel(settings); }
    catch (e) {
      append(t('batch.errorPrefix', { msg: e instanceof Error ? e.message : String(e) }));
      return;
    }
    setRunning(true);
    abortRef.current = new AbortController();
    const processed = new Set<number>();
    for (const n of pageNums) setPageStatus(n, 'running');
    await runBatch({
      items: pageNums,
      concurrency: settings.batchSize,
      signal: abortRef.current.signal,
      work: async (n, sig) => {
        const img = await renderPageToPng(loadedDoc, n);
        savePageImage(fileHash, n, img);
        const r = await ocrPage(model, img.dataUrl, settings.prompts.ocr, sig);
        return { ok: true as const, value: r };
      },
      onProgress: (e) => {
        processed.add(e.item);
        if (e.ok && e.value) {
          const result = { pageNum: e.item, text: e.value.text, status: 'ok' as const, tokensIn: e.value.tokensIn, tokensOut: e.value.tokensOut };
          setPage(result);
          savePageResult(fileHash, result);
          append(t('batch.pageOk', { n: e.item + 1, chars: e.value.text.length }));
        } else {
          const result = { pageNum: e.item, text: '', status: 'error' as const, error: e.error };
          setPage(result);
          savePageResult(fileHash, result);
          append(t('batch.pageFailed', { n: e.item + 1, err: e.error ?? '' }));
        }
      },
    });
    for (const n of pageNums) {
      if (!processed.has(n)) setPageStatus(n, 'pending');
    }
    setRunning(false);
    abortRef.current = null;
  };

  const api: BatchRunnerApi = useMemo(() => ({
    running,
    log,
    startAll: () => start(eligible),
    retryFailed: () => start(failed),
    runRange: (pageNums) => start(pageNums),
    runSelected: () => start([...selectedPages].sort((a, b) => a - b)),
    stop: () => abortRef.current?.abort(),
    eligibleCount: eligible.length,
    failedCount: failed.length,
  }), [running, log, eligible.length, failed.length, selectedPages, loadedDoc, fileHash]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBatchRunner(): BatchRunnerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBatchRunner must be used within BatchRunnerProvider');
  return v;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBatchRunner.tsx
git commit -m "feat(runner): extract useBatchRunner hook + provider"
```

---

## Task 6: `DropStrip` component

**Files:**
- Create: `src/components/DropStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/DropStrip.tsx
import { useCallback, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { openPdf, imagesAsDoc, combine, readFileBytes, type LoadedDoc } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadAllPageResults } from '../store/persistence';
import { upsertJob, pruneJobs } from '../store/jobs';
import { savePageImage } from '../store/pageImagesStore';
import { cn } from '../lib/utils';

export function DropStrip() {
  const { setProject, loadedDoc, fileHash, fileName, bytes, pages, resetProject, appendFiles } = useProject();
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 3000);
  };

  const replaceProject = useCallback(async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    try {
      const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
      if (pdfFiles.length > 1) throw new Error(t('file.errorMixed'));

      const combinedBytes: Uint8Array[] = [];
      let doc: LoadedDoc | null = null;
      const displayName = files.map((f) => f.name).join(' + ');

      if (pdfFiles.length === 1) {
        const pb = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(pb);
        doc = await openPdf(pb);
      }
      if (imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.map(async (f) => {
          const b = await readFileBytes(f);
          combinedBytes.push(b);
          return { bytes: b, mediaType: f.type || 'image/png' };
        }));
        const imgDoc = imagesAsDoc(imgs);
        doc = doc ? combine(doc, imgDoc) : imgDoc;
      }
      if (!doc) throw new Error(t('file.errorMixed'));

      const concat = concatBytes(combinedBytes);
      const newHash = await sha256(concat);
      const restored = await loadAllPageResults(newHash);
      setProject({ doc, fileHash: newHash, fileName: displayName, restored, bytes: concat });

      try {
        await upsertJob({ fileHash: newHash, fileName: displayName, pageCount: doc.pageCount });
        await pruneJobs(20);
        if (doc.type === 'images') {
          await Promise.all(doc.pages.map((p, i) =>
            savePageImage(newHash, i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        } else if (doc.type === 'combined') {
          const offset = doc.pdf.pageCount;
          await Promise.all(doc.images.pages.map((p, i) =>
            savePageImage(newHash, offset + i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
          ));
        }
      } catch (err) {
        console.warn('DropStrip: job persistence failed', err);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setProject, t]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!loadedDoc) return replaceProject(files);
    if (loadedDoc.type === 'stored' || !bytes) {
      flashNotice(t('drop.disabledForStoredJob'));
      return;
    }
    setError(null);
    try {
      const { appended, warning } = await appendFiles(files);
      if (warning === 'too-many-pdfs') flashNotice(t('file.errorMixed'));
      else if (appended === 0 && warning) flashNotice(t('drop.disabledForStoredJob'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadedDoc, bytes, appendFiles, replaceProject, t]);

  const handleClick = () => inputRef.current?.click();
  const handleStartOver = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pages.some((p) => p.status === 'running')) {
      if (!window.confirm(t('drop.loaded.startOverConfirm'))) return;
    }
    resetProject();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const nDone = pages.filter((p) => p.status === 'ok' || p.status === 'edited').length;
  const nTodo = pages.filter((p) => p.status === 'pending').length;
  const nError = pages.filter((p) => p.status === 'error').length;

  // Empty state
  if (!loadedDoc) {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer select-none',
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
          )}
        >
          <p className="text-gray-700">{t('drop.empty.title')}</p>
          <p className="text-xs text-gray-500 mt-1">{t('drop.empty.hint')}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  // Loaded state
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border border-dashed rounded-md px-3 py-2 flex justify-between items-center gap-3 cursor-pointer select-none text-sm',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
        )}
      >
        <div className="truncate">
          <span className="font-medium">{fileName}</span>
          <span className="text-gray-500"> · {t('drop.loaded.summary.pages', { pages: loadedDoc.pageCount })}</span>
          {nDone   > 0 && <span className="text-gray-500"> · {t('drop.loaded.summary.done',  { n: nDone   })}</span>}
          {nTodo   > 0 && <span className="text-gray-500"> · {t('drop.loaded.summary.todo',  { n: nTodo   })}</span>}
          {nError  > 0 && <span className="text-red-600"> · {t('drop.loaded.summary.error', { n: nError  })}</span>}
        </div>
        <div className="flex items-center gap-3 text-gray-500 shrink-0">
          <span>{t('drop.loaded.appendHint')}</span>
          <button onClick={handleStartOver} className="text-red-600 underline-offset-2 hover:underline">
            {t('drop.loaded.startOver')}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
      />
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {notice && <p className="text-amber-700 text-sm mt-2">{notice}</p>}
    </div>
  );
}

function concatBytes(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors (the new translation keys are referenced — they'll be added in Task 11; for now the `t()` calls compile fine since `t` returns `string` for any key).

- [ ] **Step 3: Commit**

```bash
git add src/components/DropStrip.tsx
git commit -m "feat(drop): DropStrip with whole-area picker and append support"
```

---

## Task 7: `CollapsibleSettings`

**Files:**
- Create: `src/components/CollapsibleSettings.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/CollapsibleSettings.tsx
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { SettingsPanel } from './SettingsPanel';

const STORAGE_KEY = 'llm_ocr_web:ocrSettingsOpen:v1';

export function CollapsibleSettings() {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="border rounded-md"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {t('settings.toggle')}
      </summary>
      <div className="px-3 py-4 border-t">
        <SettingsPanel />
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CollapsibleSettings.tsx
git commit -m "feat(settings): collapsible Settings wrapper, persisted open state"
```

---

## Task 8: `PageThumb` — one tile with lazy image rendering

**Files:**
- Create: `src/components/PageThumb.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/PageThumb.tsx
import { useEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
import { loadPageImage, savePageImage } from '../store/pageImagesStore';
import { useI18n } from '../i18n/I18nContext';
import type { PageResult } from '../lib/types';
import { cn } from '../lib/utils';

export type ThumbMode = 'grid' | 'compact' | 'list';

interface Props {
  page: PageResult;
  mode: ThumbMode;
  selected: boolean;
  viewing: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

const STATUS_RING: Record<PageResult['status'], string> = {
  pending: 'ring-gray-300',
  running: 'ring-blue-400 animate-pulse',
  ok:      'ring-green-500',
  error:   'ring-red-500',
  edited:  'ring-amber-500',
};

const STATUS_BG: Record<PageResult['status'], string> = {
  pending: 'bg-gray-100',
  running: 'bg-blue-100',
  ok:      'bg-green-50',
  error:   'bg-red-50',
  edited:  'bg-amber-50',
};

export function PageThumb({ page, mode, selected, viewing, onClick, onDoubleClick }: Props) {
  const { loadedDoc, fileHash } = useProject();
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fileHash) return;
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const tryLoad = async () => {
      const stored = await loadPageImage(fileHash, page.pageNum);
      if (cancelled) return;
      if (stored) { setSrc(stored.dataUrl); return; }
      if (!loadedDoc) return;
      if (loadedDoc.type === 'stored') { setMissing(true); return; }
      try {
        const img = await renderPageToPng(loadedDoc, page.pageNum);
        if (cancelled) return;
        setSrc(img.dataUrl);
        savePageImage(fileHash, page.pageNum, img).catch((err) => {
          console.warn('PageThumb: savePageImage failed', err);
        });
      } catch (err) {
        if (err instanceof MissingPageImageError) setMissing(true);
        else console.warn('PageThumb: render failed', err);
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      tryLoad();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          observer?.disconnect();
          tryLoad();
        }
      }, { rootMargin: '200px' });
      if (ref.current) observer.observe(ref.current);
    }

    return () => { cancelled = true; observer?.disconnect(); };
  }, [fileHash, loadedDoc, page.pageNum]);

  if (mode === 'list') {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          'flex items-center gap-3 px-2 py-1 rounded cursor-pointer select-none border',
          STATUS_BG[page.status],
          selected ? 'ring-2 ring-blue-600' : 'ring-0',
          viewing && !selected && 'ring-1 ring-gray-400',
        )}
      >
        <div className="w-10 h-14 bg-white border flex items-center justify-center overflow-hidden">
          {src
            ? <img src={src} alt="" className="object-cover w-full h-full" />
            : <span className="text-[10px] text-gray-400">{missing ? '×' : '…'}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono">{page.pageNum + 1}</div>
          <div className="text-xs text-gray-600 truncate" title={page.error ?? ''}>
            {t(`pages.status.${page.status}`)}
            {page.status === 'ok' && page.text ? ` · ${page.text.length} chars` : ''}
            {page.status === 'error' && page.error ? ` · ${page.error}` : ''}
          </div>
        </div>
      </div>
    );
  }

  const wrapperBase = mode === 'compact'
    ? 'aspect-[5/7] text-[10px]'
    : 'aspect-[5/7] text-xs';

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={page.error ?? t(`pages.status.${page.status}`)}
      className={cn(
        wrapperBase,
        'relative overflow-hidden rounded border cursor-pointer select-none',
        'ring-2',
        selected ? 'ring-blue-600' : viewing ? 'ring-gray-400' : STATUS_RING[page.status],
      )}
    >
      {src
        ? <img src={src} alt="" className="w-full h-full object-cover" />
        : <div className={cn('w-full h-full flex items-center justify-center', STATUS_BG[page.status])}>
            <span className="text-gray-500">{missing ? t('thumb.placeholderTooltip') : '…'}</span>
          </div>}
      <span className="absolute top-0 left-0 px-1 bg-white/80 font-mono">{page.pageNum + 1}</span>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PageThumb.tsx
git commit -m "feat(thumbs): PageThumb tile with lazy image rendering"
```

---

## Task 9: `PageThumbs` — container with view picker state & selection logic

**Files:**
- Create: `src/components/PageThumbs.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/PageThumbs.tsx
import { useEffect, useRef } from 'react';
import { useProject } from '../store/ProjectContext';
import { PageThumb, type ThumbMode } from './PageThumb';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'llm_ocr_web:pageView:v1';

function readMode(): ThumbMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'grid' || v === 'compact' || v === 'list') return v;
  } catch { /* ignore */ }
  return 'grid';
}

interface Props {
  mode: ThumbMode;
  onOpenPage: (pageNum: number) => void;
}

export function PageThumbs({ mode, onOpenPage }: Props) {
  const {
    pages,
    currentPageNum,
    selectedPages,
    selectionAnchor,
    togglePageSelected,
    setSelectedPages,
    setSelectionAnchor,
    selectAllPages,
    clearSelection,
  } = useProject();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (!node.contains(document.activeElement)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllPages();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectAllPages, clearSelection]);

  if (pages.length === 0) return null;

  const handleClick = (n: number, e: React.MouseEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (shift) {
      const anchor = selectionAnchor ?? n;
      const lo = Math.min(anchor, n);
      const hi = Math.max(anchor, n);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelectedPages(next);
      // Shift-click does NOT move the anchor.
      if (selectionAnchor === null) setSelectionAnchor(n);
      return;
    }
    if (meta) {
      togglePageSelected(n);
      setSelectionAnchor(n);
      return;
    }
    setSelectedPages(new Set([n]));
    setSelectionAnchor(n);
  };

  const handleDoubleClick = (n: number) => onOpenPage(n);

  const gridClass = mode === 'compact'
    ? 'grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-1'
    : mode === 'grid'
    ? 'grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2'
    : 'flex flex-col gap-1';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn('outline-none focus:ring-1 focus:ring-blue-200 rounded p-1 border max-h-[60vh] overflow-auto', gridClass)}
    >
      {pages.map((p) => (
        <PageThumb
          key={p.pageNum}
          page={p}
          mode={mode}
          selected={selectedPages.has(p.pageNum)}
          viewing={currentPageNum === p.pageNum}
          onClick={(e) => handleClick(p.pageNum, e)}
          onDoubleClick={() => handleDoubleClick(p.pageNum)}
        />
      ))}
    </div>
  );
}

export { readMode as readSavedThumbMode, STORAGE_KEY as THUMB_VIEW_STORAGE_KEY };
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PageThumbs.tsx
git commit -m "feat(thumbs): PageThumbs container with file-explorer selection"
```

---

## Task 10: `RunToolbar` — run controls + range field + view picker + selection bar

**Files:**
- Create: `src/components/RunToolbar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/RunToolbar.tsx
import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { useBatchRunner } from '../hooks/useBatchRunner';
import { parsePageRange } from '../lib/pageRange';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { ThumbMode } from './PageThumb';
import { THUMB_VIEW_STORAGE_KEY } from './PageThumbs';
import { cn } from '../lib/utils';

interface Props {
  mode: ThumbMode;
  onModeChange: (m: ThumbMode) => void;
}

export function RunToolbar({ mode, onModeChange }: Props) {
  const { t } = useI18n();
  const { loadedDoc, selectedPages, clearSelection, setSelectedPages, setSelectionAnchor } = useProject();
  const { running, startAll, retryFailed, runRange, runSelected, stop, eligibleCount, failedCount } = useBatchRunner();
  const [rangeInput, setRangeInput] = useState('');

  const totalPages = loadedDoc?.pageCount ?? 0;
  const { pages: rangePages, error: rangeError } = useMemo(
    () => parsePageRange(rangeInput, totalPages),
    [rangeInput, totalPages],
  );

  useEffect(() => {
    try { localStorage.setItem(THUMB_VIEW_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  if (!loadedDoc) return null;

  const setModePersist = (m: ThumbMode) => onModeChange(m);

  const highlight = () => {
    setSelectedPages(new Set(rangePages));
    if (rangePages.length > 0) setSelectionAnchor(rangePages[0]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startAll} disabled={running || eligibleCount === 0}>
          {t('batch.startAll', { n: eligibleCount })}
        </Button>
        <Button variant="outline" onClick={retryFailed} disabled={running || failedCount === 0}>
          {t('batch.retryFailed', { n: failedCount })}
        </Button>
        <Button variant="outline" onClick={stop} disabled={!running}>
          {t('batch.stop')}
        </Button>

        <span className="ms-2 text-sm text-gray-600">{t('batch.runPages')}</span>
        <Input
          type="text"
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          placeholder={t('batch.range.placeholder')}
          className="w-48"
        />
        <Button
          variant="outline"
          onClick={() => runRange(rangePages)}
          disabled={running || rangeError !== null || rangePages.length === 0}
        >
          {t('batch.runRange')}
        </Button>
        <Button
          variant="outline"
          onClick={highlight}
          disabled={rangeError !== null || rangePages.length === 0}
        >
          {t('batch.highlightInPreview')}
        </Button>

        <div className="ms-auto flex items-center gap-1">
          {(['grid', 'compact', 'list'] as ThumbMode[]).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              aria-pressed={mode === m}
              onClick={() => setModePersist(m)}
              className="px-2 py-1 text-xs"
            >
              {t(`view.${m}`)}
            </Button>
          ))}
        </div>
      </div>

      {rangeError && (
        <p className="text-xs text-red-600">{t('batch.range.invalid')}</p>
      )}

      {selectedPages.size > 0 && (
        <div className={cn('flex items-center gap-2 text-sm rounded px-2 py-1 bg-blue-50 border border-blue-200')}>
          <span className="text-blue-900">{t('batch.selectedBar', { n: selectedPages.size })}</span>
          <Button onClick={runSelected} disabled={running}>{t('batch.runSelected')}</Button>
          <Button variant="outline" onClick={clearSelection} disabled={running}>{t('batch.clearSelection')}</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RunToolbar.tsx
git commit -m "feat(runner): unified RunToolbar with printer-style range + view picker"
```

---

## Task 11: `RunLog` + i18n strings

**Files:**
- Create: `src/components/RunLog.tsx`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write `RunLog`**

```tsx
// src/components/RunLog.tsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useBatchRunner } from '../hooks/useBatchRunner';

export function RunLog() {
  const { t } = useI18n();
  const { log } = useBatchRunner();
  const [show, setShow] = useState(false);
  return (
    <div className="text-xs">
      <button className="text-blue-600 underline" onClick={() => setShow((s) => !s)}>
        {show ? t('batch.hideLog', { n: log.length }) : t('batch.showLog', { n: log.length })}
      </button>
      {show && (
        <pre className="bg-gray-50 border p-2 max-h-48 overflow-auto whitespace-pre-wrap mt-1">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add/remove i18n strings**

In `src/i18n/translations.ts`:

In the `en` dict, **remove** these lines (replaced by the new keys below):
```
  'file.dropHint': 'Drop a PDF or images here',
  'file.formatHint': 'PDF, PNG, JPG, WEBP — multi-file OK',
  'file.choose': 'Choose files',
  'pages.selectHint': 'Click a chip to add/remove it from the run selection.',
  'batch.runPages': 'Run pages',
  'batch.to': 'to',
  'batch.errorRange': 'ERROR: invalid range {from}-{to}',
```

**Add** these to the `en` dict:
```
  'drop.empty.title': 'Drop a PDF or images here',
  'drop.empty.hint': 'or click anywhere to choose · PDF, PNG, JPG, WEBP — multi-file OK',
  'drop.loaded.summary.pages': '{pages} pages',
  'drop.loaded.summary.done': '{n} done',
  'drop.loaded.summary.todo': '{n} to do',
  'drop.loaded.summary.error': '{n} error',
  'drop.loaded.appendHint': 'Drop or click to add more',
  'drop.loaded.startOver': 'Start over',
  'drop.loaded.startOverConfirm': 'Files are still running. Stop and start over?',
  'drop.disabledForStoredJob': 'Drop disabled — a saved job is open',
  'settings.toggle': 'Settings',
  'batch.runPages': 'Pages',
  'batch.range.placeholder': 'e.g. 1-3, 5, 7-9',
  'batch.range.invalid': "Can't parse range",
  'batch.highlightInPreview': 'Highlight in preview',
  'batch.selectedBar': '{n} pages selected',
  'view.grid': 'Grid',
  'view.compact': 'Compact',
  'view.list': 'List',
  'thumb.placeholderTooltip': 'Page image not stored',
```

Repeat the same delete + add operations in the `he` dict with these Hebrew strings:
```
  'drop.empty.title': 'גרור לכאן PDF או תמונות',
  'drop.empty.hint': 'או לחץ בכל מקום לבחירה · PDF, PNG, JPG, WEBP — ניתן להעלות מספר קבצים',
  'drop.loaded.summary.pages': '{pages} עמודים',
  'drop.loaded.summary.done': '{n} הושלמו',
  'drop.loaded.summary.todo': '{n} ממתינים',
  'drop.loaded.summary.error': '{n} שגיאות',
  'drop.loaded.appendHint': 'גרור או לחץ להוספה',
  'drop.loaded.startOver': 'התחל מחדש',
  'drop.loaded.startOverConfirm': 'יש עמודים שעדיין רצים. לעצור ולהתחיל מחדש?',
  'drop.disabledForStoredJob': 'גרירה לא זמינה — פתוחה עבודה שמורה',
  'settings.toggle': 'הגדרות',
  'batch.runPages': 'עמודים',
  'batch.range.placeholder': 'למשל 1-3, 5, 7-9',
  'batch.range.invalid': 'לא ניתן לפענח את הטווח',
  'batch.highlightInPreview': 'סמן בתצוגה',
  'batch.selectedBar': '{n} עמודים נבחרו',
  'view.grid': 'רשת',
  'view.compact': 'רשת צפופה',
  'view.list': 'רשימה',
  'thumb.placeholderTooltip': 'תמונת העמוד לא נשמרה',
```

- [ ] **Step 3: Type-check + run tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/RunLog.tsx src/i18n/translations.ts
git commit -m "feat(i18n): strings for new OCR-tab UI; RunLog extracted"
```

---

## Task 12: Wire everything up in `App.tsx`, delete old files, manual verify

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/FileDrop.tsx`, `src/components/BatchRunner.tsx`, `src/components/PageList.tsx`

- [ ] **Step 1: Rewrite the OCR-tab content**

Replace lines 8–10 and 39–47 of `src/App.tsx` so the imports and the OCR tab content look like this (rest of the file unchanged):

```tsx
import { DropStrip } from './components/DropStrip';
import { CollapsibleSettings } from './components/CollapsibleSettings';
import { RunToolbar } from './components/RunToolbar';
import { RunLog } from './components/RunLog';
import { PageThumbs, readSavedThumbMode } from './components/PageThumbs';
import { BatchRunnerProvider } from './hooks/useBatchRunner';
import type { ThumbMode } from './components/PageThumb';
import { useState } from 'react';
```

```tsx
// inside AppShell(), replace the OCR TabsContent:
const [thumbMode, setThumbMode] = useState<ThumbMode>(() => readSavedThumbMode());

// ...

<TabsContent value="ocr">
  <BatchRunnerProvider>
    <div className="space-y-4">
      <DropStrip />
      <CollapsibleSettings />
      <RunToolbar mode={thumbMode} onModeChange={setThumbMode} />
      <PageThumbs mode={thumbMode} onOpenPage={(n) => { /* double-click jumps to editor */ }} />
      <RunLog />
    </div>
  </BatchRunnerProvider>
</TabsContent>
```

Now wire up `onOpenPage`. Replace the placeholder line with:

```tsx
const { setCurrentPageNum } = useProject();
// ...
onOpenPage={(n) => { setCurrentPageNum(n); setTab('editor'); }}
```

Add the import:

```tsx
import { useProject } from './store/ProjectContext';
```

Note: `useProject` must be called inside `AppShell` (which is already inside `ProjectProvider` — see line 86 of the original file). Verify by reading the surrounding code.

- [ ] **Step 2: Delete dead files**

Run:
```bash
git rm src/components/FileDrop.tsx src/components/BatchRunner.tsx src/components/PageList.tsx
```

- [ ] **Step 3: Type-check + run full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: clean — no references to the deleted files. Existing tests pass.

- [ ] **Step 4: Dev-server smoke test**

Run: `pnpm dev`

In the browser at `http://localhost:5173`:

1. **Empty state** — OCR tab shows only the dashed drop box. Click anywhere on the dashed area: file picker opens. Cancel.
2. **Drop a small PDF** — strip appears with filename + page count. Thumbnails populate. Default view = Grid.
3. **View picker** — click Compact, then List. Selection persists across switches.
4. **Selection** — plain-click page 3 (only 3 selected). Shift-click page 7 (3–7 selected). Ctrl/Cmd-click page 5 (5 removed). Double-click page 4 (Editor tab opens on page 4). Ctrl/Cmd-A selects all; Esc clears.
5. **Settings collapsible** — click "Settings", reveal panel, change provider, refresh browser: panel still open with new provider.
6. **Page range** — type `1-3, 5, 7-`; "Highlight in preview" lights the matching tiles; "Run range" enqueues those pages. Try `1-a` and confirm the inline red error appears, both buttons disable.
7. **Append** — drop a second image onto the loaded project. Strip filename grows ("a.pdf + photo.png"). Thumbnails grow. Jobs tab shows exactly one row for this project under the new hash.
8. **Start all + edited carve-out** — manually edit page 1's text in the Editor (status → `edited`). Switch back to OCR tab, click "Start all" — page 1 is NOT re-OCR'd, its `edited` status is preserved.
9. **Stored-doc drop disabled** — reload browser; open a job from Jobs tab; switch to OCR tab; drop another file. The strip flashes the "Drop disabled — a saved job is open" notice.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire OCR tab to new DropStrip/Settings/RunToolbar/Thumbs"
```

---

## Self-review summary

- **Spec → tasks coverage:**
  - Goal 1 (whole-area drop, no inner button) → Task 6 (Step 1)
  - Goal 2 (settings collapsed + persisted) → Task 7
  - Goal 3 (top-down order) → Task 12 (Step 1)
  - Goal 4 (thumbnails + view picker) → Tasks 8, 9, 10
  - Goal 5 (selection semantics + double-click) → Task 9 + Task 12 wiring
  - Goal 6 (append re-keys IDB and retires old Job) → Tasks 3, 4
  - Printer-style page range → Task 1 + Task 10
  - "Edited is not pending" — Start all skips `edited` → Task 5
  - Drop strip three-bucket summary (done/todo/error) → Task 6
  - `combine()` widening for append → Task 2

- **Placeholder scan:** No "TBD/implement later/handle edge cases" left. Every code step has runnable content.

- **Type consistency:** `parsePageRange` returns `{ pages, error }` everywhere it's used. `BatchRunnerProvider`/`useBatchRunner` API matches the consumer signatures. `THUMB_VIEW_STORAGE_KEY` is exported by `PageThumbs` and imported in `RunToolbar` — no rename drift.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-ocr-tab-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
