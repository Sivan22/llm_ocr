import { describe, it, expect } from 'vitest';
import { toDataUrl } from './ocr';

describe('toDataUrl', () => {
  it('wraps PNG bytes as a base64 data URL', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const url = toDataUrl(bytes);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url).toBe('data:image/png;base64,' + Buffer.from(bytes).toString('base64'));
  });
});
