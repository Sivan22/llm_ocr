import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { savePageResult, loadAllPageResults, deleteFile } from './persistence';
import type { PageResult } from '../lib/types';

const A = 'aaaa';
const B = 'bbbb';

const result = (n: number, t: string): PageResult => ({
  pageNum: n, text: t, status: 'ok',
});

beforeEach(async () => {
  await deleteFile(A); await deleteFile(B);
});

describe('persistence', () => {
  it('saves and reloads a page result', async () => {
    await savePageResult(A, result(0, 'hello'));
    const out = await loadAllPageResults(A);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('hello');
  });

  it('isolates results by fileHash', async () => {
    await savePageResult(A, result(0, 'A0'));
    await savePageResult(B, result(0, 'B0'));
    expect((await loadAllPageResults(A))[0].text).toBe('A0');
    expect((await loadAllPageResults(B))[0].text).toBe('B0');
  });

  it('returns sorted page results', async () => {
    await savePageResult(A, result(2, 'two'));
    await savePageResult(A, result(0, 'zero'));
    await savePageResult(A, result(1, 'one'));
    const out = await loadAllPageResults(A);
    expect(out.map((p) => p.pageNum)).toEqual([0, 1, 2]);
  });

  it('overwrites a page result on resave', async () => {
    await savePageResult(A, result(0, 'first'));
    await savePageResult(A, result(0, 'second'));
    const out = await loadAllPageResults(A);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('second');
  });
});

describe('persistence DB v2', () => {
  it('creates jobs, corrections, pageImages stores on upgrade', async () => {
    // Trigger db open via any existing call:
    await loadAllPageResults('zzzz');
    const db = await openDB('llm_ocr_web');
    expect(db.objectStoreNames.contains('pageResults')).toBe(true);
    expect(db.objectStoreNames.contains('jobs')).toBe(true);
    expect(db.objectStoreNames.contains('corrections')).toBe(true);
    expect(db.objectStoreNames.contains('pageImages')).toBe(true);
    db.close();
  });
});
