import { db, STORE_CORRECTIONS, pageKey } from './persistence';
import type { Correction } from '../lib/types';

export async function saveCorrections(
  fileHash: string,
  pageNum: number,
  corrections: Correction[],
): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_CORRECTIONS, corrections, pageKey(fileHash, pageNum));
  } catch (err) {
    console.warn('correctionsStore.saveCorrections failed', err);
  }
}

export async function loadCorrections(
  fileHash: string,
  pageNum: number,
): Promise<Correction[]> {
  try {
    const d = await db();
    const v = await d.get(STORE_CORRECTIONS, pageKey(fileHash, pageNum));
    return Array.isArray(v) ? (v as Correction[]) : [];
  } catch (err) {
    console.warn('correctionsStore.loadCorrections failed', err);
    return [];
  }
}
