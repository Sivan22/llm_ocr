import { describe, it, expect } from 'vitest';
import { applyMove, sanitizePageOrder } from './pageOrder';

describe('sanitizePageOrder', () => {
  it('drops out-of-range and non-integer entries', () => {
    expect(sanitizePageOrder([0, 1, 2, 3], 3)).toEqual([0, 1, 2]);
    expect(sanitizePageOrder([-1, 0, 1.5, 1], 3)).toEqual([0, 1]);
  });

  it('dedupes while preserving first occurrence', () => {
    expect(sanitizePageOrder([2, 0, 2, 1, 0], 3)).toEqual([2, 0, 1]);
  });

  it('returns empty when pageCount is 0', () => {
    expect(sanitizePageOrder([0, 1], 0)).toEqual([]);
  });

  it('preserves a reordered subset (used after pages are removed)', () => {
    expect(sanitizePageOrder([3, 1, 0], 5)).toEqual([3, 1, 0]);
  });
});

describe('applyMove', () => {
  it('moves a single page forward', () => {
    expect(applyMove([0, 1, 2, 3, 4], [1], 4)).toEqual([0, 2, 3, 1, 4]);
  });

  it('moves a single page backward', () => {
    expect(applyMove([0, 1, 2, 3, 4], [3], 1)).toEqual([0, 3, 1, 2, 4]);
  });

  it('moves to the start', () => {
    expect(applyMove([0, 1, 2, 3], [2], 0)).toEqual([2, 0, 1, 3]);
  });

  it('moves to the end', () => {
    expect(applyMove([0, 1, 2, 3], [0], 4)).toEqual([1, 2, 3, 0]);
  });

  it('drops a no-op move (same position)', () => {
    expect(applyMove([0, 1, 2], [1], 1)).toEqual([0, 1, 2]);
    expect(applyMove([0, 1, 2], [1], 2)).toEqual([0, 1, 2]);
  });

  it('moves a multi-page group, preserving their relative order', () => {
    // Move pages {3, 1} (in display-order positions 1, 3) to slot 4.
    expect(applyMove([0, 1, 2, 3, 4], [3, 1], 4)).toEqual([0, 2, 1, 3, 4]);
  });

  it('clamps toIndex to valid range', () => {
    expect(applyMove([0, 1, 2], [0], 99)).toEqual([1, 2, 0]);
    expect(applyMove([0, 1, 2], [2], -5)).toEqual([2, 0, 1]);
  });

  it('returns prev unchanged when moving pages absent from order', () => {
    expect(applyMove([0, 1, 2], [9], 0)).toEqual([0, 1, 2]);
  });
});
