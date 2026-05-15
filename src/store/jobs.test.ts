import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { upsertJob, listJobs, getJob, deleteJob, pruneJobs, rekeyJob, updateJobPageOrder } from './jobs';
import { savePageResult, loadAllPageResults } from './persistence';
import { saveCorrections, loadCorrections } from './correctionsStore';
import { savePageImage, loadPageImage } from './pageImagesStore';
import { saveRunLog, loadRunLog } from './runLogStore';

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

  it('deleteJob cascades to pageResults, corrections, pageImages, runLogs', async () => {
    await upsertJob({ fileHash: A, fileName: 'a', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'x', status: 'ok' });
    await saveCorrections(A, 0, [{ id: '1', old: 'a', new: 'b', reason: '', status: 'pending' }]);
    await savePageImage(A, 0, { dataUrl: 'data:,', mediaType: 'image/png' });
    await saveRunLog(A, ['ran page 1']);

    await deleteJob(A);

    expect(await getJob(A)).toBeUndefined();
    expect(await loadAllPageResults(A)).toEqual([]);
    expect(await loadCorrections(A, 0)).toEqual([]);
    expect(await loadPageImage(A, 0)).toBeUndefined();
    expect(await loadRunLog(A)).toEqual([]);
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

describe('rekeyJob', () => {
  beforeEach(reset);

  it('moves pageResults, corrections, pageImages, runLogs from oldHash to newHash and updates the Job row', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'one', status: 'ok' });
    await savePageResult(A, { pageNum: 1, text: 'two', status: 'edited' });
    await saveCorrections(A, 0, [{ id: 'c1', old: 'a', new: 'b', reason: 'r', status: 'pending' }]);
    await savePageImage(A, 0, { dataUrl: 'data:image/png;base64,AAA', mediaType: 'image/png' });
    await saveRunLog(A, ['page 1 ok', 'page 2 ok']);

    await rekeyJob({ oldHash: A, newHash: B, fileName: 'a+b.pdf', pageCount: 5 });

    // Old hash is empty.
    expect(await loadAllPageResults(A)).toEqual([]);
    expect(await loadCorrections(A, 0)).toEqual([]);
    expect(await loadPageImage(A, 0)).toBeUndefined();
    expect(await loadRunLog(A)).toEqual([]);
    expect(await getJob(A)).toBeUndefined();

    // New hash has everything.
    const restored = await loadAllPageResults(B);
    expect(restored.map((p) => p.pageNum)).toEqual([0, 1]);
    expect((await loadCorrections(B, 0)).length).toBe(1);
    expect((await loadPageImage(B, 0))?.dataUrl).toContain('AAA');
    expect(await loadRunLog(B)).toEqual(['page 1 ok', 'page 2 ok']);
    const nj = await getJob(B);
    expect(nj?.fileName).toBe('a+b.pdf');
    expect(nj?.pageCount).toBe(5);
  });

  it('is a no-op when oldHash === newHash, only updating fileName/pageCount/lastOpenedAt', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 2 });
    await savePageResult(A, { pageNum: 0, text: 'one', status: 'ok' });

    await rekeyJob({ oldHash: A, newHash: A, fileName: 'a-renamed.pdf', pageCount: 3 });

    const j = await getJob(A);
    expect(j?.fileName).toBe('a-renamed.pdf');
    expect(j?.pageCount).toBe(3);
    expect((await loadAllPageResults(A)).length).toBe(1);
  });
});

describe('pageOrder persistence', () => {
  beforeEach(reset);

  it('upsertJob stores and preserves pageOrder across upserts', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 3, pageOrder: [2, 0, 1] });
    expect((await getJob(A))?.pageOrder).toEqual([2, 0, 1]);

    // Re-upserting without pageOrder preserves the existing value.
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 3 });
    expect((await getJob(A))?.pageOrder).toEqual([2, 0, 1]);
  });

  it('updateJobPageOrder writes the new order', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 3 });
    await updateJobPageOrder(A, [1, 0]);
    expect((await getJob(A))?.pageOrder).toEqual([1, 0]);
  });

  it('rekeyJob carries pageOrder over to the new hash', async () => {
    await upsertJob({ fileHash: A, fileName: 'a.pdf', pageCount: 3, pageOrder: [2, 0, 1] });
    await rekeyJob({ oldHash: A, newHash: B, fileName: 'a+b.pdf', pageCount: 5 });
    expect((await getJob(B))?.pageOrder).toEqual([2, 0, 1]);
  });
});
