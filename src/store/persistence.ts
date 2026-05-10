import { openDB, type IDBPDatabase } from 'idb';
import type { PageResult } from '../lib/types';

const DB_NAME = 'llm_ocr_web';
const DB_VERSION = 1;
const STORE = 'pageResults';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

function key(fileHash: string, pageNum: number): string {
  return `${fileHash}:${String(pageNum).padStart(6, '0')}`;
}

function rangeFor(fileHash: string): IDBKeyRange {
  return IDBKeyRange.bound(`${fileHash}:000000`, `${fileHash}:999999`);
}

export async function savePageResult(fileHash: string, result: PageResult): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE, result, key(fileHash, result.pageNum));
  } catch (err) {
    console.warn('persistence.savePageResult failed', err);
  }
}

export async function loadAllPageResults(fileHash: string): Promise<PageResult[]> {
  try {
    const d = await db();
    const tx = d.transaction(STORE, 'readonly');
    const out: PageResult[] = [];
    let cursor = await tx.store.openCursor(rangeFor(fileHash));
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
  const tx = d.transaction(STORE, 'readwrite');
  let cursor = await tx.store.openCursor(rangeFor(fileHash));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
