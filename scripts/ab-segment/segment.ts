import type { RGBAImage, BBox, DetectOptions, DetectResult, Region } from './types';

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

function anyInk(img: RGBAImage, threshold: number): boolean {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isInk(img, x, y, threshold)) return true;
    }
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

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

export function detectRegions(img: RGBAImage, opts: DetectOptions): DetectResult {
  const threshold = opts.threshold ?? 128;
  const inkBox = inkBounds(img, threshold);
  const flags: string[] = [];

  if (!anyInk(img, threshold)) {
    return { regions: [], flags: ['no-ink'], gutterX: Math.floor(img.width / 2), footY: null, inkBox };
  }

  // Gutter
  let gutterX: number;
  if (opts.gutterFrac !== undefined) {
    gutterX = clamp(Math.round(opts.gutterFrac * img.width), inkBox.x0, inkBox.x1);
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
    footY = clamp(Math.round(opts.footnoteFrac * img.height), inkBox.y0, inkBox.y1);
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
