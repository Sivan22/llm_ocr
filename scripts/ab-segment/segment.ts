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
