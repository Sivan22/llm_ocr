# A/B Segmentation Harness — Design

**Date:** 2026-06-04
**Status:** Draft, awaiting approval
**Branch:** `feat/ab-segmentation-harness`

## Summary

A throwaway-but-graduatable evaluation harness that answers one question on
real pages:

> Does cropping a two-column Chassidus page into regions and OCRing each
> region separately beat the current full-page, single-prompt OCR?

It renders selected pages from a test PDF, produces two transcriptions per
page — **A** (today's full-page pipeline) and **B** (segmented, per-region) —
and writes a self-contained, right-to-left HTML report for **human side-by-side
judgment**. There is no automated scoring.

The harness exercises the project's **real** OCR code path (`src/ai/ocr.ts`
`ocrPage` + the gateway provider) so a positive result validates the pipeline
we would actually ship. The cropping/detection logic is written as a clean,
dependency-light module so it can later move into `src/segment/` and run in the
browser (canvas / opencv.js) if B wins.

## Background

The production app (`llm_ocr`) is a fully client-side React SPA. It renders
each PDF page to one PNG (mupdf, 200 DPI) and sends the **whole page** plus a
single Hebrew prompt (`DEFAULT_OCR_PROMPT` in `src/store/settings.ts`) to a
vision LLM. That prompt pushes all layout logic onto the model: two-column RTL
reading order, stripping running headers/page numbers, marking internal
headers, and separating footnotes into a `הערות` block.

The hypothesis under test is that a **segment → crop → OCR-per-region**
pipeline improves transcription on dense two-column Rashi-script pages, and
that the win comes primarily from two mechanical levers:

1. **Higher effective resolution per region** — each column is rendered/cropped
   at a higher DPI instead of sharing one downsampled full-page image.
2. **Bounded output length** — shorter per-region generations drift and drop
   less than one long full-page generation.

This harness isolates and measures that, cheaply, before any product work.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Success metric | Side-by-side **human judgment** (no ground truth; the test PDF's text layer is garbled OCR and unusable). |
| Output | Self-contained RTL **HTML report**. |
| Implementation | **Pure TypeScript / Node** (approach A), reusing the real `ocrPage` + gateway path. |
| Model / route | Gateway route, model id `google/gemini-3.1-pro-preview`. |
| API key | From environment only — `AI_GATEWAY_API_KEY` (read from `.env`; never in code or chat). |
| Test input | `Hebrewbooks_org_740.pdf` (315 pages, ~507×651 pt). Pages selected via CLI arg. |
| First layout | Two-column Chassidus only. |

## Goals

- Render selected pages and produce A and B transcriptions for each.
- Make any segmentation failure **visible** in the report (drawn boxes, flags),
  never silent.
- Keep the detection/crop module clean enough to graduate to `src/segment/`.
- Show per-call token counts so the ~2–3× cost delta of B is visible.

## Non-goals

- No automated CER/WER/LLM-as-judge scoring.
- No `LayoutProfile` registry (Shas / Mikraot Gedolot etc.) — that comes only
  if B wins.
- No browser/app integration.
- No layout other than two-column.
- No use of the PDF's embedded text layer.
- No new runtime dependency in the shipped app (`tsx`/`pngjs` are devDeps used
  only by the harness).

## File layout

Everything under `scripts/ab-segment/`:

```
scripts/ab-segment/
  run.ts        # CLI entry: parse args, load .env, loop pages, orchestrate, write report
  render.ts     # mupdf in-process (dynamic import): page -> PNG bytes at a given DPI
  segment.ts    # GRADUATABLE: PNG -> projection profiles -> region bboxes; crop(png, bbox)
  prompts.ts    # B's per-region prompts (body, footnotes)
  ocr.ts        # thin wrapper over real ocrPage + gateway model; runA(), runB()
  report.ts     # build self-contained RTL HTML
  out/          # report.html + crop/overlay PNGs (gitignored)
```

`A`'s prompt is **imported verbatim** from `src/store/settings.ts`
(`DEFAULT_OCR_PROMPT`) so the baseline is exactly today's behavior. `segment.ts`
must not import anything from `scripts/` or the browser worker — only `pngjs`
and pure TS — so it can move to `src/segment/` unchanged.

Run:

```
npm run ab:segment -- --pages 4,5,12-15 --crop-dpi 400
```

`package.json` gains `"ab:segment": "tsx scripts/ab-segment/run.ts"` and, if not
already present, `tsx`, `pngjs`, and `dotenv` as devDependencies.

## CLI arguments

| Arg | Default | Meaning |
|---|---|---|
| `--pages` | `4,5,6` | Comma list / ranges (1-indexed) of pages to process. |
| `--pdf` | `Hebrewbooks_org_740.pdf` | Input PDF path. |
| `--out` | `scripts/ab-segment/out` | Output directory. |
| `--a-dpi` | `200` | DPI for the A (full-page) render — mirrors the app. |
| `--crop-dpi` | `400` | DPI for the B render that crops are taken from. |
| `--gutter <frac>` | (auto) | Force column-split x as a fraction of width; overrides detection. |
| `--footnote <frac>` | (auto) | Force body/footnote-split y as a fraction of height. |
| `--no-footnotes` | off | Treat the page as body-only (two column crops, no footnote crop). |

## Pipeline (per page)

1. **A (baseline):** `render(pdf, page, aDpi=200)` → `ocrPage(fullPagePng,
   DEFAULT_OCR_PROMPT)` — one call.
2. **B (segmented):** `render(pdf, page, cropDpi=400)` → `detectRegions(png)` →
   `crop(png, bbox)` per region → `ocrPage(crop, regionPrompt)` per region →
   stitch in RTL reading order.

Both A and B run through the same `ocrPage` and gateway model. The harness does
**not** add retry/backoff (that lives in the app's orchestrator); a simple
try/catch records any error string into the report cell so one bad page or
region does not abort the run.

## Region detection (`segment.ts`)

Operates on the `crop-dpi` render decoded to RGBA via `pngjs`.

1. **Grayscale + binarize.** Luminance threshold (default 128; ink = darker).
2. **Ink bounding box.** Trim white margins so projections ignore borders.
3. **Column gutter.** Vertical ink-projection (ink count per column x) within
   the central band `[0.30W, 0.70W]`. Find the widest contiguous run of columns
   whose ink is below a small fraction of the column max (a whitespace valley).
   Gutter x = midpoint of that run. If no valley is found, fall back to the
   geometric center (`0.5W`) and set a `gutterFallback` flag.
4. **Footnote split.** Horizontal ink-projection (ink count per row y) in the
   lower band `[0.50H, 0.95H]`. Detect **either** a horizontal rule (a row with
   ink spanning a large fraction of the width) **or** a whitespace valley wider
   than the typical line gap. Split y = that location. If none is found, the
   page is body-only and a `noFootnote` flag is set. `--no-footnotes` forces
   this; `--footnote <frac>` forces a specific split.
5. **Regions, in RTL reading order:**
   - `right-body`: `[gutterX .. rightInk]  ×  [topInk .. footY]`
   - `left-body` : `[leftInk  .. gutterX]  ×  [topInk .. footY]`
   - `footnotes` : `[leftInk  .. rightInk] ×  [footY  .. bottomInk]` (omitted
     when body-only)

`detectRegions(png) -> { regions: {role, bbox}[], flags: string[] }`.
`crop(png, bbox) -> pngBytes`.

The thresholds (central band, valley fraction, rule fraction) are module
constants with sensible defaults; tuning them is expected during the first run
and is why the override flags exist.

## Prompts for B (`prompts.ts`)

- **Body prompt** — a single-column adaptation of `DEFAULT_OCR_PROMPT`: old
  Rashi-script Chassidus, return text in order, drop running headers and page
  numbers, may mark internal headers / bold. Removes the **two-column ordering**
  text (each crop is already one column) and the **footnote-block** instructions
  (footnotes are a separate crop).
- **Footnote prompt** — tuned for small, dense type: plain faithful
  transcription, no header/page-number handling.

**Stitching:** `rightBody + "\n\n" + leftBody`, then, if a footnote crop was
OCR'd, append a separator and the footnote text:

```
<right column text>

<left column text>

---
הערות
---
<footnote text>
```

This mirrors the shape today's full-page prompt already emits, so A and B are
visually comparable in the report.

## OCR wrapper (`ocr.ts`)

- Builds the gateway model once: `createGateway({ apiKey:
  process.env.AI_GATEWAY_API_KEY })('google/gemini-3.1-pro-preview')` (or reuse
  `src/ai/providers.ts:createModel` with a synthesized gateway `Settings`).
- `runA(fullPagePng) -> { text, tokensIn, tokensOut }`
- `runB(crops) -> { stitched, perRegion: {role, text, tokensIn, tokensOut,
  cropPath}[], totalTokensIn, totalTokensOut }`
- Errors are caught and returned as a recorded error string, not thrown, so one
  bad page does not abort the run.

## HTML report (`report.ts`)

One self-contained `out/report.html`, one section per page:

- **Header:** page number; detection flags (`gutterFallback`, `noFootnote`,
  any override used); A vs B total token counts and the B/A ratio.
- **Overlay:** the full-page thumbnail with the detected region rectangles
  **drawn on it** (border pixels set via `pngjs`), so a clipped or misplaced
  crop is immediately obvious.
- **Side-by-side panels** (`dir="rtl"`): **A — full page** text vs **B — per
  region** stitched text. Under B, the individual crop thumbnails with their
  per-region text and token counts.

Images are embedded as base64 data URLs (or written alongside and linked) so the
report is portable. RTL and a Hebrew-friendly font are set in inline CSS.

## Environment & secrets

- The key is read only from `process.env.AI_GATEWAY_API_KEY`. The harness loads
  `.env` at startup via `dotenv` (added as a devDep).
- `.env` and `scripts/ab-segment/out/` **must** be gitignored before any commit.
  Verify/extend `.gitignore` accordingly.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Gutter/footnote detection misfires on some pages. | Override flags (`--gutter`, `--footnote`, `--no-footnotes`); detection flags in the report; crops always rendered so a bad box is **visible**. |
| mupdf in Node (ESM + top-level await). | Use dynamic `import('mupdf')`; call mupdf in-process (the browser worker wrapper is not used). |
| Cropping without canvas in Node. | Decode/encode PNG with `pngjs`; crop and draw overlays on the raw RGBA buffer. |
| B costs ~2–3× the tokens of A. | Report shows per-call and total token counts and the B/A ratio so cost is part of the judgment. |
| Secret leakage. | Key only via `.env`/env; `.env` gitignored; never printed. |

## Success criteria

The harness is "done" when, for a handful of selected pages, it produces one
HTML report where a human can, at a glance, compare A vs B transcriptions
against the page image and the crops, see detection flags, and see the token
cost delta — enough to decide go/no-go on building the segmentation feature.

## Out-of-scope follow-ups (only if B wins)

- Promote `segment.ts` to `src/segment/` and port detection to canvas/opencv.js.
- Introduce the `LayoutProfile` registry (2-col, then Vilna Shas, Mikraot
  Gedolot) with per-region prompts.
- Wire region OCR + stitching into the batch runner and editor.
