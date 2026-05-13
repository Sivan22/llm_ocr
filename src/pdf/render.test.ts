import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { renderPageToPng, MissingPageImageError, combine, imagesAsDoc, type StoredDoc, type ImageDoc, type CombinedDoc, type PdfDoc } from './render';
import { savePageImage } from '../store/pageImagesStore';

const HASH = 'storedoc';

describe('StoredDoc render', () => {
  it('serves from in-memory cache when present', async () => {
    const doc: StoredDoc = {
      type: 'stored',
      fileHash: HASH,
      pageCount: 1,
      cache: new Map([[0, { dataUrl: 'data:image/png;base64,Y', mediaType: 'image/png' }]]),
    };
    const out = await renderPageToPng(doc, 0);
    expect(out.dataUrl).toBe('data:image/png;base64,Y');
    expect(out.mediaType).toBe('image/png');
  });

  it('falls back to IndexedDB when not in cache', async () => {
    await savePageImage(HASH, 5, { dataUrl: 'data:image/png;base64,Z', mediaType: 'image/png' });
    const doc: StoredDoc = { type: 'stored', fileHash: HASH, pageCount: 6, cache: new Map() };
    const out = await renderPageToPng(doc, 5);
    expect(out.dataUrl).toBe('data:image/png;base64,Z');
    // Subsequent call should now hit the cache.
    expect(doc.cache.get(5)?.dataUrl).toBe('data:image/png;base64,Z');
  });

  it('throws MissingPageImageError when neither cache nor store has the page', async () => {
    const doc: StoredDoc = { type: 'stored', fileHash: 'nope', pageCount: 10, cache: new Map() };
    await expect(renderPageToPng(doc, 3)).rejects.toBeInstanceOf(MissingPageImageError);
  });
});

function fakePdf(pageCount: number): PdfDoc {
  // We never actually render in these tests — combine() only inspects pageCount and shape.
  return { type: 'pdf', doc: {} as unknown as PdfDoc['doc'], pageCount };
}

function imgDoc(n: number): ImageDoc {
  return imagesAsDoc(Array.from({ length: n }, (_, i) => ({
    bytes: new Uint8Array([i]),
    mediaType: 'image/png',
  })));
}

describe('combine()', () => {
  it('pdf + images -> combined with pdf pages first', () => {
    const out = combine(fakePdf(3), imgDoc(2));
    expect(out.type).toBe('combined');
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(3);
    expect(out.images.pageCount).toBe(2);
  });

  it('images + images -> combined with empty pdf and concatenated images', () => {
    const out = combine(imgDoc(2), imgDoc(3));
    expect(out.type).toBe('combined');
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(0);
    expect(out.images.pageCount).toBe(5);
  });

  it('combined + images flattens, preserving order', () => {
    const base = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const out = combine(base, imgDoc(2));
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('images + combined flattens, preserving order', () => {
    const base = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const out = combine(imgDoc(2), base);
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('combined + combined merges into one combined', () => {
    const a = combine(fakePdf(2), imgDoc(1)) as CombinedDoc;
    const b = combine(fakePdf(0), imgDoc(2)) as CombinedDoc;
    const out = combine(a, b);
    expect(out.pageCount).toBe(5);
    expect(out.pdf.pageCount).toBe(2);
    expect(out.images.pageCount).toBe(3);
  });

  it('refuses to combine when both sides have non-empty pdf', () => {
    expect(() => combine(fakePdf(2), fakePdf(3))).toThrow(/two pdf/i);
  });
});
