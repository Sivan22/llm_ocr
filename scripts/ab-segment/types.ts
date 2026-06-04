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
