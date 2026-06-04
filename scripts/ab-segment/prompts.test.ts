import { describe, it, expect } from 'vitest';
import { regionPrompt, stitch, BODY_PROMPT, FOOTNOTE_PROMPT } from './prompts';

describe('regionPrompt', () => {
  it('uses the footnote prompt for footnotes', () => {
    expect(regionPrompt('footnotes')).toBe(FOOTNOTE_PROMPT);
  });
  it('uses the body prompt for columns', () => {
    expect(regionPrompt('right-body')).toBe(BODY_PROMPT);
    expect(regionPrompt('left-body')).toBe(BODY_PROMPT);
  });
});

describe('stitch', () => {
  it('joins right then left with a blank line', () => {
    expect(stitch('RIGHT', 'LEFT')).toBe('RIGHT\n\nLEFT');
  });
  it('appends a footnote block when footnotes present', () => {
    expect(stitch('R', 'L', 'NOTE')).toBe('R\n\nL\n\n---\nהערות\n---\nNOTE');
  });
  it('omits the footnote block when footnotes empty/whitespace', () => {
    expect(stitch('R', 'L', '   ')).toBe('R\n\nL');
  });
});
