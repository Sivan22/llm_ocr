export interface ParsePageRangeResult {
  pages: number[];        // sorted, deduped, 0-based, in [0, pageCount-1]
  error: 'parse' | null;
}

const TOKEN = /^\s*(\d*)\s*-\s*(\d*)\s*$|^\s*(\d+)\s*$/;

export function parsePageRange(input: string, pageCount: number): ParsePageRangeResult {
  const trimmed = input.trim().replace(/\s*-\s*/g, '-');
  if (trimmed === '' || pageCount <= 0) return { pages: [], error: null };

  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const set = new Set<number>();

  for (const tok of tokens) {
    const m = tok.match(TOKEN);
    if (!m) return { pages: [], error: 'parse' };

    let aRaw: string | undefined;
    let bRaw: string | undefined;
    if (m[3] !== undefined) {
      aRaw = m[3];
      bRaw = m[3];
    } else {
      aRaw = m[1] || '';
      bRaw = m[2] || '';
      if (aRaw === '' && bRaw === '') return { pages: [], error: 'parse' };
    }

    const aOneBased = aRaw === '' ? 1 : Number(aRaw);
    const bOneBased = bRaw === '' ? pageCount : Number(bRaw);
    if (!Number.isFinite(aOneBased) || !Number.isFinite(bOneBased)) {
      return { pages: [], error: 'parse' };
    }

    // Clamp each bound to valid range [1, pageCount], then swap if needed
    const aClamped = Math.max(1, Math.min(pageCount, aOneBased));
    const bClamped = Math.max(1, Math.min(pageCount, bOneBased));
    const lo = Math.min(aClamped, bClamped);
    const hi = Math.max(aClamped, bClamped);
    for (let i = lo; i <= hi; i++) set.add(i - 1);
  }

  return { pages: [...set].sort((a, b) => a - b), error: null };
}
