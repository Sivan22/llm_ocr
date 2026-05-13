# Jobs history + persistent corrections — Design

**Date:** 2026-05-12
**Scope:** Replace the per-batch-run "History" tab with a per-file "Jobs" tab. Persist all corrections (with status) per page so they survive page changes and reloads. Persist each page's rendered image so a saved job can be reopened with full editor functionality without re-picking the original file. Everything is stored in the browser only.

## Goals

1. Every file the user has loaded shows up as a "job" in a Jobs tab.
2. A job persists, in IndexedDB:
   - the file's metadata (name, hash, page count),
   - per-page OCR'd text (already done),
   - per-page rendered image (new),
   - per-page corrections including pending/rejected status (new).
3. Clicking "Reload" on a saved job restores the full editor state with no file picker, no permission prompt, no need for the original file on disk.
4. Clicking "Delete" wipes every trace of that file from the browser.
5. No server. No PDF bytes stored. Just rendered page images + text + corrections + metadata.

## Non-goals

- Storing the original PDF bytes themselves. (We only keep what's needed to view/edit/export: the per-page images.)
- Cross-device sync.
- Versioned snapshots of a job over time. Each job is the latest state of one file.
- Preserving the old per-run audit log. It is removed (the data it captured — model, cost — can be derived from per-page token counts already persisted).
- Re-rendering pages at a different DPI after reload. We store what was rendered.

## Architecture

### Storage layout (IndexedDB)

Bump database `llm_ocr_web` from `version 1` to `version 2`. After upgrade the DB has four stores:

| Store          | Key                       | Value shape                                  | Status        |
| -------------- | ------------------------- | -------------------------------------------- | ------------- |
| `pageResults`  | `${fileHash}:${pageNum6}` | `PageResult`                                 | Existing      |
| `jobs`         | `fileHash` (string)       | `JobRecord` (see below)                      | New           |
| `corrections`  | `${fileHash}:${pageNum6}` | `Correction[]`                               | New           |
| `pageImages`   | `${fileHash}:${pageNum6}` | `{ dataUrl: string; mediaType: string }`     | New           |

`pageNum6` is zero-padded to 6 digits, same scheme as the existing `pageResults` key.

```ts
interface JobRecord {
  fileHash: string;        // primary key
  fileName: string;        // display name (last loaded)
  pageCount: number;
  createdAt: number;       // epoch ms
  lastOpenedAt: number;    // epoch ms
}
```

The old `localStorage` key `llm_ocr_web:runHistory:v1` is removed on first run after the upgrade — see Migration.

### What we never store

- The original PDF bytes. They are converted to per-page PNGs at render time (200 dpi default) and only those PNGs are persisted.
- A file handle. Reload doesn't need one.

### New modules

- `src/store/jobs.ts` — IDB wrapper for the `jobs` store:
  - `upsertJob(input: { fileHash, fileName, pageCount })` — creates a row or updates `fileName`/`pageCount`/`lastOpenedAt`.
  - `listJobs(): Promise<JobRecord[]>` — sorted by `lastOpenedAt` desc.
  - `getJob(fileHash): Promise<JobRecord | undefined>`
  - `deleteJob(fileHash): Promise<void>` — single read/write transaction across `jobs`, `pageResults`, `corrections`, `pageImages`; deletes every key for the hash.
  - `pruneJobs(max: number)` — keeps the newest `max` by `lastOpenedAt`; calls `deleteJob` on the rest. Default **20** because images are big.

- `src/store/correctionsStore.ts`:
  - `saveCorrections(fileHash, pageNum, corrections: Correction[]): Promise<void>`
  - `loadCorrections(fileHash, pageNum): Promise<Correction[]>` — returns `[]` if missing.

- `src/store/pageImagesStore.ts`:
  - `savePageImage(fileHash, pageNum, img: { dataUrl, mediaType }): Promise<void>` — best-effort; if it throws (quota), surface a warning toast but continue (text + corrections still persist).
  - `loadPageImage(fileHash, pageNum): Promise<{ dataUrl, mediaType } | undefined>`
  - `loadAllPageImages(fileHash): Promise<Map<number, { dataUrl, mediaType }>>` — used by `reloadJob`.

- `src/store/reloadJob.ts`:
  - `reloadJob(fileHash)` — see "Reload flow" below.

- `src/components/JobsList.tsx` — replaces the existing `RunHistory.tsx` (file deleted). Renders the Jobs table.

### Modified modules

- `src/store/persistence.ts` — bump `DB_VERSION` to 2; in the upgrade callback, create `jobs`, `corrections`, `pageImages` stores. No data migration is needed here.
- `src/pdf/render.ts`:
  - Add a fourth `LoadedDoc` variant for reloaded jobs:
    ```ts
    interface StoredDoc {
      type: 'stored';
      fileHash: string;
      pageCount: number;
      cache: Map<number, { dataUrl: string; mediaType: string }>;
    }
    ```
  - Extend `renderPageToPng` to handle `StoredDoc`: return `cache.get(pageNum)` if present, else `await loadPageImage(fileHash, pageNum)` (and cache it), else throw `MissingPageImageError`.
  - The existing `PdfDoc` / `ImageDoc` / `CombinedDoc` paths are unchanged.
- `src/store/ProjectContext.tsx`:
  - Remove the line in `setCurrentPageNum` that clears `corrections`.
  - Add an async effect: when `currentPageNum` or `fileHash` changes, call `loadCorrections(fileHash, currentPageNum)` and set the result.
  - Add an effect that, when `corrections` changes and `fileHash` is non-empty, calls `saveCorrections(fileHash, currentPageNum, corrections)`. Debounced ~200ms to coalesce rapid edits.
- `src/components/FileDrop.tsx`:
  - No FSA. No `showOpenFilePicker`. Existing file-input + drag/drop flow is unchanged.
  - After hashing and `setProject`, call `upsertJob({ fileHash, fileName, pageCount })`. Then `pruneJobs(20)`.
  - For image-only and combined inputs, immediately persist each image to `pageImages` (data is already in memory). For PDF inputs, persistence happens lazily as pages are rendered (see below).
- `src/components/BatchRunner.tsx`:
  - After `renderPageToPng` returns an image and before/after sending to the model, also `savePageImage(fileHash, n, img)`. One added line per render call.
  - Remove the `appendRun` call and the `runHistory` import.
- `src/components/FixPanel.tsx`:
  - Same: after `renderPageToPng` returns, also `savePageImage(fileHash, n, img)`.
- `src/components/PageImage.tsx` (display in editor):
  - Calls `renderPageToPng` — already works. For `StoredDoc`, this resolves from cache/store. If `MissingPageImageError` is thrown, show a small placeholder explaining the page wasn't OCR'd before this job was reloaded.
- `src/App.tsx`: rename the `history` tab key to `jobs`, render `<JobsList />` instead of `<RunHistory />`.
- `src/i18n/*`: rename `tabs.history` → `tabs.jobs`; add strings for Jobs columns, Reload, Delete, "saved in your browser only" privacy note, "page image not stored" placeholder.
- Delete `src/store/runHistory.ts`, `src/store/runHistory.test.ts`, `src/components/RunHistory.tsx`.

## Reload flow

Reload is trivial now — everything we need is in IndexedDB.

```ts
async function reloadJob(fileHash: string, ctx: { setProject }) {
  const job = await getJob(fileHash);
  if (!job) throw new Error('job missing');
  const [restored, imageMap] = await Promise.all([
    loadAllPageResults(fileHash),
    loadAllPageImages(fileHash),
  ]);
  const doc: StoredDoc = {
    type: 'stored',
    fileHash,
    pageCount: job.pageCount,
    cache: imageMap,
  };
  ctx.setProject({ doc, fileHash, fileName: job.fileName, restored });
  await upsertJob({ fileHash, fileName: job.fileName, pageCount: job.pageCount }); // advances lastOpenedAt
  // Caller switches the active tab to Editor.
}
```

After this returns, the editor works for every page that has a stored image. Pages without one (never rendered) show the placeholder; OCR'ing them would require re-loading the PDF (a clear message, not a generic error).

## Corrections persistence

- `Correction` already carries `status: 'pending' | 'accepted' | 'rejected'`.
- The full array (whatever its state) is written to `corrections[fileHash:pageNum]` after every change.
- Loading: when the user navigates to a page (or reloads a job), the array is fetched and put into context. If the array references `old`/`new` substrings no longer present in the page text (e.g., the text was edited after accepting), the rendering layer already handles this in `accept()` by marking such items rejected; no schema change needed.
- Acceptance still calls `savePageResult` for the page text (existing behavior).

## Page-image persistence

- Every call to `renderPageToPng(loadedDoc, n)` in `BatchRunner` and `FixPanel` is followed by `savePageImage(fileHash, n, img)`. Best-effort: a `QuotaExceededError` is caught, logged, and shown as a non-blocking warning ("running low on storage — older jobs were pruned").
- For image-only and combined inputs, `FileDrop` saves each input page to `pageImages` once during load (the bytes are already in hand).
- The default storage DPI matches the render DPI used for OCR (200). Same bytes that the model saw are what gets stored — no quality loss for display.
- Storage budget: a typical 200-dpi PNG page is ~500 KB to ~2 MB. With `pruneJobs(20)` and a typical document size, the working set stays under ~1 GB. IndexedDB quotas on modern browsers are typically 60% of free disk; this is well within limits.

## Edge cases

- **Reload before any page was rendered**: `pageImages` for that hash is empty. The editor opens, every page shows the placeholder, text + corrections are still browseable, export still works (export uses text, not images).
- **A page was OCR'd but later page-image save failed (quota)**: the editor shows the placeholder for that page, text + corrections still work. No data loss.
- **Quota during file load (image-only)**: catch, warn, drop the page from `pageImages` (text still saves fine).
- **Deletion of the currently open job**: `JobsList` checks `useProject().fileHash`; if equal, calls `resetProject()` after `deleteJob`.
- **Two jobs converging on the same file**: not possible — `fileHash` is the key.
- **Loading the same file again after a job was pruned**: a fresh job is created. Whatever was lost (text, corrections, images) was lost on prune.

## UI

- Tab order unchanged: `OCR · Editor · Export · Jobs` (renamed from `History`).
- Header inside the Jobs tab: short privacy note "Saved in your browser only — clear browser data to remove."
- Table columns: **File** · **Pages** · **Status** (e.g. `32 ok · 3 edited · 5 pending`) · **Cost** (sum of `estimateCost` over per-page tokens) · **Last opened** · **Actions** (Reload, Delete).
- Empty state: existing `history.empty` string is renamed `jobs.empty`.
- Delete uses `window.confirm` with the file name.
- Reload disables the button while in flight; on failure, surfaces the error inline (a small red row under the button). It then auto-switches the active tab to **Editor** (controlled `Tabs` value in `App.tsx`).

## Testing

Unit:
- `src/store/jobs.test.ts` — upsert creates then updates `lastOpenedAt`; `listJobs` orders by recency; `deleteJob` cascades to `pageResults`, `corrections`, `pageImages`; `pruneJobs` keeps newest N.
- `src/store/correctionsStore.test.ts` — round-trip an array including pending/accepted/rejected statuses.
- `src/store/pageImagesStore.test.ts` — round-trip a dataUrl; `loadAllPageImages` returns a map ordered correctly.
- `src/store/reloadJob.test.ts` — happy-path reload (mock IDB returns text + images); reload with missing images returns a doc whose render throws `MissingPageImageError` for those pages.
- `src/store/persistence.test.ts` — existing tests still pass; add one verifying the v1 → v2 upgrade callback runs without losing existing `pageResults`.

Integration (manual until we wire jsdom + idb-fake):
- Load file A, OCR pages 1-5, run Fix on page 3, leave some corrections pending → switch pages → switch tabs → corrections still there.
- Reload the browser. Open the Jobs tab. Click Reload on the file. Verify text + corrections appear without a file picker, page 1-5 images render, pages 6+ show the placeholder.
- Delete the job → all IDB rows gone; loading the file again produces a fresh job.

## Migration

- `persistence.ts` `upgrade` callback at version 2: create stores `jobs`, `corrections`, `pageImages` only if they don't exist. Existing `pageResults` are untouched.
- On app startup (once), `localStorage.removeItem('llm_ocr_web:runHistory:v1')`. We do not synthesize Job rows from orphan `pageResults` — those rows had no `fileName`/`pageCount` and no images. Re-opening the file recreates the job naturally.

## Open questions / not in scope

- Renaming jobs. Out of scope; `fileName` updates if the user re-loads under a different name.
- Exporting/importing jobs. Out of scope.
- Storing thumbnails (lower DPI) separately from full images. Out of scope — single image per page.

## Acceptance criteria

1. Loading a file creates or updates a Jobs row.
2. Every page rendered by OCR or Fix has its image persisted to `pageImages`.
3. Switching pages, switching tabs, and reloading the browser all preserve corrections in their last status per page.
4. The Jobs tab lists every saved file with pages/status/cost/last-opened and has working Reload and Delete actions.
5. Reload opens the editor for the chosen file with no file picker and no permission prompt; text, corrections, and previously rendered page images are restored.
6. Pages with no stored image show a clear placeholder and do not crash the editor.
7. Delete removes the row, the page text, the corrections, and the page images from IDB; if the deleted job was open, the editor clears.
8. The `localStorage` `runHistory` key no longer exists; the History tab is gone; `BatchRunner` no longer writes anywhere about runs.
