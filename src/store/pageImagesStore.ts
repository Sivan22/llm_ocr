import { db, STORE_PAGE_IMAGES, pageKey, pageRangeFor } from './persistence';

export interface StoredPageImage {
  dataUrl: string;
  mediaType: string;
}

export async function savePageImage(
  fileHash: string,
  pageNum: number,
  img: StoredPageImage,
): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE_PAGE_IMAGES, img, pageKey(fileHash, pageNum));
  } catch (err) {
    console.warn('pageImagesStore.savePageImage failed', err);
  }
}

export async function loadPageImage(
  fileHash: string,
  pageNum: number,
): Promise<StoredPageImage | undefined> {
  try {
    const d = await db();
    return (await d.get(STORE_PAGE_IMAGES, pageKey(fileHash, pageNum))) as StoredPageImage | undefined;
  } catch (err) {
    console.warn('pageImagesStore.loadPageImage failed', err);
    return undefined;
  }
}

export async function loadAllPageImages(fileHash: string): Promise<Map<number, StoredPageImage>> {
  const out = new Map<number, StoredPageImage>();
  try {
    const d = await db();
    const tx = d.transaction(STORE_PAGE_IMAGES, 'readonly');
    let cursor = await tx.store.openCursor(pageRangeFor(fileHash));
    while (cursor) {
      const k = String(cursor.key);
      const n = Number(k.slice(fileHash.length + 1));
      if (Number.isFinite(n)) out.set(n, cursor.value as StoredPageImage);
      cursor = await cursor.continue();
    }
  } catch (err) {
    console.warn('pageImagesStore.loadAllPageImages failed', err);
  }
  return out;
}
