import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { savePageImage, loadPageImage, loadAllPageImages } from './pageImagesStore';

const A = 'aaaa';
const img = (s: string) => ({ dataUrl: `data:image/png;base64,${s}`, mediaType: 'image/png' });

describe('pageImagesStore', () => {
  it('returns undefined for missing page', async () => {
    expect(await loadPageImage(A, 999)).toBeUndefined();
  });

  it('round-trips a page image', async () => {
    await savePageImage(A, 0, img('zero'));
    const v = await loadPageImage(A, 0);
    expect(v?.mediaType).toBe('image/png');
    expect(v?.dataUrl.endsWith('zero')).toBe(true);
  });

  it('loadAllPageImages returns a Map keyed by pageNum', async () => {
    await savePageImage(A, 2, img('two'));
    await savePageImage(A, 0, img('zero'));
    await savePageImage(A, 1, img('one'));
    const map = await loadAllPageImages(A);
    expect(map.get(0)?.dataUrl.endsWith('zero')).toBe(true);
    expect(map.get(1)?.dataUrl.endsWith('one')).toBe(true);
    expect(map.get(2)?.dataUrl.endsWith('two')).toBe(true);
    expect(map.size).toBe(3);
  });
});
