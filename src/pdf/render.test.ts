import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { renderPageToPng, MissingPageImageError, type StoredDoc } from './render';
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
