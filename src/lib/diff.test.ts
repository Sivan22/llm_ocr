import { describe, it, expect } from 'vitest';
import { charDiff } from './diff';

describe('charDiff', () => {
  it('marks unchanged segments', () => {
    const out = charDiff('hello', 'hello');
    expect(out).toEqual([{ kind: 'eq', text: 'hello' }]);
  });

  it('marks single-char swap (Hebrew letter swap)', () => {
    const out = charDiff('דברי', 'רברי');
    expect(out[0]).toEqual({ kind: 'del', text: 'ד' });
    expect(out[1]).toEqual({ kind: 'add', text: 'ר' });
    expect(out[2]).toEqual({ kind: 'eq', text: 'ברי' });
  });

  it('handles whole-word replacement', () => {
    const out = charDiff('hello world', 'hello there');
    const joined = out.map((p) => `${p.kind}:${p.text}`).join('|');
    expect(joined).toContain('eq:hello ');
    expect(joined).toContain('del:');
    expect(joined).toContain('add:');
  });
});
