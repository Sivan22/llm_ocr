import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { reloadJob } from './reloadJob';
import { upsertJob, deleteJob } from './jobs';
import { savePageResult } from './persistence';
import { savePageImage } from './pageImagesStore';

const H = 'reloadhash';

describe('reloadJob', () => {
  beforeEach(async () => { await deleteJob(H); });

  it('returns null when no job exists', async () => {
    const out = await reloadJob('missing');
    expect(out).toBeNull();
  });

  it('builds a StoredDoc with restored text and image cache', async () => {
    await upsertJob({ fileHash: H, fileName: 'r.pdf', pageCount: 3 });
    await savePageResult(H, { pageNum: 0, text: 'one', status: 'ok' });
    await savePageImage(H, 0, { dataUrl: 'data:image/png;base64,A', mediaType: 'image/png' });
    await savePageImage(H, 2, { dataUrl: 'data:image/png;base64,B', mediaType: 'image/png' });

    const out = await reloadJob(H);
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('r.pdf');
    expect(out!.doc.type).toBe('stored');
    expect(out!.doc.pageCount).toBe(3);
    expect(out!.doc.cache.get(0)?.dataUrl.endsWith('A')).toBe(true);
    expect(out!.doc.cache.get(2)?.dataUrl.endsWith('B')).toBe(true);
    expect(out!.restored[0].text).toBe('one');
  });
});
