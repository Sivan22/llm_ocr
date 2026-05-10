import type { PageResult } from '../lib/types';

export function joinPages(pages: PageResult[]): string {
  const sorted = [...pages].sort((a, b) => a.pageNum - b.pageNum);
  return sorted
    .filter((p) => p.status !== 'error')
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}
