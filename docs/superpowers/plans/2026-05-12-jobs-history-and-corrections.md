# Jobs History + Persistent Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-run "History" tab with a per-file "Jobs" tab that persists, in IndexedDB, every file's metadata, OCR'd text, rendered page images, and corrections (including pending/rejected status), so a job can be reloaded into the editor without re-picking the original file.

**Architecture:** Bump the IndexedDB schema to v2 and add three new stores: `jobs` (one row per file), `corrections` (Correction[] per page), `pageImages` (rendered PNG per page). Add a `StoredDoc` variant of `LoadedDoc` whose `renderPageToPng` resolves from the `pageImages` store. `ProjectContext` gains effects that load corrections on page change and save them on edit. `BatchRunner` / `FixPanel` save each rendered page image alongside its OCR text. A new `JobsList` component replaces `RunHistory`; the controlled `Tabs` switches to the Editor after Reload.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + `fake-indexeddb` (for tests), `idb` (IndexedDB wrapper).

**Spec:** `docs/superpowers/specs/2026-05-12-jobs-history-and-corrections-design.md`

---

## Task 1: Bump IndexedDB to v2 and create new stores

**Files:**
- Modify: `src/store/persistence.ts`
- Modify: `src/store/persistence.test.ts`

- [ ] **Step 1: Update `persistence.test.ts` with v2 expectation**

Append to `src/store/persistence.test.ts`:

```ts
import { openDB } from 'idb';

describe('persistence DB v2', () => {
  it('creates jobs, corrections, pageImages stores on upgrade', async () => {
    // Trigger db open via any existing call:
    await loadAllPageResults('zzzz');
    const db = await openDB('llm_ocr_web');
    expect(db.objectStoreNames.contains('pageResults')).toBe(true);
    expect(db.objectStoreNames.contains('jobs')).toBe(true);
    expect(db.objectStoreNames.contains('corrections')).toBe(true);
    expect(db.objectStoreNames.contains('pageImages')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: the new test fails because `jobs`/`corrections`/`pageImages` don't exist.

- [ ] **Step 3: Bump DB_VERSION and create stores**

Replace the entire contents of `src/store/persistence.ts` with:

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { PageResult } from '../lib/types';

const DB_NAME = 'llm_ocr_web';
const DB_VERSION = 2;
const STORE_PAGE_RESULTS = 'pageResults';
export const STORE_JOBS = 'jobs';
export const STORE_CORRECTIONS = 'corrections';
export const STORE_PAGE_IMAGES = 'pageImages';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_PAGE_RESULTS)) {
          database.createObjectStore(STORE_PAGE_RESULTS);
        }
        if (!database.objectStoreNames.contains(STORE_JOBS)) {
          database.createObjectStore(STORE_JOBS);
        }
        if (!database.objectStoreNames.contains(STORE_CORRECTIONS)) {
          database.createObjectStore(STORE_CORRECTIONS);
        }
        if (!database.objectStoreNames.contains(STORE_PAGE_IMAGES)) {
          database.createObjectStore(STORE_PAGE_IMAGES);
        }
      },
    });
  }
  return dbPromise;
}

export function pageKey(fileHash: string, pageNum: number): string {
  return `${fileHash}:${String(pageNum).padStart(6, '0')}`;
}

export function pageRangeFor(fileHash: string): IDBKeyRange {
  return IDBKeyRange.bound(`${fileHash}:000000`, `${fileHash}:999999`);
}

export async function savePageResult(fileHash: string, result: PageResult): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_PAGE_RESULTS, result, pageKey(fileHash, result.pageNum));
  } catch (err) {
    console.warn('persistence.savePageResult failed', err);
  }
}

export async function loadAllPageResults(fileHash: string): Promise<PageResult[]> {
  try {
    const d = await db();
    const tx = d.transaction(STORE_PAGE_RESULTS, 'readonly');
    const out: PageResult[] = [];
    let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
    while (cursor) {
      out.push(cursor.value as PageResult);
      cursor = await cursor.continue();
    }
    out.sort((a, b) => a.pageNum - b.pageNum);
    return out;
  } catch (err) {
    console.warn('persistence.loadAllPageResults failed', err);
    return [];
  }
}

export async function deleteFile(fileHash: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE_PAGE_RESULTS, 'readwrite');
  let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: all tests pass (including the new v2 store check).

- [ ] **Step 5: Commit**

```bash
git add src/store/persistence.ts src/store/persistence.test.ts
git commit -m "feat(db): bump IndexedDB to v2 with jobs/corrections/pageImages stores"
```

---

## Task 2: Corrections store module

**Files:**
- Create: `src/store/correctionsStore.ts`
- Create: `src/store/correctionsStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/correctionsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveCorrections, loadCorrections } from './correctionsStore';
import type { Correction } from '../lib/types';

const A = 'aaaa';

const mkC = (id: string, status: Correction['status']): Correction => ({
  id, old: 'x', new: 'y', reason: '', status,
});

describe('correctionsStore', () => {
  beforeEach(async () => {
    await saveCorrections(A, 0, []);
    await saveCorrections(A, 1, []);
  });

  it('returns [] for missing key', async () => {
    expect(await loadCorrections(A, 99)).toEqual([]);
  });

  it('round-trips corrections with mixed statuses', async () => {
    const arr: Correction[] = [
      mkC('1', 'pending'),
      mkC('2', 'accepted'),
      mkC('3', 'rejected'),
    ];
    await saveCorrections(A, 0, arr);
    expect(await loadCorrections(A, 0)).toEqual(arr);
  });

  it('isolates by page', async () => {
    await saveCorrections(A, 0, [mkC('a', 'pending')]);
    await saveCorrections(A, 1, [mkC('b', 'accepted')]);
    expect((await loadCorrections(A, 0))[0].id).toBe('a');
    expect((await loadCorrections(A, 1))[0].id).toBe('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/correctionsStore.test.ts`
Expected: FAIL with `Cannot find module './correctionsStore'`.

- [ ] **Step 3: Write the implementation**

Create `src/store/correctionsStore.ts`:

```ts
import { db, STORE_CORRECTIONS, pageKey } from './persistence';
import type { Correction } from '../lib/types';

export async function saveCorrections(
  fileHash: string,
  pageNum: number,
  corrections: Correction[],
): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_CORRECTIONS, corrections, pageKey(fileHash, pageNum));
  } catch (err) {
    console.warn('correctionsStore.saveCorrections failed', err);
  }
}

export async function loadCorrections(
  fileHash: string,
  pageNum: number,
): Promise<Correction[]> {
  try {
    const d = await db();
    const v = await d.get(STORE_CORRECTIONS, pageKey(fileHash, pageNum));
    return Array.isArray(v) ? (v as Correction[]) : [];
  } catch (err) {
    console.warn('correctionsStore.loadCorrections failed', err);
    return [];
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/correctionsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/correctionsStore.ts src/store/correctionsStore.test.ts
git commit -m "feat(store): correctionsStore (save/load per page)"
```

---

## Task 3: Page-images store module

**Files:**
- Create: `src/store/pageImagesStore.ts`
- Create: `src/store/pageImagesStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/pageImagesStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { savePageImage, loadPageImage, loadAllPageImages } from './pageImagesStore';

const A = 'aaaa';
const img = (s: string) => ({ dataUrl: `data:image/png;base64,${s}`, mediaType: 'image/png' });

describe('pageImagesStore', () => {
  it('returns undefined for missing page', async () => {
    expect(await loadPageImage(A, 999)).toBeUndefined();
  });

  it('round-trips a page image', async () => {
    await savePageImage(A, 0, img('zero'));
    const v = await loadPageImage(A, 0);
    expect(v?.mediaType).toBe('image/png');
    expect(v?.dataUrl.endsWith('zero')).toBe(true);
  });

  it('loadAllPageImages returns a Map keyed by pageNum', async () => {
    await savePageImage(A, 2, img('two'));
    await savePageImage(A, 0, img('zero'));
    await savePageImage(A, 1, img('one'));
    const map = await loadAllPageImages(A);
    expect(map.get(0)?.dataUrl.endsWith('zero')).toBe(true);
    expect(map.get(1)?.dataUrl.endsWith('one')).toBe(true);
    expect(map.get(2)?.dataUrl.endsWith('two')).toBe(true);
    expect(map.size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/pageImagesStore.test.ts`
Expected: FAIL with `Cannot find module './pageImagesStore'`.

- [ ] **Step 3: Write the implementation**

Create `src/store/pageImagesStore.ts`:

```ts
import { db, STORE_PAGE_IMAGES, pageKey, pageRangeFor } from './persistence';

export interface StoredPageImage {
  dataUrl: string;
  mediaType: string;
}

export async function savePageImage(
  fileHash: string,
  pageNum: number,
  img: StoredPageImage,
): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_PAGE_IMAGES, img, pageKey(fileHash, pageNum));
  } catch (err) {
    console.warn('pageImagesStore.savePageImage failed', err);
  }
}

export async function loadPageImage(
  fileHash: string,
  pageNum: number,
): Promise<StoredPageImage | undefined> {
  try {
    const d = await db();
    return (await d.get(STORE_PAGE_IMAGES, pageKey(fileHash, pageNum))) as StoredPageImage | undefined;
  } catch (err) {
    console.warn('pageImagesStore.loadPageImage failed', err);
    return undefined;
  }
}

export async function loadAllPageImages(fileHash: string): Promise<Map<number, StoredPageImage>> {
  const out = new Map<number, StoredPageImage>();
  try {
    const d = await db();
    const tx = d.transaction(STORE_PAGE_IMAGES, 'readonly');
    let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
    while (cursor) {
      const k = String(cursor.key);
      const n = Number(k.slice(fileHash.length + 1));
      if (Number.isFinite(n)) out.set(n, cursor.value as StoredPageImage);
      cursor = await cursor.continue();
    }
  } catch (err) {
    console.warn('pageImagesStore.loadAllPageImages failed', err);
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/pageImagesStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/pageImagesStore.ts src/store/pageImagesStore.test.ts
git commit -m "feat(store): pageImagesStore (per-page PNG persistence)"
```

---

## Task 4: Jobs store module (with cascade delete + prune)

**Files:**
- Create: `src/store/jobs.ts`
- Create: `src/store/jobs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/jobs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { upsertJob, listJobs, getJob, deleteJob, pruneJobs } from './jobs';
import { savePageResult, loadAllPageResults } from './persistence';
import { saveCorrections, loadCorrections } from './correctionsStore';
import { savePageImage, loadPageImage } from './pageImagesStore';

const A = 'aaaa';
const B = 'bbbb';
const C = 'cccc';

async function reset() {
  for (const h of [A, B, C]) await deleteJob(h);
}

describe('jobs store', () => {
  beforeEach(reset);

  it('upsert + getJob', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 10 });
    const j = await getJob(A);
    expect(j?.fileName).toBe('a.pdf');
    expect(j?.pageCount).toBe(10);
    expect(j?.createdAt).toBeGreaterThan(0);
    expect(j?.lastOpenedAt).toBeGreaterThan(0);
  });

  it('upsert again updates fileName, pageCount, lastOpenedAt; keeps createdAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 10 });
    const first = await getJob(A);
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: A, fileName: 'renamed.pdf', pageCount: 12 });
    const second = await getJob(A);
    expect(second?.fileName).toBe('renamed.pdf');
    expect(second?.pageCount).toBe(12);
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second!.lastOpenedAt).toBeGreaterThan(first!.lastOpenedAt);
  });

  it('listJobs returns rows sorted by lastOpenedAt desc', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: B, fileName: 'b', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: C, fileName: 'c', pageCount: 1 });
    const ids = (await listJobs()).map((j) => j.fileHash);
    expect(ids).toEqual([C, B, A]);
  });

  it('deleteJob cascades to pageResults, corrections, pageImages', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'x', status: 'ok' });
    await saveCorrections(A, 0, [{ id: '1', old: 'a', new: 'b', reason: '', status: 'pending' }]);
    await savePageImage(A, 0, { dataUrl: 'data:,', mediaType: 'image/png' });

    await deleteJob(A);

    expect(await getJob(A)).toBeUndefined();
    expect(await loadAllPageResults(A)).toEqual([]);
    expect(await loadCorrections(A, 0)).toEqual([]);
    expect(await loadPageImage(A, 0)).toBeUndefined();
  });

  it('pruneJobs keeps newest N by lastOpenedAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: B, fileName: 'b', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: C, fileName: 'c', pageCount: 1 });
    await pruneJobs(2);
    const ids = (await listJobs()).map((j) => j.fileHash);
    expect(ids).toEqual([C, B]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/jobs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/store/jobs.ts`:

```ts
import {
  db,
  STORE_JOBS,
  STORE_CORRECTIONS,
  STORE_PAGE_IMAGES,
  pageRangeFor,
} from './persistence';

// `pageResults` is the private store name from persistence.ts (kept private
// since callers should go through `savePageResult` / `loadAllPageResults`).
// The cascade-delete needs the raw store name to wipe by key range.
const STORE_PAGE_RESULTS = 'pageResults';

export interface JobRecord {
  fileHash: string;
  fileName: string;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
}

export interface UpsertJobInput {
  fileHash: string;
  fileName: string;
  pageCount: number;
}

export async function upsertJob(input: UpsertJobInput): Promise<JobRecord> {
  const d = await db();
  const prev = (await d.get(STORE_JOBS, input.fileHash)) as JobRecord | undefined;
  const now = Date.now();
  const next: JobRecord = {
    fileHash: input.fileHash,
    fileName: input.fileName,
    pageCount: input.pageCount,
    createdAt: prev?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await d.put(STORE_JOBS, next, input.fileHash);
  return next;
}

export async function getJob(fileHash: string): Promise<JobRecord | undefined> {
  try {
    const d = await db();
    return (await d.get(STORE_JOBS, fileHash)) as JobRecord | undefined;
  } catch (err) {
    console.warn('jobs.getJob failed', err);
    return undefined;
  }
}

export async function listJobs(): Promise<JobRecord[]> {
  try {
    const d = await db();
    const all = (await d.getAll(STORE_JOBS)) as JobRecord[];
    return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch (err) {
    console.warn('jobs.listJobs failed', err);
    return [];
  }
}

export async function deleteJob(fileHash: string): Promise<void> {
  try {
    const d = await db();
    const tx = d.transaction(
      [STORE_JOBS, STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES],
      'readwrite',
    );
    await tx.objectStore(STORE_JOBS).delete(fileHash);
    for (const store of [STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES] as const) {
      let cur = await tx.objectStore(store).openCursor(pageRangeFor(fileHash));
      while (cur) {
        await cur.delete();
        cur = await cur.continue();
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('jobs.deleteJob failed', err);
  }
}

export async function pruneJobs(max: number): Promise<void> {
  const all = await listJobs();
  const drop = all.slice(max);
  for (const j of drop) await deleteJob(j.fileHash);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/jobs.ts src/store/jobs.test.ts
git commit -m "feat(store): jobs store with cascade delete + prune"
```

---

## Task 5: `StoredDoc` variant + `MissingPageImageError`

**Files:**
- Modify: `src/pdf/render.ts`
- Create: `src/pdf/render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pdf/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { renderPageToPng, MissingPageImageError, type StoredDoc } from './render';
import { savePageImage } from '../store/pageImagesStore';

const HASH = 'storedoc';

describe('StoredDoc render', () => {
  it('serves from in-memory cache when present', async () => {
    const doc: StoredDoc = {
      type: 'stored',
      fileHash: HASH,
      pageCount: 1,
      cache: new Map([[0, { dataUrl: 'data:image/png;base64,Y', mediaType: 'image/png' }]]),
    };
    const out = await renderPageToPng(doc, 0);
    expect(out.dataUrl).toBe('data:image/png;base64,Y');
    expect(out.mediaType).toBe('image/png');
  });

  it('falls back to IndexedDB when not in cache', async () => {
    await savePageImage(HASH, 5, { dataUrl: 'data:image/png;base64,Z', mediaType: 'image/png' });
    const doc: StoredDoc = { type: 'stored', fileHash: HASH, pageCount: 6, cache: new Map() };
    const out = await renderPageToPng(doc, 5);
    expect(out.dataUrl).toBe('data:image/png;base64,Z');
    // Subsequent call should now hit the cache.
    expect(doc.cache.get(5)?.dataUrl).toBe('data:image/png;base64,Z');
  });

  it('throws MissingPageImageError when neither cache nor store has the page', async () => {
    const doc: StoredDoc = { type: 'stored', fileHash: 'nope', pageCount: 10, cache: new Map() };
    await expect(renderPageToPng(doc, 3)).rejects.toBeInstanceOf(MissingPageImageError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pdf/render.test.ts`
Expected: FAIL — `MissingPageImageError` / `StoredDoc` not exported.

- [ ] **Step 3: Update `src/pdf/render.ts`**

Add the new variant, error class, and a branch in `renderPageToPng`. Inside the file:

```ts
// at top, alongside other interfaces
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
```

Then prepend a branch at the start of `renderPageToPng`:

```ts
export async function renderPageToPng(loaded: LoadedDoc, pageNum: number, dpi = 200): Promise<{ dataUrl: string; mediaType: string }> {
  if (loaded.type === 'stored') {
    const cached = loaded.cache.get(pageNum);
    if (cached) return cached;
    const { loadPageImage } = await import('../store/pageImagesStore');
    const v = await loadPageImage(loaded.fileHash, pageNum);
    if (!v) throw new MissingPageImageError(pageNum);
    loaded.cache.set(pageNum, v);
    return v;
  }
  if (loaded.type === 'images') {
    /* unchanged */
  }
  /* …rest unchanged… */
}
```

(Use a dynamic `import` to avoid a static cycle between `pdf/render.ts` and `store/pageImagesStore.ts` — `pageImagesStore` imports `persistence`, not `render`, so static is fine if you prefer; either works.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pdf/render.test.ts`
Expected: PASS. Also run the full suite once: `npx vitest run` — must still be green.

- [ ] **Step 5: Commit**

```bash
git add src/pdf/render.ts src/pdf/render.test.ts
git commit -m "feat(pdf): StoredDoc variant + MissingPageImageError"
```

---

## Task 6: `reloadJob` helper

**Files:**
- Create: `src/store/reloadJob.ts`
- Create: `src/store/reloadJob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/reloadJob.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { reloadJob } from './reloadJob';
import { upsertJob, deleteJob } from './jobs';
import { savePageResult } from './persistence';
import { savePageImage } from './pageImagesStore';

const H = 'reloadhash';

describe('reloadJob', () => {
  beforeEach(async () => { await deleteJob(H); });

  it('returns null when no job exists', async () => {
    const out = await reloadJob('missing');
    expect(out).toBeNull();
  });

  it('builds a StoredDoc with restored text and image cache', async () => {
    await upsertJob({ fileHash: H, fileName: 'r.pdf', pageCount: 3 });
    await savePageResult(H, { pageNum: 0, text: 'one', status: 'ok' });
    await savePageImage(H, 0, { dataUrl: 'data:image/png;base64,A', mediaType: 'image/png' });
    await savePageImage(H, 2, { dataUrl: 'data:image/png;base64,B', mediaType: 'image/png' });

    const out = await reloadJob(H);
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('r.pdf');
    expect(out!.doc.type).toBe('stored');
    expect(out!.doc.pageCount).toBe(3);
    expect(out!.doc.cache.get(0)?.dataUrl.endsWith('A')).toBe(true);
    expect(out!.doc.cache.get(2)?.dataUrl.endsWith('B')).toBe(true);
    expect(out!.restored[0].text).toBe('one');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/reloadJob.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/store/reloadJob.ts`:

```ts
import { getJob, upsertJob } from './jobs';
import { loadAllPageResults } from './persistence';
import { loadAllPageImages } from './pageImagesStore';
import type { StoredDoc } from '../pdf/render';
import type { PageResult } from '../lib/types';

export interface ReloadResult {
  doc: StoredDoc;
  fileHash: string;
  fileName: string;
  restored: PageResult[];
}

export async function reloadJob(fileHash: string): Promise<ReloadResult | null> {
  const job = await getJob(fileHash);
  if (!job) return null;
  const [restored, cache] = await Promise.all([
    loadAllPageResults(fileHash),
    loadAllPageImages(fileHash),
  ]);
  const doc: StoredDoc = {
    type: 'stored',
    fileHash,
    pageCount: job.pageCount,
    cache,
  };
  await upsertJob({ fileHash, fileName: job.fileName, pageCount: job.pageCount });
  return { doc, fileHash, fileName: job.fileName, restored };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/store/reloadJob.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/reloadJob.ts src/store/reloadJob.test.ts
git commit -m "feat(store): reloadJob assembles StoredDoc + restored PageResults"
```

---

## Task 7: Persistent corrections in `ProjectContext`

**Files:**
- Modify: `src/store/ProjectContext.tsx`

- [ ] **Step 1: Remove the clear-on-page-change and add the load/save effects**

Edit `src/store/ProjectContext.tsx`. Replace the existing `setCurrentPageNum` implementation:

```ts
const setCurrentPageNum = (n: number) => {
  setCurrentPageNumRaw(n);
};
```

Add these two effects inside `ProjectProvider` (after the state declarations, before the `useMemo`):

```ts
import { useEffect, useRef } from 'react';
import { loadCorrections, saveCorrections } from './correctionsStore';

// …

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
```

The `hydratingForKey` guard avoids the save-effect immediately overwriting freshly-loaded state.

Also update `setProject` and `resetProject` to no longer call `setCorrections([])` themselves — the load effect handles seeding (`resetProject` setting `fileHash` to `''` triggers the empty branch).

- [ ] **Step 2: Update tests if any reference setCurrentPageNum clearing corrections**

Run: `npx vitest run` and inspect failures. None expected, since corrections are not covered by existing tests, but verify.

- [ ] **Step 3: Commit**

```bash
git add src/store/ProjectContext.tsx
git commit -m "feat(store): persist corrections per page across navigation and reload"
```

---

## Task 8: `FileDrop` upserts jobs, persists image-only pages, prunes

**Files:**
- Modify: `src/components/FileDrop.tsx`

- [ ] **Step 1: Wire `upsertJob`, `savePageImage` (for image-only/combined), `pruneJobs`**

Edit the `handleFiles` callback in `src/components/FileDrop.tsx`. After `setProject({ doc, fileHash, fileName: displayName, restored });`, add:

```ts
// New imports at top of file:
// import { upsertJob, pruneJobs } from '../store/jobs';
// import { savePageImage } from '../store/pageImagesStore';

await upsertJob({ fileHash, fileName: displayName, pageCount: doc.pageCount });
await pruneJobs(20);

if (doc.type === 'images') {
  await Promise.all(doc.pages.map((p, i) =>
    savePageImage(fileHash, i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
  ));
} else if (doc.type === 'combined') {
  const offset = doc.pdf.pageCount;
  await Promise.all(doc.images.pages.map((p, i) =>
    savePageImage(fileHash, offset + i, { dataUrl: p.dataUrl, mediaType: p.mediaType }),
  ));
}
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileDrop.tsx
git commit -m "feat(file-drop): upsert job, prune to 20, persist image-only page images"
```

---

## Task 9: `BatchRunner` saves rendered images; drops run log

**Files:**
- Modify: `src/components/BatchRunner.tsx`

- [ ] **Step 1: Save each rendered image and remove `appendRun`**

In `src/components/BatchRunner.tsx`:

1. Remove `import { appendRun } from '../store/runHistory';` and `import { estimateCost } from '../ai/pricing';`.
2. Remove the entire `appendRun({ … })` block.
3. Add `import { savePageImage } from '../store/pageImagesStore';` at the top.
4. In the `work` callback, save the image right after rendering and before sending it to the model:

```ts
work: async (n, sig) => {
  const img = await renderPageToPng(loadedDoc, n);
  savePageImage(fileHash, n, img);
  const r = await ocrPage(model, img.dataUrl, settings.prompts.ocr, sig);
  return { ok: true as const, value: r };
},
```

(Don't `await` the save — it's best-effort and shouldn't slow down OCR.)

- [ ] **Step 2: Run full suite**

Run: `npx vitest run`
Expected: green. `totalIn`/`totalOut` accumulators in `BatchRunner` are now unused — remove them too.

After cleanup the locals are gone:

```ts
const startedAt = Date.now(); // remove
let okCount = 0, failCount = 0; // remove
let totalIn = 0, totalOut = 0; // remove
```

…and the `tokensIn/tokensOut` accumulation inside `onProgress` is just deleted (the per-page result still records its own tokens). Re-run tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/BatchRunner.tsx
git commit -m "feat(batch): save page images on render; drop appendRun"
```

---

## Task 10: `FixPanel` saves rendered image

**Files:**
- Modify: `src/components/FixPanel.tsx`

- [ ] **Step 1: Persist the image after rendering**

In `src/components/FixPanel.tsx`, inside `run()`, change:

```ts
const img = await renderPageToPng(loadedDoc, currentPageNum);
```

to:

```ts
const img = await renderPageToPng(loadedDoc, currentPageNum);
savePageImage(fileHash, currentPageNum, img);
```

And add the import:

```ts
import { savePageImage } from '../store/pageImagesStore';
```

- [ ] **Step 2: Run full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/FixPanel.tsx
git commit -m "feat(fix): persist page image on Fix run"
```

---

## Task 11: `PageImage` placeholder on `MissingPageImageError`

**Files:**
- Modify: `src/components/PageImage.tsx`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Add an i18n key for the placeholder**

Edit `src/i18n/translations.ts`. In the English block (near other `image.*` keys), add:

```ts
'image.notStored': 'Page image not stored — open the original file to view it.',
```

In the Hebrew block (near other `image.*` keys), add:

```ts
'image.notStored': 'תמונת העמוד לא נשמרה — פתח את הקובץ המקורי כדי להציג.',
```

- [ ] **Step 2: Show the placeholder**

Edit `src/components/PageImage.tsx`. Change the `.catch` to identify the error:

```ts
import { renderPageToPng, MissingPageImageError } from '../pdf/render';
// …
renderPageToPng(loadedDoc, currentPageNum)
  .then((r) => { if (!cancelled) setSrc(r.dataUrl); })
  .catch((e) => {
    if (cancelled) return;
    if (e instanceof MissingPageImageError) {
      setErr(t('image.notStored'));
    } else {
      setErr(e instanceof Error ? e.message : String(e));
    }
  });
```

Add `t` to the effect deps array (it's stable from the i18n context but the linter wants it listed).

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/PageImage.tsx src/i18n/translations.ts
git commit -m "feat(editor): friendly placeholder for pages with no stored image"
```

---

## Task 12: `JobsList` component (replaces `RunHistory`)

**Files:**
- Create: `src/components/JobsList.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/App.tsx`
- Delete: `src/components/RunHistory.tsx`

- [ ] **Step 1: Update i18n: rename `tabs.history` → `tabs.jobs`, rename `history.*` → `jobs.*`, add new keys**

Edit `src/i18n/translations.ts`. In the English block, replace the old keys:

```ts
'tabs.jobs': 'Jobs',
'jobs.empty': 'No saved jobs yet.',
'jobs.file': 'File',
'jobs.pages': 'Pages',
'jobs.status': 'Status',
'jobs.lastOpened': 'Last opened',
'jobs.actions': 'Actions',
'jobs.reload': 'Reload',
'jobs.delete': 'Delete',
'jobs.confirmDelete': 'Delete saved job for "{name}"? Text, corrections, and page images for this file will be removed from your browser.',
'jobs.privacyNote': 'Saved in your browser only — clear browser data to remove.',
'jobs.statusSummary': '{ok} ok · {edited} edited · {error} error · {pending} pending',
'jobs.reloadFailed': 'Reload failed: {msg}',
```

Remove these old keys: `tabs.history`, `history.empty`, `history.when`, `history.file`, `history.model`, `history.okFail`, `history.cost`.

Repeat in the Hebrew block:

```ts
'tabs.jobs': 'עבודות',
'jobs.empty': 'אין עבודות שמורות עדיין.',
'jobs.file': 'קובץ',
'jobs.pages': 'עמודים',
'jobs.status': 'מצב',
'jobs.lastOpened': 'נפתח לאחרונה',
'jobs.actions': 'פעולות',
'jobs.reload': 'טען מחדש',
'jobs.delete': 'מחק',
'jobs.confirmDelete': 'למחוק את העבודה השמורה של "{name}"? טקסט, תיקונים ותמונות עמודים של קובץ זה יוסרו מהדפדפן.',
'jobs.privacyNote': 'נשמר בדפדפן בלבד — נקה נתוני אתר להסרה.',
'jobs.statusSummary': '{ok} הצלחות · {edited} נערכו · {error} שגיאות · {pending} ממתינים',
'jobs.reloadFailed': 'הטעינה נכשלה: {msg}',
```

Remove the equivalent Hebrew `history.*` and `tabs.history` keys.

- [ ] **Step 2: Add a way to switch the active tab from outside the Tabs**

We need the Jobs list to switch to the Editor after a successful Reload. Edit `src/App.tsx`:

```tsx
import { useState } from 'react';
// …
function AppShell() {
  const { t } = useI18n();
  const [tab, setTab] = useState('ocr');
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <header>{/* unchanged */}</header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ocr">{t('tabs.ocr')}</TabsTrigger>
          <TabsTrigger value="editor">{t('tabs.editor')}</TabsTrigger>
          <TabsTrigger value="export">{t('tabs.export')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('tabs.jobs')}</TabsTrigger>
        </TabsList>
        <TabsContent value="ocr">…</TabsContent>
        <TabsContent value="editor"><EditorView /></TabsContent>
        <TabsContent value="export"><ExportPanel /></TabsContent>
        <TabsContent value="jobs"><JobsList onOpened={() => setTab('editor')} /></TabsContent>
      </Tabs>
      <footer>…</footer>
    </div>
  );
}
```

Also update the import: `import { JobsList } from './components/JobsList';` and remove the `RunHistory` import.

- [ ] **Step 3: Write the component**

Create `src/components/JobsList.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { listJobs, deleteJob, type JobRecord } from '../store/jobs';
import { reloadJob } from '../store/reloadJob';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { Button } from './ui/button';

interface Props {
  onOpened: () => void;
}

export function JobsList({ onOpened }: Props) {
  const { t } = useI18n();
  const { setProject, resetProject, fileHash: openHash } = useProject();
  const [rows, setRows] = useState<JobRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => { listJobs().then(setRows); };
  useEffect(() => { refresh(); }, []);

  const onReload = async (hash: string) => {
    setBusy(hash); setErr(null);
    try {
      const out = await reloadJob(hash);
      if (!out) throw new Error('job not found');
      setProject({ doc: out.doc, fileHash: out.fileHash, fileName: out.fileName, restored: out.restored });
      onOpened();
    } catch (e) {
      setErr(t('jobs.reloadFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const onDelete = async (row: JobRecord) => {
    if (!window.confirm(t('jobs.confirmDelete', { name: row.fileName }))) return;
    await deleteJob(row.fileHash);
    if (openHash === row.fileHash) resetProject();
    refresh();
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">{t('jobs.privacyNote')}</p>
        <p className="text-sm text-gray-500">{t('jobs.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{t('jobs.privacyNote')}</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <table className="text-sm w-full">
        <thead className="text-left text-xs text-gray-600">
          <tr>
            <th>{t('jobs.file')}</th>
            <th>{t('jobs.pages')}</th>
            <th>{t('jobs.lastOpened')}</th>
            <th>{t('jobs.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fileHash} className="border-t align-middle">
              <td className="truncate max-w-[260px]">{r.fileName}</td>
              <td>{r.pageCount}</td>
              <td>{new Date(r.lastOpenedAt).toLocaleString()}</td>
              <td className="flex gap-1 py-1">
                <Button
                  className="text-xs h-7"
                  disabled={busy === r.fileHash}
                  onClick={() => onReload(r.fileHash)}
                >
                  {t('jobs.reload')}
                </Button>
                <Button
                  variant="outline"
                  className="text-xs h-7"
                  disabled={busy === r.fileHash}
                  onClick={() => onDelete(r)}
                >
                  {t('jobs.delete')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Delete the old `RunHistory`**

```bash
git rm src/components/RunHistory.tsx
```

- [ ] **Step 5: Run full suite + dev build**

Run: `npx vitest run` and `npx tsc -b --noEmit` (or `npm run build`).
Expected: green + no TS errors. Visually verify in `npm run dev`: open a file, OCR a page, switch tabs, browser-reload, open Jobs, hit Reload, land in Editor.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/JobsList.tsx src/i18n/translations.ts
git commit -m "feat(jobs): JobsList tab with Reload/Delete, replacing RunHistory"
```

---

## Task 13: Remove the localStorage run-history key and dead modules

**Files:**
- Delete: `src/store/runHistory.ts`
- Delete: `src/store/runHistory.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Wipe the old localStorage key on app startup**

Edit `src/main.tsx` and add, near the top (after imports, before `ReactDOM.createRoot`):

```ts
try { localStorage.removeItem('llm_ocr_web:runHistory:v1'); } catch { /* ignore */ }
```

- [ ] **Step 2: Delete the dead modules**

```bash
git rm src/store/runHistory.ts src/store/runHistory.test.ts
```

- [ ] **Step 3: Run full suite + typecheck**

Run: `npx vitest run` and `npx tsc -b --noEmit`.
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "chore: drop runHistory module and clean up old localStorage key"
```

---

## Task 14: Update `i18n` tests (if they enumerate keys) + smoke-test the UI

**Files:**
- Modify (if needed): `src/i18n/translations.test.ts`

- [ ] **Step 1: Open the i18n test and adjust expected keys**

Run: `npx vitest run src/i18n/translations.test.ts`
Expected: if it cross-checks that the same keys exist in both languages, this will already pass after the matched edits in Task 12. If it explicitly references `tabs.history` or `history.*`, replace those references with the `jobs.*` keys.

- [ ] **Step 2: Manual smoke test (don't skip)**

Run `npm run dev`, open the app, and verify:
- Open a PDF → it appears in the Jobs tab.
- OCR pages 1–2 → switch to Editor → run Fix → leave one correction pending → navigate to page 2 and back → the pending correction is still there.
- Hit browser reload → the Editor is empty (file not loaded yet), but the Jobs tab still lists the file.
- Click Reload on the job → land in Editor, page text + pending correction restored, page image visible for pages OCR'd before reload; pages 3+ show the "not stored" placeholder.
- Delete the job → Jobs tab is empty; opening Editor shows the "load first" state.

- [ ] **Step 3: Commit (if any changes)**

```bash
git add -A
git commit -m "test(i18n): adjust expected keys for jobs renaming"
```

(If nothing changed, skip this commit.)

---

## Done criteria

All of the spec's acceptance criteria can be ticked off:

1. Loading a file creates or updates a Jobs row. ← Task 8
2. Every page rendered by OCR or Fix has its image persisted. ← Tasks 9, 10
3. Switching pages / tabs / reload preserves corrections in their last status. ← Task 7
4. Jobs tab lists every saved file with working Reload + Delete. ← Task 12
5. Reload opens the editor with no file picker and no permission prompt. ← Tasks 6, 12
6. Pages with no stored image show a clear placeholder. ← Task 11
7. Delete cascades across all stores. ← Task 4
8. The old `runHistory` localStorage key and the History tab are gone. ← Tasks 12, 13
