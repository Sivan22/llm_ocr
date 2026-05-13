import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { upsertJob, listJobs, getJob, deleteJob, pruneJobs } from './jobs';
import { savePageResult, loadAllPageResults } from './persistence';
import { saveCorrections, loadCorrections } from './correctionsStore';
import { savePageImage, loadPageImage } from './pageImagesStore';

const A = 'aaaa';
const B = 'bbbb';
const C = 'cccc';

async function reset() {
  for (const h of [A, B, C]) await deleteJob(h);
}

describe('jobs store', () => {
  beforeEach(reset);

  it('upsert + getJob', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 10 });
    const j = await getJob(A);
    expect(j?.fileName).toBe('a.pdf');
    expect(j?.pageCount).toBe(10);
    expect(j?.createdAt).toBeGreaterThan(0);
    expect(j?.lastOpenedAt).toBeGreaterThan(0);
  });

  it('upsert again updates fileName, pageCount, lastOpenedAt; keeps createdAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 10 });
    const first = await getJob(A);
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: A, fileName: 'renamed.pdf', pageCount: 12 });
    const second = await getJob(A);
    expect(second?.fileName).toBe('renamed.pdf');
    expect(second?.pageCount).toBe(12);
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second!.lastOpenedAt).toBeGreaterThan(first!.lastOpenedAt);
  });

  it('listJobs returns rows sorted by lastOpenedAt desc', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: B, fileName: 'b', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: C, fileName: 'c', pageCount: 1 });
    const ids = (await listJobs()).map((j) => j.fileHash);
    expect(ids).toEqual([C, B, A]);
  });

  it('deleteJob cascades to pageResults, corrections, pageImages', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'x', status: 'ok' });
    await saveCorrections(A, 0, [{ id: '1', old: 'a', new: 'b', reason: '', status: 'pending' }]);
    await savePageImage(A, 0, { dataUrl: 'data:,', mediaType: 'image/png' });

    await deleteJob(A);

    expect(await getJob(A)).toBeUndefined();
    expect(await loadAllPageResults(A)).toEqual([]);
    expect(await loadCorrections(A, 0)).toEqual([]);
    expect(await loadPageImage(A, 0)).toBeUndefined();
  });

  it('pruneJobs keeps newest N by lastOpenedAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: B, fileName: 'b', pageCount: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await upsertJob({ fileHash: C, fileName: 'c', pageCount: 1 });
    await pruneJobs(2);
    const ids = (await listJobs()).map((j) => j.fileHash);
    expect(ids).toEqual([C, B]);
  });
});
