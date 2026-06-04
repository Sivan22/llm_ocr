# A/B Segmentation OCR Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node eval harness that, for selected pages of `Hebrewbooks_org_740.pdf`, produces two OCR transcriptions per page — **A** (today's full-page prompt) and **B** (crop-per-region) — and writes one self-contained RTL HTML report for human side-by-side judgment.

**Architecture:** A small set of focused modules under `scripts/ab-segment/`. Pure, unit-tested logic (CLI parsing, prompts, region detection, image crop/overlay, report HTML) is separated from I/O modules (`render.ts` = mupdf, `ocr.ts` = network) that are smoke-tested. The region-detection module (`segment.ts`) is written pure — operating on a `{width,height,data}` RGBA struct identical to browser `ImageData` — so it can later graduate to `src/segment/`. The OCR step calls the project's real `ocrPage` + gateway provider.

**Tech Stack:** TypeScript, `tsx` (run TS directly, ESM), Vitest (existing), `pngjs` (decode/encode/crop PNG in Node), `dotenv` (load `AI_GATEWAY_API_KEY`), `mupdf` (already a dep), Vercel AI SDK `ai` (already a dep).

Spec: `docs/superpowers/specs/2026-06-04-ab-segmentation-harness-design.md`.

---

## File structure

```
scripts/ab-segment/
  types.ts      # shared types: RGBAImage, BBox, RegionRole, Region, DetectOptions, DetectResult, report types
  cli.ts        # parsePages(), parseArgs() — pure
  prompts.ts    # BODY_PROMPT, FOOTNOTE_PROMPT, regionPrompt(), stitch() — pure
  segment.ts    # GRADUATABLE, pure: inkBounds, detectColumnGutter, detectFootnoteSplit, detectRegions
  image.ts      # pngjs: decodePng/encodePng; pure: cropImage, drawRect, drawRegions
  report.ts     # buildReport() — pure (string + base64)
  render.ts     # mupdf: openDoc, pageCount, renderPage  (I/O, smoke-tested)
  ocr.ts        # makeModel, toDataUrl, runA, runB  (network, smoke-tested)
  run.ts        # CLI entry: orchestrate everything, write out/report.html
  *.test.ts     # Vitest unit tests for the pure modules
  out/          # gitignored output (report.html, crop/overlay PNGs)
```

Notes for the implementer:
- All harness files are ESM and run via `tsx`. Import project code **without** file extensions (matches repo style), e.g. `import { ocrPage } from '../../src/ai/ocr'`.
- `tsconfig.json` `include` is `["src"]`; do **not** add `scripts/` to it. The harness is never part of `npm run build`; `tsx` compiles on the fly.
- `BBox` convention throughout: `{x0,y0,x1,y1}` with `x0,y0` inclusive and `x1,y1` exclusive (pixel coordinates).
- RGBA buffers are 4 bytes/pixel; pixel `(x,y)` starts at index `(y*width + x)*4`.

---

## Task 1: Project setup — deps, npm script, shared types

**Files:**
- Modify: `package.json` (devDependencies + `scripts`)
- Create: `scripts/ab-segment/types.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm i -D tsx pngjs dotenv @types/node @types/pngjs
```
Expected: installs succeed; `package.json` devDependencies now include `tsx`, `pngjs`, `dotenv`, `@types/node`, `@types/pngjs`.

- [ ] **Step 2: Add the run script to `package.json`**

In the `"scripts"` block add:
```json
    "ab:segment": "tsx scripts/ab-segment/run.ts"
```
(Keep the existing `dev`/`build`/`preview`/`test`/`test:watch` entries.)

- [ ] **Step 3: Create shared types**

Create `scripts/ab-segment/types.ts`:
```ts
// RGBA image, byte layout identical to browser ImageData (graduation-friendly).
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray; // length = width*height*4, RGBA
}

// x0,y0 inclusive; x1,y1 exclusive.
export interface BBox { x0: number; y0: number; x1: number; y1: number }

export type RegionRole = 'right-body' | 'left-body' | 'footnotes';

export interface Region { role: RegionRole; bbox: BBox }

export interface DetectOptions {
  threshold?: number;     // ink luminance cutoff 0-255 (default 128)
  gutterFrac?: number;    // force column split x as fraction of image width (skips detection)
  footnoteFrac?: number;  // force footnote split y as fraction of image height
  noFootnotes?: boolean;  // treat page as body-only
}

export interface DetectResult {
  regions: Region[];      // in RTL reading order: right-body, left-body, footnotes
  flags: string[];        // e.g. 'gutter-fallback', 'no-footnote', 'gutter-forced', 'footnote-forced'
  gutterX: number;
  footY: number | null;
  inkBox: BBox;
}

// ---- report types ----
export interface OcrCell { text: string; tokensIn?: number; tokensOut?: number; error?: string }

export interface RegionCell {
  role: RegionRole;
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  cropDataUrl: string;
}

export interface PageReport {
  pageNum: number;          // 1-indexed
  flags: string[];
  overlayDataUrl: string;   // full page (crop-dpi) with region boxes drawn
  a: OcrCell;
  b: { stitched: string; regions: RegionCell[]; totalTokensIn: number; totalTokensOut: number; error?: string };
}
```

- [ ] **Step 4: Verify tsx runs**

Run:
```bash
npx tsx -e "import {} from './scripts/ab-segment/types'; console.log('types ok')"
```
Expected: prints `types ok` (no type/runtime error).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/ab-segment/types.ts
git commit -m "chore(ab-segment): scaffold harness deps, script, and shared types"
```

---

## Task 2: CLI argument parsing (`cli.ts`)

**Files:**
- Create: `scripts/ab-segment/cli.ts`
- Test: `scripts/ab-segment/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ab-segment/cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parsePages, parseArgs } from './cli';

describe('parsePages', () => {
  it('parses a comma list', () => {
    expect(parsePages('4,5,6')).toEqual([4, 5, 6]);
  });
  it('expands ranges and preserves order', () => {
    expect(parsePages('4,12-15')).toEqual([4, 12, 13, 14, 15]);
  });
  it('trims whitespace and ignores empties', () => {
    expect(parsePages(' 4 , , 6 ')).toEqual([4, 6]);
  });
});

describe('parseArgs', () => {
  it('applies defaults when nothing passed', () => {
    const o = parseArgs([]);
    expect(o.pages).toEqual([4, 5, 6]);
    expect(o.pdf).toBe('Hebrewbooks_org_740.pdf');
    expect(o.out).toBe('scripts/ab-segment/out');
    expect(o.aDpi).toBe(200);
    expect(o.cropDpi).toBe(400);
    expect(o.noFootnotes).toBe(false);
    expect(o.gutterFrac).toBeUndefined();
    expect(o.footnoteFrac).toBeUndefined();
  });
  it('parses flags', () => {
    const o = parseArgs(['--pages', '7-8', '--crop-dpi', '500', '--gutter', '0.52', '--no-footnotes']);
    expect(o.pages).toEqual([7, 8]);
    expect(o.cropDpi).toBe(500);
    expect(o.gutterFrac).toBeCloseTo(0.52);
    expect(o.noFootnotes).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/cli.test.ts`
Expected: FAIL — cannot resolve `./cli` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/ab-segment/cli.ts`:
```ts
export interface Options {
  pages: number[];
  pdf: string;
  out: string;
  aDpi: number;
  cropDpi: number;
  gutterFrac?: number;
  footnoteFrac?: number;
  noFootnotes: boolean;
}

export function parsePages(spec: string): number[] {
  const out: number[] = [];
  for (const partRaw of spec.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      out.push(Number(part));
    }
  }
  return out;
}

export function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const pagesSpec = get('--pages') ?? '4,5,6';
  const gutter = get('--gutter');
  const footnote = get('--footnote');

  return {
    pages: parsePages(pagesSpec),
    pdf: get('--pdf') ?? 'Hebrewbooks_org_740.pdf',
    out: get('--out') ?? 'scripts/ab-segment/out',
    aDpi: Number(get('--a-dpi') ?? '200'),
    cropDpi: Number(get('--crop-dpi') ?? '400'),
    gutterFrac: gutter !== undefined ? Number(gutter) : undefined,
    footnoteFrac: footnote !== undefined ? Number(footnote) : undefined,
    noFootnotes: has('--no-footnotes'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/cli.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/cli.ts scripts/ab-segment/cli.test.ts
git commit -m "feat(ab-segment): CLI argument and page-range parsing"
```

---

## Task 3: Prompts and stitching (`prompts.ts`)

**Files:**
- Create: `scripts/ab-segment/prompts.ts`
- Test: `scripts/ab-segment/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ab-segment/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { regionPrompt, stitch, BODY_PROMPT, FOOTNOTE_PROMPT } from './prompts';

describe('regionPrompt', () => {
  it('uses the footnote prompt for footnotes', () => {
    expect(regionPrompt('footnotes')).toBe(FOOTNOTE_PROMPT);
  });
  it('uses the body prompt for columns', () => {
    expect(regionPrompt('right-body')).toBe(BODY_PROMPT);
    expect(regionPrompt('left-body')).toBe(BODY_PROMPT);
  });
});

describe('stitch', () => {
  it('joins right then left with a blank line', () => {
    expect(stitch('RIGHT', 'LEFT')).toBe('RIGHT\n\nLEFT');
  });
  it('appends a footnote block when footnotes present', () => {
    expect(stitch('R', 'L', 'NOTE')).toBe('R\n\nL\n\n---\nהערות\n---\nNOTE');
  });
  it('omits the footnote block when footnotes empty/whitespace', () => {
    expect(stitch('R', 'L', '   ')).toBe('R\n\nL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/prompts.test.ts`
Expected: FAIL — cannot resolve `./prompts`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/ab-segment/prompts.ts`:
```ts
import type { RegionRole } from './types';

// Single-column adaptation of DEFAULT_OCR_PROMPT: no two-column ordering text,
// no footnote-block logic (footnotes are a separate crop).
export const BODY_PROMPT =
  'בצע OCR. זהו טור בודד מתוך עמוד בספר חסידות יהודי ישן שנדפס בכתב רש"י ישן. ' +
  'החזר את כל הטקסט של הטור הזה ברצף, בצורה המדויקת ביותר האפשרית. ' +
  'השמט את מספרי העמודים ואת כותרות העמוד (running headers), והחזר רק את גוף הטקסט. ' +
  'החזר אך ורק את הטקסט הגולמי, ללא הסברים, התנצלויות או כל תוספת — רק טקסט ה-OCR. ' +
  'ניתן לסמן כותרות פנימיות (כגון "פרק א") או מילים מודגשות, אך אין לסמן את כותרות העמוד או את מספרי העמודים.';

// Tuned for the dense, small footnote type at the bottom of the page.
export const FOOTNOTE_PROMPT =
  'בצע OCR. זהו בלוק של הערות שוליים בכתב קטן וצפוף מתוך ספר חסידות יהודי ישן בכתב רש"י. ' +
  'החזר את כל טקסט ההערות ברצף, בצורה המדויקת ביותר האפשרית, כל הערה בשורה חדשה. ' +
  'החזר אך ורק את הטקסט הגולמי, ללא הסברים או כל תוספת.';

export function regionPrompt(role: RegionRole): string {
  return role === 'footnotes' ? FOOTNOTE_PROMPT : BODY_PROMPT;
}

export function stitch(rightBody: string, leftBody: string, footnotes?: string): string {
  let out = [rightBody.trim(), leftBody.trim()].filter(Boolean).join('\n\n');
  const fn = footnotes?.trim();
  if (fn) out += `\n\n---\nהערות\n---\n${fn}`;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/prompts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/prompts.ts scripts/ab-segment/prompts.test.ts
git commit -m "feat(ab-segment): per-region prompts and RTL stitching"
```

---

## Task 4: Ink bounding box (`segment.ts` part 1)

**Files:**
- Create: `scripts/ab-segment/segment.ts`
- Test: `scripts/ab-segment/segment.test.ts`

The test file defines small helpers (`blank`, `fillRect`) reused by Tasks 4–7.

- [ ] **Step 1: Write the failing test**

Create `scripts/ab-segment/segment.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RGBAImage, BBox } from './types';
import { inkBounds } from './segment';

// --- test image helpers (shared across segment tests) ---
export function blank(width: number, height: number): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255); // white, opaque
  return { width, height, data };
}
export function fillRect(img: RGBAImage, b: BBox, gray = 0): void {
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = gray; img.data[i + 1] = gray; img.data[i + 2] = gray; img.data[i + 3] = 255;
    }
  }
}

describe('inkBounds', () => {
  it('finds the tight bounding box of dark pixels', () => {
    const img = blank(100, 100);
    fillRect(img, { x0: 10, y0: 20, x1: 40, y1: 70 });
    expect(inkBounds(img, 128)).toEqual({ x0: 10, y0: 20, x1: 40, y1: 70 });
  });
  it('returns the full image when there is no ink', () => {
    const img = blank(50, 30);
    expect(inkBounds(img, 128)).toEqual({ x0: 0, y0: 0, x1: 50, y1: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: FAIL — cannot resolve `./segment` / `inkBounds` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/ab-segment/segment.ts`:
```ts
import type { RGBAImage, BBox } from './types';

function isInk(img: RGBAImage, x: number, y: number, threshold: number): boolean {
  const i = (y * img.width + x) * 4;
  const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
  return lum < threshold;
}

export function inkBounds(img: RGBAImage, threshold: number): BBox {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isInk(img, x, y, threshold)) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: img.width, y1: img.height };
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/segment.ts scripts/ab-segment/segment.test.ts
git commit -m "feat(ab-segment): ink bounding box detection"
```

---

## Task 5: Column gutter detection (`segment.ts` part 2)

**Files:**
- Modify: `scripts/ab-segment/segment.ts`
- Modify: `scripts/ab-segment/segment.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `scripts/ab-segment/segment.test.ts` (add `detectColumnGutter` to the existing `./segment` import at the top of the file):
```ts
import { detectColumnGutter } from './segment';

describe('detectColumnGutter', () => {
  it('finds the whitespace valley between two columns', () => {
    const img = blank(100, 100);
    fillRect(img, { x0: 10, y0: 10, x1: 40, y1: 90 }); // left block
    fillRect(img, { x0: 60, y0: 10, x1: 90, y1: 90 }); // right block
    const ink = { x0: 10, y0: 10, x1: 90, y1: 90 };
    const r = detectColumnGutter(img, 128, ink);
    expect(r.fallback).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(45);
    expect(r.x).toBeLessThanOrEqual(55);
  });
  it('falls back to the geometric center when there is no valley', () => {
    const img = blank(100, 100);
    fillRect(img, { x0: 10, y0: 10, x1: 90, y1: 90 }); // one solid block
    const ink = { x0: 10, y0: 10, x1: 90, y1: 90 };
    const r = detectColumnGutter(img, 128, ink);
    expect(r.fallback).toBe(true);
    expect(r.x).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: FAIL — `detectColumnGutter` not exported.

- [ ] **Step 3: Add the implementation**

Append to `scripts/ab-segment/segment.ts`:
```ts
// Count ink pixels in column x over the vertical span [yTop, yBottom).
function columnInk(img: RGBAImage, x: number, yTop: number, yBottom: number, threshold: number): number {
  let n = 0;
  for (let y = yTop; y < yBottom; y++) if (isInk(img, x, y, threshold)) n++;
  return n;
}

export function detectColumnGutter(
  img: RGBAImage,
  threshold: number,
  ink: BBox,
): { x: number; fallback: boolean } {
  const w = ink.x1 - ink.x0;
  const h = ink.y1 - ink.y0;
  const bandStart = Math.floor(ink.x0 + 0.30 * w);
  const bandEnd = Math.floor(ink.x0 + 0.70 * w);
  const valleyCutoff = Math.max(1, 0.02 * h); // near-empty column

  // Find the widest contiguous run of near-empty columns in the central band.
  let bestStart = -1, bestLen = 0;
  let runStart = -1;
  for (let x = bandStart; x < bandEnd; x++) {
    const empty = columnInk(img, x, ink.y0, ink.y1, threshold) <= valleyCutoff;
    if (empty) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      const len = x - runStart;
      if (len > bestLen) { bestLen = len; bestStart = runStart; }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = bandEnd - runStart;
    if (len > bestLen) { bestLen = len; bestStart = runStart; }
  }

  if (bestLen > 0) {
    return { x: Math.floor(bestStart + bestLen / 2), fallback: false };
  }
  return { x: Math.floor(ink.x0 + w / 2), fallback: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/segment.ts scripts/ab-segment/segment.test.ts
git commit -m "feat(ab-segment): column gutter detection with center fallback"
```

---

## Task 6: Footnote split detection (`segment.ts` part 3)

**Files:**
- Modify: `scripts/ab-segment/segment.ts`
- Modify: `scripts/ab-segment/segment.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `scripts/ab-segment/segment.test.ts` (add `detectFootnoteSplit` to the `./segment` import). Real text rows are **sparse** (ink covers ~40% of a line, with gaps between letters and between lines), so the tests paint sparse "text" via `textBlock`; only an actual drawn rule is near-full-width. These helpers are reused by Task 7.
```ts
import { detectFootnoteSplit } from './segment';

// Sparse "text": dashes (2px ink / 3px gap) across the x-span, a line every 3 rows.
function textRow(img: import('./types').RGBAImage, xL: number, xR: number, y: number): void {
  for (let x = xL; x < xR; x += 5) fillRect(img, { x0: x, y0: y, x1: Math.min(x + 2, xR), y1: y + 1 });
}
function textBlock(img: import('./types').RGBAImage, xL: number, yT: number, xR: number, yB: number): void {
  for (let y = yT; y < yB; y += 3) textRow(img, xL, xR, y);
}

describe('detectFootnoteSplit', () => {
  it('splits at a wide whitespace gap above the footnotes', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 80, 55); // body text
    textBlock(img, 10, 70, 80, 90); // footnote text after a wide gap
    const ink = inkBounds(img, 128);
    const y = detectFootnoteSplit(img, 128, ink);
    expect(y).not.toBeNull();
    expect(y!).toBeGreaterThan(55);
    expect(y!).toBeLessThan(70);
  });
  it('splits at a horizontal rule', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 80, 58);                          // body text
    fillRect(img, { x0: 12, y0: 60, x1: 88, y1: 61 });       // solid near-full-width rule
    textBlock(img, 10, 65, 80, 90);                          // footnote text
    const ink = inkBounds(img, 128);
    const y = detectFootnoteSplit(img, 128, ink);
    expect(y).toBe(60);
  });
  it('returns null when there is no gap or rule', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 80, 90); // uniform sparse text, no wide gap
    const ink = inkBounds(img, 128);
    expect(detectFootnoteSplit(img, 128, ink)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: FAIL — `detectFootnoteSplit` not exported.

- [ ] **Step 3: Add the implementation**

Append to `scripts/ab-segment/segment.ts`:
```ts
// Count ink pixels in row y over the horizontal span [xLeft, xRight).
function rowInk(img: RGBAImage, y: number, xLeft: number, xRight: number, threshold: number): number {
  let n = 0;
  for (let x = xLeft; x < xRight; x++) if (isInk(img, x, y, threshold)) n++;
  return n;
}

// Returns the y of the footnote separator (rule line preferred, else widest
// whitespace valley) in the lower band, or null if none is convincing.
export function detectFootnoteSplit(img: RGBAImage, threshold: number, ink: BBox): number | null {
  const w = ink.x1 - ink.x0;
  const h = ink.y1 - ink.y0;
  const bandStart = Math.floor(ink.y0 + 0.50 * h);
  const bandEnd = Math.floor(ink.y0 + 0.92 * h);
  const ruleCutoff = 0.85 * w;            // near-full-width solid row (real text rows are far sparser)
  const valleyCutoff = Math.max(1, 0.05 * w);
  const minValley = Math.max(3, Math.floor(0.04 * h));

  // 1) Prefer the topmost horizontal rule in the band.
  for (let y = bandStart; y < bandEnd; y++) {
    if (rowInk(img, y, ink.x0, ink.x1, threshold) >= ruleCutoff) return y;
  }

  // 2) Else the widest whitespace valley wider than minValley.
  let bestStart = -1, bestLen = 0;
  let runStart = -1;
  for (let y = bandStart; y < bandEnd; y++) {
    const empty = rowInk(img, y, ink.x0, ink.x1, threshold) <= valleyCutoff;
    if (empty) {
      if (runStart < 0) runStart = y;
    } else if (runStart >= 0) {
      const len = y - runStart;
      if (len > bestLen) { bestLen = len; bestStart = runStart; }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = bandEnd - runStart;
    if (len > bestLen) { bestLen = len; bestStart = runStart; }
  }

  if (bestLen >= minValley) return Math.floor(bestStart + bestLen / 2);
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/segment.ts scripts/ab-segment/segment.test.ts
git commit -m "feat(ab-segment): footnote split detection (rule or whitespace valley)"
```

---

## Task 7: Region assembly (`segment.ts` part 4)

**Files:**
- Modify: `scripts/ab-segment/segment.ts`
- Modify: `scripts/ab-segment/segment.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `scripts/ab-segment/segment.test.ts` (add `detectRegions` to the `./segment` import):
```ts
import { detectRegions } from './segment';

describe('detectRegions', () => {
  it('returns right-body, left-body, footnotes in RTL order with a footnote gap', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 40, 55); // left col body
    textBlock(img, 60, 10, 90, 55); // right col body
    textBlock(img, 10, 72, 90, 88); // footnotes (wide) after a gap
    const r = detectRegions(img, {});
    expect(r.regions.map((x) => x.role)).toEqual(['right-body', 'left-body', 'footnotes']);
    const right = r.regions[0].bbox, left = r.regions[1].bbox, fn = r.regions[2].bbox;
    expect(right.x0).toBe(r.gutterX);
    expect(left.x1).toBe(r.gutterX);
    expect(right.y1).toBe(r.footY!);   // body stops at footnote line
    expect(fn.y0).toBe(r.footY!);
    expect(r.footY).not.toBeNull();
  });

  it('omits footnotes and flags no-footnote on a body-only page', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 40, 90); // left col, full height, no gap
    textBlock(img, 60, 10, 90, 90); // right col, full height, no gap
    const r = detectRegions(img, {});
    expect(r.regions.map((x) => x.role)).toEqual(['right-body', 'left-body']);
    expect(r.footY).toBeNull();
    expect(r.flags).toContain('no-footnote');
  });

  it('honors forced gutter/footnote fractions and flags them', () => {
    const img = blank(100, 100);
    fillRect(img, { x0: 5, y0: 5, x1: 95, y1: 95 });
    const r = detectRegions(img, { gutterFrac: 0.5, footnoteFrac: 0.8 });
    expect(r.gutterX).toBe(50);
    expect(r.footY).toBe(80);
    expect(r.flags).toContain('gutter-forced');
    expect(r.flags).toContain('footnote-forced');
  });

  it('skips footnotes entirely when noFootnotes is set', () => {
    const img = blank(100, 100);
    textBlock(img, 10, 10, 40, 90);
    textBlock(img, 60, 10, 90, 90);
    const r = detectRegions(img, { noFootnotes: true });
    expect(r.footY).toBeNull();
    expect(r.regions.some((x) => x.role === 'footnotes')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: FAIL — `detectRegions` not exported.

- [ ] **Step 3: Add the implementation**

Append to `scripts/ab-segment/segment.ts`:
```ts
import type { DetectOptions, DetectResult, Region } from './types';

export function detectRegions(img: RGBAImage, opts: DetectOptions): DetectResult {
  const threshold = opts.threshold ?? 128;
  const inkBox = inkBounds(img, threshold);
  const flags: string[] = [];

  // Gutter
  let gutterX: number;
  if (opts.gutterFrac !== undefined) {
    gutterX = Math.round(opts.gutterFrac * img.width);
    flags.push('gutter-forced');
  } else {
    const g = detectColumnGutter(img, threshold, inkBox);
    gutterX = g.x;
    if (g.fallback) flags.push('gutter-fallback');
  }

  // Footnote split
  let footY: number | null;
  if (opts.noFootnotes) {
    footY = null;
  } else if (opts.footnoteFrac !== undefined) {
    footY = Math.round(opts.footnoteFrac * img.height);
    flags.push('footnote-forced');
  } else {
    footY = detectFootnoteSplit(img, threshold, inkBox);
    if (footY === null) flags.push('no-footnote');
  }

  const bodyBottom = footY ?? inkBox.y1;
  const regions: Region[] = [
    { role: 'right-body', bbox: { x0: gutterX, y0: inkBox.y0, x1: inkBox.x1, y1: bodyBottom } },
    { role: 'left-body', bbox: { x0: inkBox.x0, y0: inkBox.y0, x1: gutterX, y1: bodyBottom } },
  ];
  if (footY !== null) {
    regions.push({ role: 'footnotes', bbox: { x0: inkBox.x0, y0: footY, x1: inkBox.x1, y1: inkBox.y1 } });
  }

  return { regions, flags, gutterX, footY, inkBox };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/segment.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/segment.ts scripts/ab-segment/segment.test.ts
git commit -m "feat(ab-segment): assemble RTL regions from gutter and footnote split"
```

---

## Task 8: Image decode/encode/crop/overlay (`image.ts`)

**Files:**
- Create: `scripts/ab-segment/image.ts`
- Test: `scripts/ab-segment/image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ab-segment/image.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RGBAImage } from './types';
import { cropImage, drawRect, encodePng, decodePng } from './image';

function blank(width: number, height: number, gray = 255): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(gray);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // alpha
  return { width, height, data };
}
function pixel(img: RGBAImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

describe('cropImage', () => {
  it('extracts a sub-rectangle with correct size and pixels', () => {
    const img = blank(10, 10);
    // mark pixel (5,6) red
    const i = (6 * 10 + 5) * 4;
    img.data[i] = 200; img.data[i + 1] = 0; img.data[i + 2] = 0;
    const c = cropImage(img, { x0: 4, y0: 5, x1: 8, y1: 9 });
    expect(c.width).toBe(4);
    expect(c.height).toBe(4);
    expect(pixel(c, 1, 1)).toEqual([200, 0, 0, 255]); // (5,6) -> (1,1) in crop
  });
});

describe('drawRect', () => {
  it('draws a border without mutating the source', () => {
    const img = blank(10, 10);
    const out = drawRect(img, { x0: 2, y0: 2, x1: 8, y1: 8 }, [255, 0, 0], 1);
    expect(pixel(out, 2, 2)).toEqual([255, 0, 0, 255]); // border drawn
    expect(pixel(out, 5, 5)).toEqual([255, 255, 255, 255]); // interior untouched
    expect(pixel(img, 2, 2)).toEqual([255, 255, 255, 255]); // source unchanged
  });
});

describe('encodePng/decodePng roundtrip', () => {
  it('preserves dimensions and pixels', () => {
    const img = blank(6, 4);
    const i = (1 * 6 + 2) * 4;
    img.data[i] = 10; img.data[i + 1] = 20; img.data[i + 2] = 30;
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(6);
    expect(back.height).toBe(4);
    expect(pixel(back, 2, 1)).toEqual([10, 20, 30, 255]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/image.test.ts`
Expected: FAIL — cannot resolve `./image`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/ab-segment/image.ts`:
```ts
import { PNG } from 'pngjs';
import type { RGBAImage, BBox, Region, RegionRole } from './types';

export function decodePng(bytes: Uint8Array): RGBAImage {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, data: png.data };
}

export function encodePng(img: RGBAImage): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

export function cropImage(img: RGBAImage, b: BBox): RGBAImage {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = ((b.y0 + y) * img.width + b.x0) * 4;
    const dstStart = y * w * 4;
    data.set(img.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return { width: w, height: h, data };
}

export function drawRect(
  img: RGBAImage,
  b: BBox,
  color: [number, number, number],
  thickness = 3,
): RGBAImage {
  const data = new Uint8ClampedArray(img.data); // copy (no mutation of source)
  const out: RGBAImage = { width: img.width, height: img.height, data };
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
    const i = (y * out.width + x) * 4;
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  };
  for (let t = 0; t < thickness; t++) {
    for (let x = b.x0; x < b.x1; x++) { set(x, b.y0 + t); set(x, b.y1 - 1 - t); }
    for (let y = b.y0; y < b.y1; y++) { set(b.x0 + t, y); set(b.x1 - 1 - t, y); }
  }
  return out;
}

const ROLE_COLOR: Record<RegionRole, [number, number, number]> = {
  'right-body': [220, 30, 30],   // red
  'left-body': [30, 90, 220],    // blue
  'footnotes': [30, 160, 60],    // green
};

export function drawRegions(img: RGBAImage, regions: Region[]): RGBAImage {
  let out = img;
  for (const r of regions) out = drawRect(out, r.bbox, ROLE_COLOR[r.role]);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/image.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/image.ts scripts/ab-segment/image.test.ts
git commit -m "feat(ab-segment): PNG decode/encode, crop, and region overlay"
```

---

## Task 9: HTML report (`report.ts`)

**Files:**
- Create: `scripts/ab-segment/report.ts`
- Test: `scripts/ab-segment/report.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ab-segment/report.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { PageReport } from './types';
import { buildReport } from './report';

const page: PageReport = {
  pageNum: 4,
  flags: ['no-footnote'],
  overlayDataUrl: 'data:image/png;base64,AAAA',
  a: { text: 'טקסט מלא', tokensIn: 100, tokensOut: 50 },
  b: {
    stitched: 'ימין\n\nשמאל',
    regions: [
      { role: 'right-body', text: 'ימין', tokensIn: 40, tokensOut: 20, cropDataUrl: 'data:image/png;base64,BBBB' },
      { role: 'left-body', text: 'שמאל', tokensIn: 45, tokensOut: 25, cropDataUrl: 'data:image/png;base64,CCCC' },
    ],
    totalTokensIn: 85,
    totalTokensOut: 45,
  },
};

describe('buildReport', () => {
  it('produces an RTL HTML document containing both transcriptions and flags', () => {
    const html = buildReport([page]);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Page 4');
    expect(html).toContain('no-footnote');
    expect(html).toContain('טקסט מלא');   // A text
    expect(html).toContain('ימין');        // B text
    expect(html).toContain('data:image/png;base64,AAAA'); // overlay embedded
    expect(html).toContain('data:image/png;base64,BBBB'); // crop embedded
  });
  it('escapes HTML-special characters in OCR text', () => {
    const p2 = { ...page, a: { ...page.a, text: 'a < b & c' } };
    const html = buildReport([p2]);
    expect(html).toContain('a &lt; b &amp; c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/report.test.ts`
Expected: FAIL — cannot resolve `./report`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/ab-segment/report.ts`:
```ts
import type { PageReport } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pageSection(p: PageReport): string {
  const ratioIn = p.a.tokensIn ? (p.b.totalTokensIn / p.a.tokensIn).toFixed(2) : '–';
  const ratioOut = p.a.tokensOut ? (p.b.totalTokensOut / p.a.tokensOut).toFixed(2) : '–';
  const flags = p.flags.length ? p.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(' ') : '<span class="ok">clean</span>';

  const crops = p.b.regions.map((r) => `
    <div class="crop">
      <div class="crop-h">${esc(r.role)} · in ${r.tokensIn ?? '?'} / out ${r.tokensOut ?? '?'}</div>
      <img src="${r.cropDataUrl}" />
      <pre dir="rtl">${r.error ? '⚠ ' + esc(r.error) : esc(r.text)}</pre>
    </div>`).join('');

  return `
  <section class="page">
    <h2>Page ${p.pageNum} ${flags}</h2>
    <div class="tokens">A: in ${p.a.tokensIn ?? '?'} / out ${p.a.tokensOut ?? '?'} ·
      B: in ${p.b.totalTokensIn} / out ${p.b.totalTokensOut} ·
      B/A ratio: in ${ratioIn}× / out ${ratioOut}×</div>
    <div class="overlay"><img src="${p.overlayDataUrl}" /></div>
    <div class="cols">
      <div class="col">
        <h3>A — full page</h3>
        <pre dir="rtl">${p.a.error ? '⚠ ' + esc(p.a.error) : esc(p.a.text)}</pre>
      </div>
      <div class="col">
        <h3>B — per region (stitched)</h3>
        <pre dir="rtl">${p.b.error ? '⚠ ' + esc(p.b.error) : esc(p.b.stitched)}</pre>
        <div class="crops">${crops}</div>
      </div>
    </div>
  </section>`;
}

export function buildReport(pages: PageReport[]): string {
  const body = pages.map(pageSection).join('\n');
  return `<!doctype html>
<html lang="he">
<head>
<meta charset="utf-8" />
<title>A/B Segmentation Report</title>
<style>
  body { font-family: "David", "Times New Roman", serif; margin: 24px; background: #f7f7f7; color: #111; }
  h1 { font-size: 20px; }
  section.page { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 0 0 28px; }
  .tokens { color: #555; font-size: 13px; margin: 4px 0 12px; }
  .flag { background: #fde68a; color: #7c2d12; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  .ok { background: #bbf7d0; color: #065f46; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  .overlay img { max-width: 520px; border: 1px solid #ccc; }
  .cols { display: flex; gap: 16px; align-items: flex-start; margin-top: 12px; }
  .col { flex: 1; min-width: 0; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #fafafa; border: 1px solid #eee; padding: 8px; font-size: 15px; line-height: 1.6; }
  .crop { margin-top: 10px; border-top: 1px dashed #ddd; padding-top: 8px; }
  .crop-h { font-size: 12px; color: #555; margin-bottom: 4px; }
  .crop img { max-width: 360px; border: 1px solid #ccc; }
</style>
</head>
<body dir="rtl">
<h1>A/B Segmentation Report — ${pages.length} page(s)</h1>
${body}
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/report.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/report.ts scripts/ab-segment/report.test.ts
git commit -m "feat(ab-segment): self-contained RTL HTML report builder"
```

---

## Task 10: PDF rendering (`render.ts`) — mupdf, smoke-tested

`render.ts` imports `mupdf` (ESM + top-level await + wasm). It is **not** unit-tested under Vitest/jsdom; it is smoke-tested via a one-off `tsx` command against the real PDF.

**Files:**
- Create: `scripts/ab-segment/render.ts`

- [ ] **Step 1: Write the implementation**

Create `scripts/ab-segment/render.ts`:
```ts
import * as mupdf from 'mupdf';

export interface RenderDoc {
  pdf: mupdf.PDFDocument;
  count: number;
}

export function openDoc(bytes: Uint8Array): RenderDoc {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const pdf = doc.asPDF();
  if (!pdf) throw new Error('Failed to open PDF (not a PDF or password-protected).');
  return { pdf, count: pdf.countPages() };
}

// pageIndex is 0-indexed. Returns PNG bytes.
export function renderPage(doc: RenderDoc, pageIndex: number, dpi: number): Uint8Array {
  const page = doc.pdf.loadPage(pageIndex);
  try {
    const scale = dpi / 72;
    const matrix: mupdf.Matrix = [scale, 0, 0, scale, 0, 0];
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      return pixmap.asPNG();
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}
```

- [ ] **Step 2: Smoke-test against the real PDF**

Run (renders page 1 at 150 DPI to a file and prints byte size):
```bash
npx tsx -e "import {openDoc,renderPage} from './scripts/ab-segment/render'; import * as fs from 'node:fs'; const d=openDoc(new Uint8Array(fs.readFileSync('Hebrewbooks_org_740.pdf'))); console.log('pages',d.count); const png=renderPage(d,0,150); fs.mkdirSync('scripts/ab-segment/out',{recursive:true}); fs.writeFileSync('scripts/ab-segment/out/smoke.png',png); console.log('png bytes',png.length)"
```
Expected: prints `pages 315` and `png bytes` well over 10000; `scripts/ab-segment/out/smoke.png` opens as a rendered page image.

- [ ] **Step 3: Commit**

```bash
git add scripts/ab-segment/render.ts
git commit -m "feat(ab-segment): mupdf page rendering (Node, smoke-tested)"
```

---

## Task 11: OCR wrapper (`ocr.ts`) — real ocrPage + gateway

`ocr.ts` builds the gateway model from `AI_GATEWAY_API_KEY` and calls the project's real `ocrPage`. Only the pure helper `toDataUrl` is unit-tested; the network paths (`runA`/`runB`) are exercised in the end-to-end run (Task 12).

**Files:**
- Create: `scripts/ab-segment/ocr.ts`
- Test: `scripts/ab-segment/ocr.test.ts`

- [ ] **Step 1: Write the failing test (pure helper only)**

Create `scripts/ab-segment/ocr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toDataUrl } from './ocr';

describe('toDataUrl', () => {
  it('wraps PNG bytes as a base64 data URL', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const url = toDataUrl(bytes);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url).toBe('data:image/png;base64,' + Buffer.from(bytes).toString('base64'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ab-segment/ocr.test.ts`
Expected: FAIL — cannot resolve `./ocr`.

- [ ] **Step 3: Write the implementation**

Create `scripts/ab-segment/ocr.ts`:
```ts
import { createGateway, type LanguageModel } from 'ai';
import { ocrPage } from '../../src/ai/ocr';
import { DEFAULT_SETTINGS } from '../../src/store/settings';
import { regionPrompt, stitch } from './prompts';
import type { OcrCell, RegionCell, RegionRole } from './types';

const MODEL_ID = 'google/gemini-3.1-pro-preview';

export function toDataUrl(png: Uint8Array): string {
  return 'data:image/png;base64,' + Buffer.from(png).toString('base64');
}

export function makeModel(): LanguageModel {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set (put it in .env).');
  return createGateway({ apiKey })(MODEL_ID);
}

// A: full page through the EXACT default app prompt.
export async function runA(model: LanguageModel, fullPagePng: Uint8Array): Promise<OcrCell> {
  try {
    const r = await ocrPage(model, toDataUrl(fullPagePng), DEFAULT_SETTINGS.prompts.ocr);
    return { text: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch (e) {
    return { text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BCrop { role: RegionRole; png: Uint8Array; cropDataUrl: string }

export interface BResult {
  stitched: string;
  regions: RegionCell[];
  totalTokensIn: number;
  totalTokensOut: number;
  error?: string;
}

// B: OCR each crop with its per-region prompt, then stitch in RTL order.
export async function runB(model: LanguageModel, crops: BCrop[]): Promise<BResult> {
  const regions: RegionCell[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const byRole: Partial<Record<RegionRole, string>> = {};

  for (const c of crops) {
    try {
      const r = await ocrPage(model, toDataUrl(c.png), regionPrompt(c.role));
      totalTokensIn += r.tokensIn ?? 0;
      totalTokensOut += r.tokensOut ?? 0;
      byRole[c.role] = r.text;
      regions.push({ role: c.role, text: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut, cropDataUrl: c.cropDataUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      regions.push({ role: c.role, text: '', error: msg, cropDataUrl: c.cropDataUrl });
    }
  }

  const stitched = stitch(byRole['right-body'] ?? '', byRole['left-body'] ?? '', byRole['footnotes']);
  return { stitched, regions, totalTokensIn, totalTokensOut };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ab-segment/ocr.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/ocr.ts scripts/ab-segment/ocr.test.ts
git commit -m "feat(ab-segment): gateway OCR wrapper for A (full page) and B (per region)"
```

---

## Task 12: Orchestrator (`run.ts`) + end-to-end run

**Files:**
- Create: `scripts/ab-segment/run.ts`

- [ ] **Step 1: Write the implementation**

Create `scripts/ab-segment/run.ts`:
```ts
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from './cli';
import { openDoc, renderPage } from './render';
import { decodePng, encodePng, cropImage, drawRegions } from './image';
import { detectRegions } from './segment';
import { makeModel, runA, runB, toDataUrl, type BCrop } from './ocr';
import { buildReport } from './report';
import type { PageReport } from './types';

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });

  const pdfBytes = new Uint8Array(fs.readFileSync(opts.pdf));
  const doc = openDoc(pdfBytes);
  const model = makeModel();
  console.log(`PDF ${opts.pdf} (${doc.count} pages); pages=${opts.pages.join(',')} aDpi=${opts.aDpi} cropDpi=${opts.cropDpi}`);

  const reports: PageReport[] = [];

  for (const pageNum of opts.pages) {
    const idx = pageNum - 1; // 1-indexed -> 0-indexed
    if (idx < 0 || idx >= doc.count) { console.warn(`skip page ${pageNum} (out of range)`); continue; }
    console.log(`page ${pageNum}: rendering...`);

    const aPng = renderPage(doc, idx, opts.aDpi);
    const bPng = renderPage(doc, idx, opts.cropDpi);
    const img = decodePng(bPng);
    const det = detectRegions(img, {
      gutterFrac: opts.gutterFrac,
      footnoteFrac: opts.footnoteFrac,
      noFootnotes: opts.noFootnotes,
    });
    console.log(`page ${pageNum}: regions=${det.regions.map((r) => r.role).join(',')} flags=${det.flags.join(',') || 'none'}`);

    // crops + overlay
    const crops: BCrop[] = det.regions.map((r) => {
      const cpng = encodePng(cropImage(img, r.bbox));
      fs.writeFileSync(path.join(opts.out, `p${pageNum}-${r.role}.png`), cpng);
      return { role: r.role, png: cpng, cropDataUrl: toDataUrl(cpng) };
    });
    const overlayPng = encodePng(drawRegions(img, det.regions));
    fs.writeFileSync(path.join(opts.out, `p${pageNum}-overlay.png`), overlayPng);

    console.log(`page ${pageNum}: OCR A (full page)...`);
    const a = await runA(model, aPng);
    console.log(`page ${pageNum}: OCR B (${crops.length} regions)...`);
    const b = await runB(model, crops);

    reports.push({ pageNum, flags: det.flags, overlayDataUrl: toDataUrl(overlayPng), a, b });
  }

  const html = buildReport(reports);
  const outFile = path.join(opts.out, 'report.html');
  fs.writeFileSync(outFile, html);
  console.log(`\nDone. Report: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the full harness end-to-end**

Ensure `.env` contains `AI_GATEWAY_API_KEY=...`, then run:
```bash
npm run ab:segment -- --pages 4,5,6 --crop-dpi 400
```
Expected: per-page console progress; finishes with `Done. Report: scripts/ab-segment/out/report.html`; `out/` contains `report.html`, `p4-*.png`, `p5-*.png`, `p6-*.png`.

- [ ] **Step 3: Verify the report is well-formed**

Run:
```bash
grep -c 'dir="rtl"' scripts/ab-segment/out/report.html && grep -o 'Page [0-9]*' scripts/ab-segment/out/report.html
```
Expected: a non-zero count and one `Page N` line per processed page.

- [ ] **Step 4: Human judgment (the actual deliverable)**

Open `scripts/ab-segment/out/report.html` in a browser. For each page check: (a) the overlay boxes land on the right/left columns and footnotes; (b) compare **A** vs **B** transcriptions against the page image; (c) note the B/A token ratio. If detection is off on a page, re-run that page with overrides, e.g.:
```bash
npm run ab:segment -- --pages 5 --gutter 0.5 --footnote 0.8
# or, if a page has no footnotes:
npm run ab:segment -- --pages 6 --no-footnotes
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ab-segment/run.ts
git commit -m "feat(ab-segment): orchestrator and end-to-end A/B report run"
```

---

## Task 13: Run the whole test suite

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all suites pass, including the existing app tests and the new `scripts/ab-segment/*.test.ts` (cli, prompts, segment, image, report, ocr).

- [ ] **Step 2: Confirm the app build is unaffected**

Run: `npm run build`
Expected: `tsc && vite build` succeeds. (The harness lives outside `tsconfig` `include` and is not part of the build.)

- [ ] **Step 3: Commit any fixups**

If Steps 1–2 required changes, commit them:
```bash
git add -A
git commit -m "test(ab-segment): green test suite and clean build"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** CLI args (Task 2) · A=200/B=400 DPI render (Tasks 10, 12) · region detection with overrides + flags (Tasks 4–7) · per-region prompts + stitch (Task 3) · real `ocrPage`/gateway (Task 11) · RTL HTML report with overlay, A/B panels, crops, tokens (Tasks 8, 9, 12) · key only via `.env` (Task 11, 12) · `out/` gitignored (already done in the spec commit).
- **Out of scope (do not build):** automated scoring, `LayoutProfile` registry, browser integration, non-2-col layouts, PDF text-layer use.
- **Graduation note:** `segment.ts` imports only `./types` — no `pngjs`, no Node APIs — so it can move to `src/segment/` and run on a browser `ImageData` unchanged if B wins.
