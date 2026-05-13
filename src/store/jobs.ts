import {
  db,
  STORE_JOBS,
  STORE_CORRECTIONS,
  STORE_PAGE_IMAGES,
  pageRangeFor,
} from './persistence';

// `pageResults` is the private store name from persistence.ts (kept private
// since callers should go through `savePageResult` / `loadAllPageResults`).
// The cascade-delete needs the raw store name to wipe by key range.
const STORE_PAGE_RESULTS = 'pageResults';

export interface JobRecord {
  fileHash: string;
  fileName: string;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
}

export interface UpsertJobInput {
  fileHash: string;
  fileName: string;
  pageCount: number;
}

export async function upsertJob(input: UpsertJobInput): Promise<JobRecord> {
  const d = await db();
  const prev = (await d.get(STORE_JOBS, input.fileHash)) as JobRecord | undefined;
  const now = Date.now();
  const next: JobRecord = {
    fileHash: input.fileHash,
    fileName: input.fileName,
    pageCount: input.pageCount,
    createdAt: prev?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await d.put(STORE_JOBS, next, input.fileHash);
  return next;
}

export async function getJob(fileHash: string): Promise<JobRecord | undefined> {
  try {
    const d = await db();
    return (await d.get(STORE_JOBS, fileHash)) as JobRecord | undefined;
  } catch (err) {
    console.warn('jobs.getJob failed', err);
    return undefined;
  }
}

export async function listJobs(): Promise<JobRecord[]> {
  try {
    const d = await db();
    const all = (await d.getAll(STORE_JOBS)) as JobRecord[];
    return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch (err) {
    console.warn('jobs.listJobs failed', err);
    return [];
  }
}

export async function deleteJob(fileHash: string): Promise<void> {
  try {
    const d = await db();
    const tx = d.transaction(
      [STORE_JOBS, STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES],
      'readwrite',
    );
    await tx.objectStore(STORE_JOBS).delete(fileHash);
    for (const store of [STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES] as const) {
      let cur = await tx.objectStore(store).openCursor(pageRangeFor(fileHash));
      while (cur) {
        await cur.delete();
        cur = await cur.continue();
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('jobs.deleteJob failed', err);
  }
}

export async function pruneJobs(max: number): Promise<void> {
  const all = await listJobs();
  const drop = all.slice(max);
  for (const j of drop) await deleteJob(j.fileHash);
}

export interface RekeyJobInput {
  oldHash: string;
  newHash: string;
  fileName: string;
  pageCount: number;
}

export async function rekeyJob(input: RekeyJobInput): Promise<JobRecord> {
  const { oldHash, newHash, fileName, pageCount } = input;
  const d = await db();
  const now = Date.now();

  if (oldHash === newHash) {
    const prev = (await d.get(STORE_JOBS, oldHash)) as JobRecord | undefined;
    const next: JobRecord = {
      fileHash: oldHash,
      fileName,
      pageCount,
      createdAt: prev?.createdAt ?? now,
      lastOpenedAt: now,
    };
    await d.put(STORE_JOBS, next, oldHash);
    return next;
  }

  const tx = d.transaction(
    [STORE_JOBS, STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES],
    'readwrite',
  );

  const jobsStore = tx.objectStore(STORE_JOBS);
  const prev = (await jobsStore.get(oldHash)) as JobRecord | undefined;

  for (const store of [STORE_PAGE_RESULTS, STORE_CORRECTIONS, STORE_PAGE_IMAGES] as const) {
    const os = tx.objectStore(store);
    let cur = await os.openCursor(pageRangeFor(oldHash));
    while (cur) {
      const oldKey = cur.key as string;
      const suffix = oldKey.slice(oldHash.length + 1); // strip "oldHash:"
      const newKey = `${newHash}:${suffix}`;
      await os.put(cur.value, newKey);
      await cur.delete();
      cur = await cur.continue();
    }
  }

  const next: JobRecord = {
    fileHash: newHash,
    fileName,
    pageCount,
    createdAt: prev?.createdAt ?? now,
    lastOpenedAt: now,
  };
  await jobsStore.put(next, newHash);
  await jobsStore.delete(oldHash);
  await tx.done;

  return next;
}
