import { describe, it, expect } from 'vitest';
import type { RGBAImage, BBox } from './types';
import { inkBounds, detectColumnGutter } from './segment';

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
