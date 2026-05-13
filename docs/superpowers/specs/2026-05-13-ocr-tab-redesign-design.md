# OCR tab redesign — Design

**Date:** 2026-05-13
**Scope:** Rework the OCR tab so settings collapse out of view, the drop/upload area is the whole region (no inner button) and supports appending more files, pages are shown as thumbnails with a Grid/List/Compact view picker, and selection uses file-explorer semantics (plain click = select one, Ctrl/Cmd = toggle, Shift = range). Settings, drop strip, run toolbar, and thumbnails are stacked top-down.

## Goals

1. The OCR tab, with no file loaded, shows only a full-size dashed drop/upload area whose entire surface is the file picker — no separate "Choose file" button.
2. Provider, model, API key, batch size, and OCR prompt move into a collapsible **Settings** panel inside the OCR tab. Collapsed by default; the open/closed state persists across reloads.
3. Once a file is loaded, the OCR tab shows: a compact drop strip, the collapsible Settings, a single run toolbar (Start all / Retry failed / Stop / printer-style page range / view picker), an optional selection context bar, the thumbnails area, and a "Show log" toggle — in that order.
4. Pages render as image thumbnails in one of three views — **Grid** (default, ~140 px tiles), **Compact** (~80 px tiles), **List** (one row with metadata) — controlled by a view picker. The active view persists across reloads.
5. Selection follows file-explorer semantics: plain click selects only that page, Ctrl/Cmd-click toggles one in/out, Shift-click selects the contiguous range from the selection anchor. Double-click jumps to the Editor tab focused on the clicked page.
6. Dropping more files onto a loaded project **appends** them as additional pages. The project's existing IDB rows (text, corrections, page images) are re-keyed to the newly-computed `fileHash` in a single transaction, and the old Job row is retired. Append is "amend the current project," not "fork".

## Non-goals

- Reordering, deleting, or rotating pages from the thumbnails view.
- Changing what's stored per page (text, image, corrections). The Jobs+corrections spec from 2026-05-12 already covers that.
- Generating lower-DPI thumbnails. The existing 200 dpi PNG in `pageImages` is displayed via CSS scaling.
- Append for jobs reopened from the Jobs tab (`StoredDoc`). The original PDF bytes aren't available, so the drop strip disables append while a stored job is open.
- A separate Settings tab. Settings live inside the OCR tab as a collapsible panel.

## Architecture

### Top-down layout of the OCR tab

1. **Drop strip** — `DropStrip.tsx`. Empty state: full dashed box, whole surface clickable, copy "Drop a PDF or images here · or click anywhere to choose". Loaded state: single line — left side shows `{fileName} · {pageCount} pages · {nDone} done · {nTodo} to do · {nError} error` (zero-count groups are hidden), right side shows "Drop or click to add more · ⟲ Start over". `nDone = count(status ∈ {ok, edited})`, `nTodo = count(status === 'pending')`, `nError = count(status === 'error')`. Both states accept drag/drop and click. The hidden `<input type="file" multiple accept=".pdf,image/*">` is triggered by clicking the root element.
2. **Settings** — `CollapsibleSettings.tsx`. A `<details>`-based disclosure wrapping the existing `SettingsPanel`. Default closed. Open state stored in `localStorage` under `llm_ocr_web:ocrSettingsOpen:v1`.
3. **Run toolbar** — `RunToolbar.tsx`. One row: `▶ Start all (n)` · `Retry failed (n)` · `⏹ Stop` · `Pages [   ] [Run range] [Highlight in preview]` · (right-aligned) view picker `⬛ ☰ ▦`. Hidden until a file is loaded.

   - `Start all (n)` targets `n = count(status ∈ {pending, error})` — pages already `ok` or `edited` are **not** re-run, so user edits aren't overwritten. (Today's behavior re-runs everything except `ok`; this changes the `eligible` filter in the orchestrator to also exclude `edited`.)
   - `Retry failed (n)` targets `n = count(status === 'error')` (unchanged from today).
   - The page-range field is a single free-text input that accepts printer-style ranges — see §Page range syntax. `Run range` parses the input and runs those page numbers in order (deduped). `Highlight in preview` parses the same input and writes the page set into `selectedPages`, so the thumbnails light up with the selection ring — useful for previewing the range before running.
4. **Selection context bar** — rendered by `RunToolbar` only when `selectedPages.size > 0`: `{n} pages selected · [Run selected] [Clear]`.
5. **Thumbnails** — `PageThumbs.tsx`. Renders one of three views based on the picker state.
6. **Run log** — `RunLog.tsx`. Small "Show log (n)" toggle that expands to the same log pre block today's `BatchRunner` shows.

When no file is loaded, only the drop strip (empty state) renders. Settings is still available (and still collapsible).

### Storage layout (no new IDB stores)

This spec reuses the existing IDB layout from the 2026-05-12 jobs spec. New persistence is local-only:

| Key                                 | Storage      | Purpose                                |
| ----------------------------------- | ------------ | -------------------------------------- |
| `llm_ocr_web:ocrSettingsOpen:v1`    | localStorage | Disclosure state of CollapsibleSettings |
| `llm_ocr_web:pageView:v1`           | localStorage | `'grid' \| 'compact' \| 'list'`        |

Thumbnails read from the existing `pageImages` IDB store (key `${fileHash}:${pageNum6}`). Any page that has no stored image yet is lazy-rendered when its tile scrolls into view, and the resulting PNG is saved back to `pageImages` (best-effort, same quota-handling as today).

### Append flow (drop onto a loaded project)

```ts
async function appendFiles(files: File[], ctx: { project }) {
  // 1. Build a LoadedDoc from the new files using the same code paths as initial load.
  const { doc: addedDoc, bytes: addedBytes, displayName: addedName } = await buildFromFiles(files);

  // 2. Merge bytes for re-hashing.
  const oldHash = ctx.project.fileHash;
  const mergedBytes = concatBytes([ctx.project.bytes, ...addedBytes]);
  const newHash = await sha256(mergedBytes);

  // 3. Combine docs. Old and new may each be PdfDoc / ImageDoc / CombinedDoc; combine() flattens.
  const mergedDoc = combine(ctx.project.doc, addedDoc);
  const mergedName = `${ctx.project.fileName} + ${addedName}`;

  // 4. Re-key existing IDB rows from oldHash to newHash, then retire the old Job.
  //    `rekeyJob` runs in a single readwrite transaction over pageResults+corrections+pageImages+jobs:
  //      - for each key prefixed `${oldHash}:`, write the same value under `${newHash}:` and delete the old key.
  //      - upsert a Job row for newHash with the new pageCount; delete the Job row for oldHash.
  //    If newHash === oldHash (the added bytes were empty or yielded zero pages), this is a no-op.
  await rekeyJob({ oldHash, newHash, fileName: mergedName, pageCount: mergedDoc.pageCount });

  // 5. Carry over the existing page results — indices don't move; new pages are appended at the end.
  const restored = ctx.project.pages.slice();

  ctx.setProject({
    doc: mergedDoc,
    fileHash: newHash,
    fileName: mergedName,
    bytes: mergedBytes,
    restored,
  });

  await pruneJobs(20);
}
```

The combined byte set is held on `ProjectContext` (new `bytes: Uint8Array | null` field, see §State) so a follow-up append can re-hash without re-reading files. The bytes field is **not** persisted to IDB — it's only kept in memory while the project is open.

For `StoredDoc` (reloaded jobs), `bytes` is `null`, so append is disabled and the strip shows the "Drop disabled while a saved job is open" hint.

`rekeyJob` is a new function in `src/store/jobs.ts`. It performs the prefix-rewrite across all four stores in one transaction so a tab close mid-append cannot leave a partially-rekeyed project.

### Page range syntax

Printer-style ranges. A single text input parsed into a sorted, deduped, in-bounds `number[]` of zero-based page numbers.

- Tokens are separated by commas or whitespace: `1-3, 5  7-9,12`.
- A token is either a single integer (`5`) or a closed range `a-b` (`7-9`). The range is inclusive on both ends and may be reversed (`9-7` ≡ `7-9`).
- Integers are 1-based to match the visible page numbers; the parser converts to 0-based for the orchestrator.
- Open-ended ranges are allowed: `-3` means "from page 1 to 3"; `40-` means "from page 40 to the last page".
- Out-of-bounds numbers are clamped to `[1, pageCount]` and then deduped.
- Empty input ⇒ empty set; the `Run range` and `Highlight in preview` buttons disable.
- Malformed input (e.g. `1-a`) shows an inline red message under the field and disables both buttons. No alerts.

The parser lives in `src/lib/pageRange.ts` with a small test file covering the cases above.

### State changes — `ProjectContext`

Add fields:
- `bytes: Uint8Array | null` — combined source bytes for the current project; `null` for stored jobs. Cleared in `resetProject`.
- `selectionAnchor: number | null` — anchor used by shift-range selection. Set by plain click and Ctrl/Cmd-click. Cleared in `resetProject` and `clearSelection`.

Add methods:
- `setSelectedPages(next: Set<number> | ((prev: Set<number>) => Set<number>))` — direct setter so range/replace selection don't have to go through `togglePageSelected`.
- `selectAllPages()` — `setSelectedPages(new Set(pages.map((p) => p.pageNum)))`.
- `appendFiles(files: File[])` — implements the append flow above. No-op + warning when `bytes === null`.

`togglePageSelected` stays for Ctrl/Cmd-click. The empty `corrections` clear path (already removed in commit c3263f7) stays as-is.

### New components

- `src/components/DropStrip.tsx` — replaces `FileDrop`. Single component, two render branches (empty vs loaded). Wires `loadProjectFiles(files, mode)` (extracted helper).
- `src/components/CollapsibleSettings.tsx` — disclosure wrapper around `SettingsPanel`. Persists open state.
- `src/components/RunToolbar.tsx` — pulls all run-control UI out of `BatchRunner`. Renders the view picker on the right side and the selection context bar below itself when selection is non-empty.
- `src/components/RunLog.tsx` — small "Show log" disclosure extracted from `BatchRunner`. Owned by `RunToolbar`'s parent because the log is shared with the (lazy thumb render) pipeline as well — actually, see "Logging consolidation" below.
- `src/components/PageThumb.tsx` — one tile. Owns `IntersectionObserver` for lazy thumb fetch/render. Renders differently per `mode`.
- `src/components/PageThumbs.tsx` — replaces `PageList`. Owns the view picker state, the selection anchor handling, and the keyboard shortcuts (`Ctrl/Cmd-A`, `Esc`). Also exposes `Run selected` callback via context-bar buttons in `RunToolbar` (both components consume `ProjectContext`; no prop drilling needed).
- `src/hooks/useBatchRunner.ts` — extracted from today's `BatchRunner.tsx`. Owns `running`, `log`, `abortController`, and exposes `startAll`, `retryFailed`, `runRange(pageNums)`, `runSelected`, `stop`. The `eligible` filter used by `startAll` is `status === 'pending' || status === 'error'` — `ok` and `edited` are excluded so user edits are never overwritten by a blanket "Start all". `RunToolbar` and `RunLog` consume this hook via a small `BatchRunnerProvider` placed in `App.tsx` around the OCR tab content.

### Modified modules

- `src/App.tsx` — OCR tab content becomes (in order): `<DropStrip /> · <CollapsibleSettings /> · <RunToolbar /> · <PageThumbs /> · <RunLog />`, all wrapped in `<BatchRunnerProvider>`.
- `src/store/ProjectContext.tsx` — adds `bytes`, `selectionAnchor`, `setSelectedPages`, `selectAllPages`, `appendFiles`. `setProject` accepts an optional `bytes` parameter.
- `src/store/jobs.ts` — adds `rekeyJob({ oldHash, newHash, fileName, pageCount })` per §Append flow.
- `src/pdf/render.ts` — `combine()` accepts any `LoadedDoc` (PdfDoc / ImageDoc / CombinedDoc) on either side and flattens to a single `CombinedDoc` (any PDF pages first, all image pages concatenated after). Existing single-PDF + single-image-set path keeps working.
- `src/i18n/translations.ts` — see "Strings" below.

### Deleted files

- `src/components/FileDrop.tsx`
- `src/components/BatchRunner.tsx`
- `src/components/PageList.tsx`

### Logging consolidation

Today, `BatchRunner` owns the run log. After the split, the log lives in `useBatchRunner` and `RunLog` is a thin component that subscribes to it. `PageThumbs`'s lazy-render code does **not** append to the run log — lazy thumb errors are surfaced only on the affected tile (as the existing `MissingPageImageError` placeholder).

## Thumbnails

### Image source

- For each visible tile, `PageThumb` calls `loadPageImage(fileHash, pageNum)`. If present, displays the data URL.
- If absent and the loaded doc is `PdfDoc`/`ImageDoc`/`CombinedDoc`: lazy-render via `renderPageToPng(loadedDoc, pageNum)` on `IntersectionObserver` callback, then `savePageImage(fileHash, n, img)` (best-effort, quota errors logged but not surfaced beyond a console warning — the tile just stays as a placeholder if save fails).
- If absent and the loaded doc is `StoredDoc`: show the existing "page image not stored" placeholder.

Rendering happens at the same 200 dpi the model sees. CSS scales the `<img>` down to tile size — no separate thumb pipeline.

### Three views

- **Grid (default)** — CSS `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));`. Each tile has `aspect-ratio: 1/√2` (A4-ish) and shows the page image cover-cropped. Overlays: page number badge (top-leading), status dot (top-trailing). Status colors match the existing palette: pending gray, running animated blue, ok green, error red, edited amber. Selected tiles get a 2 px blue ring; the "viewing in editor" page gets a 1 px gray ring.
- **Compact** — same as Grid with `minmax(72px, 1fr)`, smaller fonts, status shown as a 2 px border color instead of a dot to save room.
- **List** — `flex-direction: column`. Each row: 40×56 px thumbnail, page number, status label, char count when `ok`, error text when `error`. No overlap of selection ring with the image — the whole row gets a tinted background when selected.

### Selection model

State in `PageThumbs`:
- Reads `selectedPages` and `selectionAnchor` from `ProjectContext`.
- On plain click of page `n`:
  - `setSelectedPages(new Set([n]))`
  - `setSelectionAnchor(n)`
- On Ctrl/Cmd-click of page `n`:
  - `togglePageSelected(n)`
  - `setSelectionAnchor(n)`
- On Shift-click of page `n`:
  - If `selectionAnchor === null`, treat as plain click.
  - Else compute the inclusive `[min(anchor, n), max(anchor, n)]` range, `setSelectedPages(new Set(range))`. Anchor is **not** moved on shift-click.
- On double-click of page `n`:
  - `setCurrentPageNum(n)` and switch the App tab to `editor`. (The OCR tab raises an `onOpen` callback handed in by `App.tsx`, same pattern Jobs uses.)
- On `Ctrl/Cmd-A` while focus is inside the thumbnails container:
  - `selectAllPages()`. Anchor unchanged.
- On `Esc`:
  - `clearSelection()`. Anchor cleared.

### Persistence of view picker

`llm_ocr_web:pageView:v1` in localStorage. Default `grid`. Read once on mount; written on change.

## UI details

### Strings (Hebrew + English)

Add these keys to `src/i18n/translations.ts`:

- `drop.empty.title` — "Drop a PDF or images here"
- `drop.empty.hint` — "or click anywhere to choose"
- `drop.loaded.summary.name` — "{name}"
- `drop.loaded.summary.pages` — "{pages} pages"
- `drop.loaded.summary.done` — "{n} done"
- `drop.loaded.summary.todo` — "{n} to do"
- `drop.loaded.summary.error` — "{n} error"
- `drop.loaded.appendHint` — "Drop or click to add more"
- `drop.loaded.startOver` — "Start over"
- `drop.loaded.startOverConfirm` — "Discard the currently loaded files and start over?"
- `drop.disabledForStoredJob` — "Drop disabled — a saved job is open"
- `settings.toggle` — "Settings"
- `batch.selectedBar` — "{n} pages selected"
- `batch.runSelected` — already exists
- `batch.clearSelection` — already exists
- `batch.range.placeholder` — "e.g. 1-3, 5, 7-9"
- `batch.range.invalid` — "Can't parse range"
- `batch.highlightInPreview` — "Highlight in preview"
- `view.grid` — "Grid"
- `view.compact` — "Compact"
- `view.list` — "List"
- `thumb.placeholderTooltip` — "Page image not stored — re-load the source file to render"

Remove unused: `file.choose`, `file.dropHint`, `file.formatHint` (replaced by `drop.empty.*`); `pages.selectHint` (no longer needed).

### Drop strip visual

- Empty: `border: 2px dashed`, `border-radius: 8px`, `padding: 48px`, blue tint on dragover.
- Loaded: `border: 1px dashed`, `border-radius: 6px`, `padding: 8px 12px`, same blue tint on dragover. Strip height ≈ 36 px.

### Run toolbar visual

- A single flex row, gap 8 px, wraps on narrow screens.
- Primary buttons (`Start all`) use the existing primary button style.
- Range inputs reuse the existing number inputs and the existing translation strings.
- View picker is a button group of three icon buttons (`⬛` Grid, `▦` Compact, `☰` List). Active button gets a filled background. `aria-pressed` reflects active state.

## Edge cases

- **Append while OCR is running**: allowed. The new pages enter `pending`. The active batch keeps targeting its original index set (no re-targeting). The log records "appended {k} pages at indices {i…j}".
- **Append onto a stored job (`StoredDoc`)**: the drop strip surface still accepts drops but `appendFiles` no-ops and surfaces `drop.disabledForStoredJob` as an inline notice for ~3 seconds.
- **Drop while empty state is hovered**: same as today — handled, sets the loaded state.
- **Mixed drop with unsupported file types**: ignore them silently (matches today). If no supported files, show the existing "errorMixed" error inline under the strip.
- **Double-click on a `pending` page**: still switches to Editor at that page; the Editor shows the placeholder until OCR runs.
- **Shift-click with no anchor (fresh project)**: treated as plain click on the clicked page. Anchor becomes that page.
- **Ctrl-A in an input field inside the OCR tab**: native text selection wins. The thumbs container only owns `Ctrl-A` when `document.activeElement` is inside `PageThumbs`.
- **Run selected with selection mixing `ok`/`edited` and non-`ok`/`edited`**: still re-runs the full selection (explicit user action — the user picked these pages, so OCR overwrites them). This is different from `Start all`, which protects `edited` pages because the user didn't pick them individually.
- **Selection survives view-picker change**: yes. Switching Grid↔Compact↔List leaves `selectedPages` intact.
- **Quota exhaustion during lazy thumb save**: console warn, tile keeps showing the image in memory but won't survive a reload. No toast — too noisy.
- **`localStorage` quota / disabled**: settings disclosure and view picker fall back to in-memory state. Already covered by the existing `try/catch` pattern.

## Migration

- No IDB migration. Existing `pageImages`/`pageResults`/`corrections`/`jobs` stores keep their shape.
- No localStorage migration. The new keys (`ocrSettingsOpen:v1`, `pageView:v1`) appear on first use.
- Files deleted (`FileDrop.tsx`, `BatchRunner.tsx`, `PageList.tsx`): their imports are removed from `App.tsx`. No dynamic imports point at them.

## Testing

Unit:
- `src/components/DropStrip.test.tsx` — empty-state render; click triggers picker; drop replaces; drop onto loaded calls `appendFiles`; "Start over" calls `resetProject` (after confirm).
- `src/components/PageThumbs.test.tsx` — plain click replaces selection; Ctrl-click toggles + moves anchor; Shift-click replaces selection with anchor-to-clicked range; double-click calls `onOpen` with page number; Ctrl-A selects all; Esc clears.
- `src/components/PageThumb.test.tsx` — lazy renders on intersection; reuses cached `pageImages` value; renders placeholder for `StoredDoc` missing images; status colors map correctly.
- `src/components/CollapsibleSettings.test.tsx` — default collapsed; opening writes `ocrSettingsOpen:v1`; reading the localStorage value on mount restores state.
- `src/components/RunToolbar.test.tsx` — selection context bar appears only when `selectedPages.size > 0`; view picker writes `pageView:v1`.
- `src/store/ProjectContext.test.tsx` — `appendFiles` updates `pageCount`, advances `fileHash`, carries over restored pages, no-ops on stored doc.
- `src/store/jobs.test.ts` — `rekeyJob` moves all four stores' rows from oldHash to newHash atomically and deletes the old Job row; partial-failure case is rolled back by the transaction.
- `src/lib/pageRange.test.ts` — single integers, simple ranges, reversed ranges (`9-7`), open-ended ranges (`-3`, `40-`), out-of-bounds clamping, dedupe across overlapping tokens, empty input → empty set, malformed input → error.
- `src/pdf/render.test.ts` — `combine()` accepts nested combined docs.

Integration (manual until jsdom + idb-fake are wired):
1. Cold load, drop a PDF: empty state replaced by drop strip + thumbs (Grid). View picker switches all three modes.
2. Plain click page 5: only 5 selected. Shift-click page 12: 5–12 selected. Ctrl-click page 8: 8 removed. Double-click page 10: Editor tab opens on page 10.
3. Drop a second PDF: thumbs grow; old pages keep their text; new `fileHash` appears in Jobs; old Job row still present.
4. Reload the browser, open the new Job from Jobs tab, try to drop: see the "drop disabled" inline notice.
5. Toggle Settings open, change provider, reload browser: Settings stays open with new provider selected.

## Acceptance criteria

1. With no file loaded, the OCR tab shows only the full-size dashed drop area. The whole area is the file-picker click target; there is no inner "Choose file" button.
2. Settings (provider, model, API key, batch size, OCR prompt) live in a collapsible panel inside the OCR tab; collapsed by default; state persists across reloads.
3. With a file loaded, the OCR tab renders top-down: drop strip · Settings · run toolbar · (optional selection bar) · thumbnails · "Show log" toggle.
4. The run toolbar exposes Start all, Retry failed, Stop, a printer-style page range field with Run range + Highlight in preview, and a Grid/List/Compact view picker on the right. Active view persists. `Start all` skips pages whose status is `ok` or `edited`.
5. Thumbnails show actual page images from `pageImages` (or lazy-rendered on first scroll-into-view). Status is visually distinguishable in all three views.
6. Selection works file-explorer style: plain click selects one, Ctrl/Cmd-click toggles, Shift-click selects an inclusive range from the anchor. Double-click opens the page in the Editor tab. `Ctrl-A` selects all; `Esc` clears.
7. Dropping more files onto a loaded project appends them as additional pages, recomputes the file hash, and re-keys the existing IDB data (text, corrections, page images, Job row) from the old hash to the new one in a single transaction. After append, exactly one Job row exists for this project — the one under the new hash. Drop is disabled (with a clear inline message) when the loaded doc came from a Jobs reload.
8. Run log toggle still works and still shows the same per-page success/failure entries.
