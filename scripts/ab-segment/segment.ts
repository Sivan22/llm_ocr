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
