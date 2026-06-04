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
