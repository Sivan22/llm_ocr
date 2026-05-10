# llm_ocr_web — Design

**Date:** 2026-05-10
**Status:** Draft, awaiting approval

## Summary

A static, client-side web app hosted on GitHub Pages that lets a user OCR
Hebrew/Jewish texts (Chassidus books, old Rashi-script prints, manuscript
scans) using vision LLMs, then proofread the OCR output against the original
image and download the result as a DOCX file.

The app is inspired by two existing projects:

- `~/llm_ocr/main.py` — a Python/Flet desktop app that does the same OCR loop
  against the Vercel AI Gateway. Source of: the OCR prompt, the three
  correction prompt templates (`general` / `headers` / `punctuation`), the
  `{old, new, reason}` correction-card UX, the parallel batch runner with
  size slider, and the resume-on-reopen behavior.
- `~/pdf_proofread/` — a Vite + React 19 + Tailwind v4 + Vercel AI SDK +
  mupdf-wasm static SPA also deployed to GitHub Pages. Source of: the build
  & deploy scaffolding, `src/store/settings.ts` versioned-localStorage
  pattern, `src/ai/providers.ts` route→provider factory pattern, the shadcn-
  style `components/ui` primitives, the Vitest test setup.

The new project is a **separate repo**, not a fork or a tab inside
pdf_proofread, but it copies pdf_proofread's scaffolding wholesale and
rebuilds OCR features on top.

## Goals

- One-page-at-a-time OCR via vision LLM, with a parallel batch runner for
  whole-document processing.
- Side-by-side editor (image | text | AI-fix panel) for one page at a time.
- LLM-assisted proofreading that returns a list of `{old, new, reason}`
  corrections, rendered as accept/reject diff cards with inline minimal
  char-level diff highlighting.
- Final download as DOCX produced from a markdown intermediate (so `**bold**`
  headers, `## headings`, paragraphs survive into Word).
- Resume on reopen: if the same file is loaded again, prior OCR results are
  rehydrated from IndexedDB.

## Non-goals (v1)

- No backend, no proxy, no server-side rendering. All API calls go directly
  from the browser to the chosen provider.
- No collaborative / multi-user state. Single-user, single-tab.
- No automatic provider fallback or model routing logic. The user picks one
  route + model per session.
- No PDF annotations / re-emission. Output is DOCX only. (The original
  pdf_proofread emits an annotated PDF; this app does not.)
- No translation, no semantic editing, no LLM-driven structural changes
  beyond the three correction modes plus a free-form custom prompt slot.
- No mobile-first layout. Desktop-class viewports (≥ 1280px) are the target.
- No E2E browser tests for v1.

## Stack

| Concern | Choice | Rationale |
|---|---|---|
| Build | Vite | Already used in pdf_proofread; trivial GH Pages deploy. |
| UI | React 19 + TypeScript | Reuse pdf_proofread component patterns directly. |
| Styling | Tailwind v4 + shadcn-style primitives | Copy `components/ui/*` from pdf_proofread. |
| LLM SDK | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`) | One unified `generateText` call across all four providers. |
| PDF rendering | `mupdf` (WASM) | Same lib pdf_proofread uses; renders a page to PNG bytes in-browser. |
| Markdown→DOCX | `docx` npm + `marked` (or `remark`) | Pure-JS, runs in the browser. RTL emitted per paragraph. |
| Diff | `diff` npm | Char-level minimal diff for DiffCard inline highlight. |
| IndexedDB | `idb` npm | Tiny wrapper over IndexedDB; one object store. |
| Testing | Vitest + fake-indexeddb | Same as pdf_proofread. |

## Providers (runtime selection)

The user chooses one of four routes in Settings, plus a model on that route:

| Route | Models | API key field | Notes |
|---|---|---|---|
| `anthropic` | `claude-opus-4-7`, `claude-sonnet-4-6` | Anthropic key | Browser direct; needs `anthropic-dangerous-direct-browser-access: true` header (mirrors pdf_proofread). |
| `google` | `gemini-3.1-pro-preview` | Google key | Browser direct. |
| `openai` | `gpt-4o`, `gpt-4o-mini` | OpenAI key | Browser direct. |
| `gateway` | All of the above via gateway IDs (`anthropic/claude-opus-4-7`, `google/gemini-3.1-pro-preview`, `openai/gpt-4o`) | Vercel AI Gateway key | Single key for any backend model. |

`isRouteModelValid(route, model)` and `resolveModelId(route, model)` follow
pdf_proofread's `src/ai/providers.ts` shape.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  llm_ocr_web  (static SPA, GitHub Pages)                        │
│                                                                 │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────┐   │
│  │  React UI    │───▶│  Runner core   │───▶│  AI SDK        │   │
│  │  (4 tabs)    │    │  (TS, no UI)   │    │  4 providers   │   │
│  └──────┬───────┘    └────────┬───────┘    └────────────────┘   │
│         │                     │                                 │
│         ▼                     ▼                                 │
│  ┌──────────────┐    ┌────────────────┐                         │
│  │ React hooks  │    │ mupdf-wasm     │                         │
│  │ + context    │    │ render page→PNG│                         │
│  └──────┬───────┘    └────────────────┘                         │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐    ┌────────────────┐                         │
│  │ localStorage │    │ IndexedDB      │                         │
│  │ (settings)   │    │ (page results) │                         │
│  └──────────────┘    └────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Tabs

1. **Setup** — provider/model dropdowns, API key fields (one per route, only
   the active route's key is required), batch size slider, five editable
   prompt templates: `ocr`, `general`, `headers`, `punctuation`, `custom`.
   The three correction templates are pre-filled with the strings in
   `~/llm_ocr/main.py`'s `CORRECTION_PROMPTS`. The `custom` template is
   empty by default.
2. **OCR** — file drop zone (PDF or images, both accepted), page list with
   per-page status chips, batch runner controls (Start / Stop / Retry
   Failed), progress bar, expandable log.
3. **Editor** — page navigator (dropdown + prev/next buttons), three-column
   layout: page image | RTL OCR textarea | AI-fix panel. The fix panel has
   four buttons (General Fix, Fix Headers, Fix Punctuation, Custom) plus
   the resulting DiffCard list with Accept / Reject / Accept All / Reject
   All controls.
4. **Export** — markdown preview pane + "Download .docx" button. Filename is
   `<original-stem>_ocr.docx`.

## Module / file layout

```
src/
├── main.tsx, App.tsx, index.css
├── ai/
│   ├── providers.ts        ← createModel(settings) for 4 routes
│   ├── ocr.ts              ← ocrPage(model, imageB64, prompt) → {text, tokensIn, tokensOut}
│   ├── correct.ts          ← correctPage(model, image, text, prompt) → Correction[]
│   └── pricing.ts          ← per-model in/out token rates
├── pdf/
│   ├── render.ts           ← mupdf wrapper: openPdf(bytes), renderPageToPng(doc, n, dpi)
│   └── hash.ts             ← sha256(bytes) → hex (web crypto)
├── runner/
│   ├── orchestrator.ts     ← parallel batch runner: queue, concurrency, stop/retry, AbortController
│   └── prompt.ts           ← {text} placeholder substitution + template registry
├── store/
│   ├── settings.ts         ← localStorage: apiKeys, route, model, batchSize, prompts
│   ├── project.ts          ← in-memory project state (pages, currentPage, mupdfDoc)
│   ├── persistence.ts      ← IndexedDB layer for PageResults
│   └── runHistory.ts       ← last 20 runs in localStorage
├── docx/
│   ├── markdown.ts         ← join page texts into one MD string
│   └── export.ts           ← md → docx blob, RTL paragraphs
├── components/
│   ├── ui/                 ← shadcn-style primitives copied from pdf_proofread
│   ├── FileDrop.tsx
│   ├── SettingsPanel.tsx
│   ├── PromptEditor.tsx
│   ├── PageList.tsx
│   ├── BatchRunner.tsx
│   ├── EditorView.tsx
│   ├── PageImage.tsx
│   ├── OcrTextarea.tsx
│   ├── FixPanel.tsx
│   ├── DiffCard.tsx
│   ├── CostSummary.tsx
│   ├── RunHistory.tsx
│   └── ExportPanel.tsx
└── lib/
    ├── diff.ts             ← minimal char-level diff for DiffCard
    └── utils.ts            ← cn(), formatBytes, etc.
```

## Key types

```ts
type Route = 'anthropic' | 'google' | 'openai' | 'gateway';
type Model =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'gemini-3.1-pro'
  | 'gpt-4o'
  | 'gpt-4o-mini';

type Status = 'pending' | 'running' | 'ok' | 'error' | 'edited';

type PageResult = {
  pageNum: number;          // 0-indexed
  text: string;             // OCR / edited text
  status: Status;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
};

type Correction = {
  id: string;               // uuid
  old: string;
  new: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
};

type FixMode = 'general' | 'headers' | 'punctuation' | 'custom';

type Settings = {
  version: 1;
  route: Route;
  model: Model;
  apiKeys: { anthropic: string; google: string; openai: string; gateway: string };
  batchSize: number;        // 1-100
  prompts: Record<'ocr' | FixMode, string>;
};
```

## Data flow

### 1. Load

User drops a PDF (or one or more images) onto the OCR tab.

- PDF path: `pdf/render.openPdf(bytes)` → mupdf doc handle held in
  `useRef`. `pdf/hash.sha256(bytes)` → fileHash. `pages` is initialized to
  `[{ pageNum: 0, status: 'pending' }, ..., { pageNum: N-1, status: 'pending' }]`.
- Image path: each dropped file becomes one synthetic page; we read its
  bytes, compute a combined hash over the concatenation, and skip mupdf
  entirely. `renderPageToPng(pseudoDoc, n)` returns the original image
  bytes for that page.
- Mixed: PDF pages first (in PDF order), then image pages (in drop order).
  The fileHash for a mixed session is `sha256(pdfBytes || image1Bytes || image2Bytes || ...)` — i.e. the concatenation in load order, so re-dropping the same set in the same order resumes the session.
- After init: `persistence.loadAll(fileHash)` → hydrate `pages[i].text` /
  `status` for any pages that were processed in a previous session.
- The mupdf doc itself is **not** stored in IndexedDB. If the user reloads
  without re-dropping the file, page images are unavailable but text
  results are restored; the UI explains this and asks them to re-drop.

### 2. OCR (batch)

`runner/orchestrator.run({ pages, concurrency, abortSignal, onProgress })`:

- Filters to pages where `status !== 'ok'`.
- Runs up to `concurrency` (= `settings.batchSize`) in parallel via a
  Promise pool.
- For each page:
  1. `imageB64 = await pdf/render.renderPageToPng(doc, pageNum, dpi=200)`
  2. `result = await ai/ocr.ocrPage(model, imageB64, settings.prompts.ocr)`
     with 3 retries (5s/10s/15s backoff) on transient failure.
  3. `store.setPage({ ...result, status: 'ok' })`
  4. `persistence.save(fileHash, pageResult)` (debounced 500ms).
- Stop button calls `abortController.abort()` → in-flight requests cancel,
  pages still queued go back to `'pending'`.
- Retry Failed button reruns only pages whose status is `'error'`.

### 3. Edit + AI proofread (one page)

In the Editor tab, with a page selected:

- Manual edits to the textarea are saved on blur or via a Save Text button;
  status flips to `'edited'`.
- Clicking a fix-mode button (General Fix / Fix Headers / Fix Punctuation /
  Custom). The Custom button is disabled when `settings.prompts.custom` is
  empty:
  1. Substitute `{text}` in `settings.prompts[mode]` with the current
     textarea value. (The OCR prompt has no placeholders; only correction
     prompts use `{text}`.)
  2. `ai/correct.correctPage(model, currentImageB64, prompt)` →
     `Correction[]`.
  3. JSON parsing follows the Flet app's `parse_corrections_json`: strip
     ```` ```json ```` fences, `JSON.parse`, drop entries missing `old`
     or `new`, return `[]` on any error.
  4. Render each correction as a DiffCard with inline char-level diff
     highlight.
- Accept (single) → `text = text.replace(old, new)` once (first match
  only). Update store, persist. Card turns green.
- Reject (single) → card greys out, status `'rejected'`.
- Accept All / Reject All → bulk apply.
- Edge case: if `old` is no longer in `text` at accept time (because the
  user manually edited or a previous accepted correction removed it), the
  accept becomes a no-op and the card shows "no longer matches" and is
  marked `rejected`.
- Switching pages clears the correction list (matches Flet behavior).

### 4. Export

`ExportPanel` shows a live markdown preview and a Download button.

- `docx/markdown.join(pages)`:
  - Concatenate `pages[i].text` in order.
  - Skip `MISSING` pages silently (settings toggle could make this
    `[page N missing]` instead — v1 default: skip).
  - Paragraphs separated by blank lines.
  - `**bold**` and `## headings` are preserved verbatim.
- `docx/export.mdToDocx(md)`:
  - Parse markdown via `marked` (or `remark`).
  - Emit a `docx` `Document` with one section.
  - Every paragraph: `bidirectional: true`, alignment right.
  - Bold runs → `bold: true` text runs.
  - `# / ## / ###` → `HeadingLevel.HEADING_1/2/3`.
- `saveAs(blob, "<filename>_ocr.docx")` via `file-saver` or a manual `<a
  download>` click.

## State management

No third-party state library. Two contexts at the App root:

- `SettingsContext` — wraps `useSettings()`, returns `{ settings, update,
  reset }`. `update` partial-merges and writes to localStorage.
- `ProjectContext` — wraps `useProject()`, returns `{ pages, fileHash,
  fileName, currentPageNum, mupdfDocRef, ... }`. Setter functions update
  pages immutably and trigger debounced persistence.

DiffCard list lives in `FixPanel.tsx`'s local `useState`, intentionally
discarded on page navigation (matches Flet behavior; corrections are not
persisted).

## Persistence

### localStorage

Single key: `llm_ocr_web:settings:v1`. Versioned schema. On load, if the
parsed JSON's `version` doesn't match, run migrations (v1 only for now —
future: v2 migrations live in `store/settings.ts`).

`runHistory` uses a separate key: `llm_ocr_web:runHistory:v1`, capped at 20
entries.

### IndexedDB

DB name: `llm_ocr_web`. Object store: `pageResults`. Key: `${fileHash}:${String(pageNum).padStart(6, '0')}`.
Value: `PageResult`.

Writes are debounced 500ms per page. Reads are bulk on file load via a
range query: `IDBKeyRange.bound(${fileHash}:000000, ${fileHash}:999999)`.

If quota is exceeded, `persistence.save` swallows the error, surfaces a
toast warning once per session, and continues in-memory only.

## Error handling

| Source | Failure | Behavior |
|---|---|---|
| OCR call | Network / 5xx | Retry 3× with 5s/10s/15s backoff. After: `status='error'`, message stored, page red, eligible for Retry Failed. |
| OCR call | 401 / 403 | Abort batch immediately. Toast: "API key invalid". No further pages processed. |
| OCR call | 429 | Backoff with jitter (still within the 3-retry budget). |
| OCR call | Aborted by user | `status='pending'` (not `'error'`). |
| Correction | Non-JSON response | Return `[]`. Show "No corrections found." |
| Correction | JSON valid but malformed entries | Drop bad entries, keep good ones, log to console. |
| mupdf | Open failure | Friendly error: "PDF appears corrupted or password-protected." No page list. |
| IndexedDB | Quota exceeded | One-time toast, fall back to in-memory only. |
| DOCX export | No OK pages | Disable Download button with explanatory tooltip. |

A top-level React `<ErrorBoundary>` wraps the app to catch render-time
crashes; its fallback offers a Reload button.

## Testing

Vitest, mirroring pdf_proofread's setup. Unit tests only.

- `ai/providers.test.ts` — `resolveModelId()` for each route×model;
  `createModel()` throws on missing key per route.
- `ai/correct.test.ts` — `parseCorrections()` against: clean JSON, ```` ```json ```` fenced, leading prose, malformed entries (missing `old` / `new`), empty array, garbage input.
- `ai/pricing.test.ts` — known-model rate lookup; cost computation for given token counts.
- `runner/prompt.test.ts` — `{text}` placeholder substitution, multi-occurrence, missing placeholder, escape behavior.
- `runner/orchestrator.test.ts` — concurrency cap honored; abort cancels in-flight; retries on transient failure; final state after stop+resume.
- `store/settings.test.ts` — defaults, load corrupt JSON, schema migration, multi-line prompt round-trip.
- `store/persistence.test.ts` — save/load by `(fileHash, pageNum)`; fileHash isolation between docs. Uses `fake-indexeddb`.
- `store/runHistory.test.ts` — append, cap at 20, ordering.
- `docx/markdown.test.ts` — page joining, missing-page handling, bold/heading preservation.
- `lib/diff.test.ts` — minimal-diff alignment for typical Hebrew corrections (single-letter swap ד/ר, whole-word replacement, multi-word).

The Vercel AI SDK is mocked at the boundary: tests pass canned `model`
objects into `ocrPage` / `correctPage` rather than hitting the network.

Not tested in v1: mupdf rendering (thin upstream wrapper), React component
snapshots, GH Pages workflow.

## Build & deploy

`.github/workflows/deploy.yml` copied from pdf_proofread. Only difference
is `VITE_BASE=/llm_ocr_web/` (or whatever the GH repo is named). Pushes to
`main` rebuild and publish `dist/` to GitHub Pages.

## Open questions / future work

- Multi-page DOCX export with explicit page breaks (currently v1 default is
  "no page breaks").
- Per-page accepted-corrections audit log (currently corrections are
  ephemeral on page navigation).
- Project file export/import (.json archive of settings + pages + edits)
  for sharing or long-term archival.
- Streaming OCR responses for the per-page editor view (low priority —
  pages are short enough that non-streaming is fine).
