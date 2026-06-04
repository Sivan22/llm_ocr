import { describe, it, expect } from 'vitest';
import { parsePages, parseArgs } from './cli';

describe('parsePages', () => {
  it('parses a comma list', () => {
    expect(parsePages('4,5,6')).toEqual([4, 5, 6]);
  });
  it('expands ranges and preserves order', () => {
    expect(parsePages('4,12-15')).toEqual([4, 12, 13, 14, 15]);
  });
  it('trims whitespace and ignores empties', () => {
    expect(parsePages(' 4 , , 6 ')).toEqual([4, 6]);
  });
});

describe('parseArgs', () => {
  it('applies defaults when nothing passed', () => {
    const o = parseArgs([]);
    expect(o.pages).toEqual([4, 5, 6]);
    expect(o.pdf).toBe('Hebrewbooks_org_740.pdf');
    expect(o.out).toBe('scripts/ab-segment/out');
    expect(o.aDpi).toBe(200);
    expect(o.cropDpi).toBe(400);
    expect(o.noFootnotes).toBe(false);
    expect(o.gutterFrac).toBeUndefined();
    expect(o.footnoteFrac).toBeUndefined();
  });
  it('parses flags', () => {
    const o = parseArgs(['--pages', '7-8', '--crop-dpi', '500', '--gutter', '0.52', '--no-footnotes']);
    expect(o.pages).toEqual([7, 8]);
    expect(o.cropDpi).toBe(500);
    expect(o.gutterFrac).toBeCloseTo(0.52);
    expect(o.noFootnotes).toBe(true);
  });
});
