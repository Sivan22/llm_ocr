import { describe, it, expect } from 'vitest';
import { joinPages, extractToc, parsePageFootnotes, assembleDocument } from './markdown';
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

describe('extractToc', () => {
  it('returns empty for empty markdown', () => {
    expect(extractToc('')).toEqual([]);
  });

  it('returns empty when there are no headings', () => {
    expect(extractToc('plain text\n\nmore text')).toEqual([]);
  });

  it('captures heading depth and text', () => {
    const out = extractToc('# A\n\n## B\n\n### C');
    expect(out.map((e) => ({ depth: e.depth, text: e.text }))).toEqual([
      { depth: 1, text: 'A' },
      { depth: 2, text: 'B' },
      { depth: 3, text: 'C' },
    ]);
  });

  it('assigns paragraphIndex matching mdToDocxBlob paragraph order', () => {
    // tokens: paragraph(intro) → heading(A) → paragraph(body1) → heading(B) → paragraph(body2)
    // expected DOCX paragraph indices: 0, 1, 2, 3, 4 — so headings sit at 1 and 3
    const md = 'intro\n\n# A\n\nbody1\n\n## B\n\nbody2';
    const out = extractToc(md);
    expect(out.map((e) => e.paragraphIndex)).toEqual([1, 3]);
  });

  it('assigns unique ids', () => {
    const out = extractToc('# A\n\n# A\n\n# A');
    expect(new Set(out.map((e) => e.id)).size).toBe(3);
  });
});

describe('parsePageFootnotes', () => {
  it('returns empty footnotes when no separator', () => {
    const out = parsePageFootnotes('plain body text');
    expect(out.body).toBe('plain body text');
    expect(out.continuation).toBe('');
    expect(out.footnotes).toEqual([]);
  });

  it('splits body and footnotes on the הערות separator', () => {
    const page = 'body with [*] marker\n\n---\nהערות\n---\n[*] first note';
    const out = parsePageFootnotes(page);
    expect(out.body).toBe('body with [*] marker');
    expect(out.continuation).toBe('');
    expect(out.footnotes).toEqual(['first note']);
  });

  it('treats leading lines (no [*]) as continuation from previous page', () => {
    const page = 'body\n\n---\nהערות\n---\nrest of prior note\n[*] new note';
    const out = parsePageFootnotes(page);
    expect(out.continuation).toBe('rest of prior note');
    expect(out.footnotes).toEqual(['new note']);
  });

  it('keeps multi-line footnote text together until next [*]', () => {
    const page = 'body\n\n---\nהערות\n---\n[*] note one line one\nnote one line two\n[*] note two';
    const out = parsePageFootnotes(page);
    expect(out.footnotes).toEqual(['note one line one\nnote one line two', 'note two']);
  });
});

describe('assembleDocument', () => {
  it('returns body without trailing notes block when there are no footnotes', () => {
    const out = assembleDocument([ok(0, 'A'), ok(1, 'B')]);
    expect(out.body).toBe('A\n\nB');
    expect(out.footnotes).toEqual([]);
  });

  it('collects footnotes across pages preserving order', () => {
    const p1 = 'page one [*] x\n\n---\nהערות\n---\n[*] note A';
    const p2 = 'page two [*] y\n\n---\nהערות\n---\n[*] note B';
    const out = assembleDocument([ok(0, p1), ok(1, p2)]);
    expect(out.body).toBe('page one [*] x\n\npage two [*] y');
    expect(out.footnotes).toEqual(['note A', 'note B']);
  });

  it('appends continuation note to previous page last footnote', () => {
    const p1 = 'page one [*] x\n\n---\nהערות\n---\n[*] start of note A';
    const p2 = 'page two\n\n---\nהערות\n---\nend of note A';
    const out = assembleDocument([ok(0, p1), ok(1, p2)]);
    expect(out.footnotes).toEqual(['start of note A end of note A']);
  });
});

describe('joinPages with footnotes', () => {
  it('consolidates footnotes into a single trailing הערות block', () => {
    const p1 = 'page one [*] x\n\n---\nהערות\n---\n[*] note A';
    const p2 = 'page two [*] y\n\n---\nהערות\n---\n[*] note B';
    const out = joinPages([ok(0, p1), ok(1, p2)]);
    expect(out).toBe('page one [*] x\n\npage two [*] y\n\n---\nהערות\n---\n[*] note A\n[*] note B');
  });
});
