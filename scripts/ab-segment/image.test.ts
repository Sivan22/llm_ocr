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
