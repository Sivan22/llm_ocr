import { describe, it, expect } from 'vitest';
import { parseCorrections } from './correct';

describe('parseCorrections', () => {
  it('parses clean JSON array', () => {
    const out = parseCorrections('[{"old":"a","new":"b","reason":"r"}]');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ old: 'a', new: 'b', reason: 'r', status: 'pending' });
    expect(typeof out[0].id).toBe('string');
  });

  it('strips ```json fences', () => {
    const wrapped = '```json\n[{"old":"a","new":"b"}]\n```';
    const out = parseCorrections(wrapped);
    expect(out).toHaveLength(1);
  });

  it('strips bare ``` fences', () => {
    const wrapped = '```\n[{"old":"a","new":"b"}]\n```';
    expect(parseCorrections(wrapped)).toHaveLength(1);
  });

  it('returns [] on empty array', () => {
    expect(parseCorrections('[]')).toEqual([]);
  });

  it('returns [] on garbage', () => {
    expect(parseCorrections('hello world')).toEqual([]);
    expect(parseCorrections('{not json')).toEqual([]);
    expect(parseCorrections('null')).toEqual([]);
    expect(parseCorrections('{"object": "not array"}')).toEqual([]);
  });

  it('drops entries missing old or new', () => {
    const raw = JSON.stringify([
      { old: 'a', new: 'b' },
      { old: 'a' },
      { new: 'b' },
      {},
      { old: 'c', new: 'd', reason: 'rr' },
    ]);
    const out = parseCorrections(raw);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.old)).toEqual(['a', 'c']);
  });

  it('defaults missing reason to empty string', () => {
    const out = parseCorrections('[{"old":"a","new":"b"}]');
    expect(out[0].reason).toBe('');
  });
});
