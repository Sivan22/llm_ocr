import { describe, it, expect } from 'vitest';
import type { RGBAImage, BBox } from './types';
import { inkBounds, detectColumnGutter, detectFootnoteSplit, detectRegions } from './segment';

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

  it('flags no-ink and returns no regions on a blank page', () => {
    const img = blank(100, 100);
    const r = detectRegions(img, {});
    expect(r.regions).toEqual([]);
    expect(r.flags).toContain('no-ink');
    expect(r.footY).toBeNull();
  });

  it('clamps a forced footnote fraction above the ink box (no inverted bbox)', () => {
    const img = blank(100, 100);
    fillRect(img, { x0: 20, y0: 40, x1: 80, y1: 90 }); // ink starts at y=40
    const r = detectRegions(img, { footnoteFrac: 0.1 }); // 0.1*100 = 10, above inkBox.y0=40
    expect(r.footY).toBe(40);                 // clamped up to inkBox.y0
    for (const reg of r.regions) {
      expect(reg.bbox.x1).toBeGreaterThanOrEqual(reg.bbox.x0);
      expect(reg.bbox.y1).toBeGreaterThanOrEqual(reg.bbox.y0); // no inverted bbox
    }
  });
});
