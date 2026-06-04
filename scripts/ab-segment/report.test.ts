import { describe, it, expect } from 'vitest';
import type { PageReport } from './types';
import { buildReport } from './report';

const page: PageReport = {
  pageNum: 4,
  flags: ['no-footnote'],
  overlayDataUrl: 'data:image/png;base64,AAAA',
  a: { text: 'טקסט מלא', tokensIn: 100, tokensOut: 50 },
  b: {
    stitched: 'ימין\n\nשמאל',
    regions: [
      { role: 'right-body', text: 'ימין', tokensIn: 40, tokensOut: 20, cropDataUrl: 'data:image/png;base64,BBBB' },
      { role: 'left-body', text: 'שמאל', tokensIn: 45, tokensOut: 25, cropDataUrl: 'data:image/png;base64,CCCC' },
    ],
    totalTokensIn: 85,
    totalTokensOut: 45,
  },
};

describe('buildReport', () => {
  it('produces an RTL HTML document containing both transcriptions and flags', () => {
    const html = buildReport([page]);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Page 4');
    expect(html).toContain('no-footnote');
    expect(html).toContain('טקסט מלא');   // A text
    expect(html).toContain('ימין');        // B text
    expect(html).toContain('data:image/png;base64,AAAA'); // overlay embedded
    expect(html).toContain('data:image/png;base64,BBBB'); // crop embedded
  });
  it('escapes HTML-special characters in OCR text', () => {
    const p2 = { ...page, a: { ...page.a, text: 'a < b & c' } };
    const html = buildReport([p2]);
    expect(html).toContain('a &lt; b &amp; c');
  });
});
