export function sanitizePageOrder(order: number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of order) {
    if (!Number.isInteger(n)) continue;
    if (n < 0 || n >= pageCount) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function applyMove(prev: number[], moving: number[], toIndex: number): number[] {
  const movingSet = new Set(moving);
  const movingInOrder = prev.filter((n) => movingSet.has(n));
  if (movingInOrder.length === 0) return prev;
  const remaining = prev.filter((n) => !movingSet.has(n));
  const clamped = Math.max(0, Math.min(toIndex, prev.length));
  const insertAt = prev.slice(0, clamped).filter((n) => !movingSet.has(n)).length;
  return [
    ...remaining.slice(0, insertAt),
    ...movingInOrder,
    ...remaining.slice(insertAt),
  ];
}
