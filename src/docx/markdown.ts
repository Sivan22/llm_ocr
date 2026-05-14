import type { PageResult } from '../lib/types';

export function joinPages(pages: PageResult[], order?: number[]): string {
  let sequence: PageResult[];
  if (order) {
    const byNum = new Map(pages.map((p) => [p.pageNum, p]));
    sequence = order.map((n) => byNum.get(n)).filter((p): p is PageResult => Boolean(p));
  } else {
    sequence = [...pages].sort((a, b) => a.pageNum - b.pageNum);
  }
  return sequence
    .filter((p) => p.status !== 'error')
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}
