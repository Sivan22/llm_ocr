import { describe, it, expect } from 'vitest';
import { parsePageRange } from './pageRange';

describe('parsePageRange', () => {
  it('empty input -> empty array, no error', () => {
    expect(parsePageRange('', 10)).toEqual({ pages: [], error: null });
    expect(parsePageRange('   ', 10)).toEqual({ pages: [], error: null });
  });

  it('single integer is parsed as 0-based', () => {
    expect(parsePageRange('5', 10)).toEqual({ pages: [4], error: null });
  });

  it('simple ranges, inclusive both ends', () => {
    expect(parsePageRange('1-3', 10)).toEqual({ pages: [0, 1, 2], error: null });
    expect(parsePageRange('7-9', 10)).toEqual({ pages: [6, 7, 8], error: null });
  });

  it('reversed ranges are normalized', () => {
    expect(parsePageRange('9-7', 10)).toEqual({ pages: [6, 7, 8], error: null });
  });

  it('open-ended ranges', () => {
    expect(parsePageRange('-3', 10)).toEqual({ pages: [0, 1, 2], error: null });
    expect(parsePageRange('8-', 10)).toEqual({ pages: [7, 8, 9], error: null });
  });

  it('mixed tokens, comma- and whitespace-separated, sorted and deduped', () => {
    expect(parsePageRange('1-3, 5 7-9,12', 12)).toEqual({
      pages: [0, 1, 2, 4, 6, 7, 8, 11],
      error: null,
    });
  });

  it('overlapping tokens dedupe', () => {
    expect(parsePageRange('1-3, 2-4', 10)).toEqual({ pages: [0, 1, 2, 3], error: null });
  });

  it('out-of-bounds numbers clamp to [1, pageCount]', () => {
    expect(parsePageRange('0, 50-60', 10)).toEqual({ pages: [0, 9], error: null });
  });

  it('malformed input returns an error and empty pages', () => {
    expect(parsePageRange('1-a', 10)).toEqual({ pages: [], error: 'parse' });
    expect(parsePageRange('!!', 10)).toEqual({ pages: [], error: 'parse' });
  });

  it('pageCount of 0 yields empty result even for valid-looking input', () => {
    expect(parsePageRange('1-3', 0)).toEqual({ pages: [], error: null });
  });
});
