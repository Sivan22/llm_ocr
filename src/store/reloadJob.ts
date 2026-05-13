import { getJob, upsertJob } from './jobs';
import { loadAllPageResults } from './persistence';
import { loadAllPageImages } from './pageImagesStore';
import type { StoredDoc } from '../pdf/render';
import type { PageResult } from '../lib/types';

export interface ReloadResult {
  doc: StoredDoc;
  fileHash: string;
  fileName: string;
  restored: PageResult[];
}

export async function reloadJob(fileHash: string): Promise<ReloadResult | null> {
  const job = await getJob(fileHash);
  if (!job) return null;
  const [restored, cache] = await Promise.all([
    loadAllPageResults(fileHash),
    loadAllPageImages(fileHash),
  ]);
  const doc: StoredDoc = {
    type: 'stored',
    fileHash,
    pageCount: job.pageCount,
    cache,
  };
  await upsertJob({ fileHash, fileName: job.fileName, pageCount: job.pageCount });
  return { doc, fileHash, fileName: job.fileName, restored };
}
