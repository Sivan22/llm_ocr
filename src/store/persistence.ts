import { openDB, type IDBPDatabase } from 'idb';
import type { PageResult } from '../lib/types';

const DB_NAME = 'llm_ocr_web';
const DB_VERSION = 2;
const STORE_PAGE_RESULTS = 'pageResults';
export const STORE_JOBS = 'jobs';
export const STORE_CORRECTIONS = 'corrections';
export const STORE_PAGE_IMAGES = 'pageImages';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_PAGE_RESULTS)) {
          database.createObjectStore(STORE_PAGE_RESULTS);
        }
        if (!database.objectStoreNames.contains(STORE_JOBS)) {
          database.createObjectStore(STORE_JOBS);
        }
        if (!database.objectStoreNames.contains(STORE_CORRECTIONS)) {
          database.createObjectStore(STORE_CORRECTIONS);
        }
        if (!database.objectStoreNames.contains(STORE_PAGE_IMAGES)) {
          database.createObjectStore(STORE_PAGE_IMAGES);
        }
      },
    });
  }
  return dbPromise;
}

export function pageKey(fileHash: string, pageNum: number): string {
  return `${fileHash}:${String(pageNum).padStart(6, '0')}`;
}

export function pageRangeFor(fileHash: string): IDBKeyRange {
  return IDBKeyRange.bound(`${fileHash}:000000`, `${fileHash}:999999`);
}

export async function savePageResult(fileHash: string, result: PageResult): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_PAGE_RESULTS, result, pageKey(fileHash, result.pageNum));
  } catch (err) {
    console.warn('persistence.savePageResult failed', err);
  }
}

export async function loadAllPageResults(fileHash: string): Promise<PageResult[]> {
  try {
    const d = await db();
    const tx = d.transaction(STORE_PAGE_RESULTS, 'readonly');
    const out: PageResult[] = [];
    let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
    while (cursor) {
      out.push(cursor.value as PageResult);
      cursor = await cursor.continue();
    }
    out.sort((a, b) => a.pageNum - b.pageNum);
    return out;
  } catch (err) {
    console.warn('persistence.loadAllPageResults failed', err);
    return [];
  }
}

export async function deleteFile(fileHash: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE_PAGE_RESULTS, 'readwrite');
  let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
