import { db, STORE_RUN_LOGS } from './persistence';

export async function saveRunLog(fileHash: string, log: string[]): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_RUN_LOGS, log, fileHash);
  } catch (err) {
    console.warn('runLogStore.saveRunLog failed', err);
  }
}

export async function loadRunLog(fileHash: string): Promise<string[]> {
  try {
    const d = await db();
    const v = await d.get(STORE_RUN_LOGS, fileHash);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch (err) {
    console.warn('runLogStore.loadRunLog failed', err);
    return [];
  }
}

export async function deleteRunLog(fileHash: string): Promise<void> {
  try {
    const d = await db();
    await d.delete(STORE_RUN_LOGS, fileHash);
  } catch (err) {
    console.warn('runLogStore.deleteRunLog failed', err);
  }
}
