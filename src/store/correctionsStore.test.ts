import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveCorrections, loadCorrections } from './correctionsStore';
import type { Correction } from '../lib/types';

const A = 'aaaa';

const mkC = (id: string, status: Correction['status']): Correction => ({
  id, old: 'x', new: 'y', reason: '', status,
});

describe('correctionsStore', () => {
  beforeEach(async () => {
    await saveCorrections(A, 0, []);
    await saveCorrections(A, 1, []);
  });

  it('returns [] for missing key', async () => {
    expect(await loadCorrections(A, 99)).toEqual([]);
  });

  it('round-trips corrections with mixed statuses', async () => {
    const arr: Correction[] = [
      mkC('1', 'pending'),
      mkC('2', 'accepted'),
      mkC('3', 'rejected'),
    ];
    await saveCorrections(A, 0, arr);
    expect(await loadCorrections(A, 0)).toEqual(arr);
  });

  it('isolates by page', async () => {
    await saveCorrections(A, 0, [mkC('a', 'pending')]);
    await saveCorrections(A, 1, [mkC('b', 'accepted')]);
    expect((await loadCorrections(A, 0))[0].id).toBe('a');
    expect((await loadCorrections(A, 1))[0].id).toBe('b');
  });
});
