import { describe, it, expect } from 'vitest';
import { joinPages } from './markdown';
import type { PageResult } from '../lib/types';

const ok = (n: number, t: string): PageResult => ({ pageNum: n, text: t, status: 'ok' });

describe('joinPages', () => {
  it('joins ok pages with blank-line separators in pageNum order', () => {
    const out = joinPages([ok(1, 'B'), ok(0, 'A'), ok(2, 'C')]);
    expect(out).toBe('A\n\nB\n\nC');
  });

  it('skips pages with empty/whitespace text', () => {
    const out = joinPages([ok(0, 'A'), ok(1, '   '), ok(2, 'C')]);
    expect(out).toBe('A\n\nC');
  });

  it('skips error pages', () => {
    const out = joinPages([ok(0, 'A'), { pageNum: 1, text: 'X', status: 'error', error: 'boom' }, ok(2, 'C')]);
    expect(out).toBe('A\n\nC');
  });

  it('preserves bold and headings verbatim', () => {
    const out = joinPages([ok(0, '## פרק א\n\n**שלום** עליכם')]);
    expect(out).toBe('## פרק א\n\n**שלום** עליכם');
  });
});
