import { describe, it, expect } from 'vitest';
import { planInlineDiff, extractEditorText } from './inlineDiff';
import type { Correction } from './types';

const mkC = (over: Partial<Correction> & Pick<Correction, 'id' | 'old' | 'new'>): Correction => ({
  reason: '',
  status: 'pending',
  ...over,
});

describe('planInlineDiff', () => {
  it('returns a single plain segment when there are no corrections', () => {
    const out = planInlineDiff('hello world', []);
    expect(out).toEqual([{ kind: 'plain', text: 'hello world' }]);
  });

  it('emits empty array for empty text', () => {
    const out = planInlineDiff('', []);
    expect(out).toEqual([]);
  });

  it('renders a pending correction in the middle of the text with charDiff inside', () => {
    const text = 'before אבג after';
    const c = mkC({ id: 'c1', old: 'אבג', new: 'אבד' });
    const out = planInlineDiff(text, [c]);
    expect(out[0]).toEqual({ kind: 'plain', text: 'before ' });
    // diff between אבג and אבד → eq "אב", del "ג", ins "ד"
    expect(out[1]).toEqual({ kind: 'eq', text: 'אב', cid: 'c1' });
    expect(out[2]).toEqual({ kind: 'del', text: 'ג', cid: 'c1' });
    expect(out[3]).toEqual({ kind: 'ins', text: 'ד', cid: 'c1' });
    expect(out[4]).toEqual({ kind: 'plain', text: ' after' });
  });

  it('skips a pending correction whose old text is not present', () => {
    const c = mkC({ id: 'c1', old: 'zzz', new: 'aaa' });
    const out = planInlineDiff('hello world', [c]);
    expect(out).toEqual([{ kind: 'plain', text: 'hello world' }]);
  });

  it('orders multiple corrections by position and drops overlaps', () => {
    const text = 'aaa BBB ccc DDD eee';
    const c1 = mkC({ id: 'c1', old: 'DDD', new: 'XXX' });   // appears later
    const c2 = mkC({ id: 'c2', old: 'BBB', new: 'YYY' });   // appears earlier
    const c3 = mkC({ id: 'c3', old: 'BB ccc', new: 'ZZ' }); // overlaps with c2 → dropped
    const out = planInlineDiff(text, [c1, c2, c3]);
    const cids = out.filter((s): s is Extract<typeof s, { cid: string }> => 'cid' in s).map((s) => s.cid);
    expect(cids).toContain('c1');
    expect(cids).toContain('c2');
    expect(cids).not.toContain('c3');
    const firstC1 = out.findIndex((s) => 'cid' in s && s.cid === 'c1');
    const firstC2 = out.findIndex((s) => 'cid' in s && s.cid === 'c2');
    expect(firstC2).toBeLessThan(firstC1);
  });

  it('renders an accepted correction as an applied segment around c.new', () => {
    const text = 'foo NEW bar';
    const c = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'accepted' });
    const out = planInlineDiff(text, [c]);
    expect(out).toEqual([
      { kind: 'plain', text: 'foo ' },
      { kind: 'applied', text: 'NEW', cid: 'c1' },
      { kind: 'plain', text: ' bar' },
    ]);
  });

  it('ignores rejected corrections (renders surrounding text as plain)', () => {
    const text = 'foo OLD bar';
    const c = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'rejected' });
    const out = planInlineDiff(text, [c]);
    expect(out).toEqual([{ kind: 'plain', text: 'foo OLD bar' }]);
  });
});

function renderToDom(segments: ReturnType<typeof planInlineDiff>): HTMLElement {
  const root = document.createElement('div');
  for (const s of segments) {
    if (s.kind === 'plain') {
      root.appendChild(document.createTextNode(s.text));
      continue;
    }
    const span = document.createElement('span');
    span.dataset.kind = s.kind;
    span.dataset.cid = s.cid;
    if (s.kind === 'ins' || s.kind === 'applied') span.setAttribute('contenteditable', 'false');
    if (s.kind === 'ins') span.dataset.ins = 'true';
    span.textContent = s.text;
    root.appendChild(span);
  }
  return root;
}

describe('extractEditorText', () => {
  it('returns empty string for an empty editor', () => {
    const root = document.createElement('div');
    expect(extractEditorText(root)).toBe('');
  });

  it('round-trips: planInlineDiff -> render -> extract === pageText', () => {
    const text = 'before אבג after';
    const c = mkC({ id: 'c1', old: 'אבג', new: 'אבד' });
    const segs = planInlineDiff(text, [c]);
    const root = renderToDom(segs);
    expect(extractEditorText(root)).toBe(text);
  });

  it('round-trips with an accepted correction (applied span is part of underlying text)', () => {
    const text = 'foo NEW bar';
    const c = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'accepted' });
    const segs = planInlineDiff(text, [c]);
    const root = renderToDom(segs);
    expect(extractEditorText(root)).toBe(text);
  });

  it('reflects edits inside plain regions', () => {
    const segs = planInlineDiff('hello world', []);
    const root = renderToDom(segs);
    (root.firstChild as Text).textContent = 'hello brave world';
    expect(extractEditorText(root)).toBe('hello brave world');
  });
});
