import type { Correction } from './types';
import { charDiff } from './diff';

export type InlineSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'eq'; text: string; cid: string }
  | { kind: 'del'; text: string; cid: string }
  | { kind: 'ins'; text: string; cid: string }
  | { kind: 'applied'; text: string; cid: string };

interface Hit {
  cid: string;
  start: number;
  end: number;
  kind: 'pending' | 'applied';
  oldText: string;
  newText: string;
}

export function planInlineDiff(pageText: string, corrections: Correction[]): InlineSegment[] {
  if (pageText.length === 0) return [];

  const hits: Hit[] = [];
  for (const c of corrections) {
    if (c.status === 'pending') {
      const start = pageText.indexOf(c.old);
      if (start < 0) continue;
      hits.push({ cid: c.id, start, end: start + c.old.length, kind: 'pending', oldText: c.old, newText: c.new });
    } else if (c.status === 'accepted') {
      const start = pageText.indexOf(c.new);
      if (start < 0) continue;
      hits.push({ cid: c.id, start, end: start + c.new.length, kind: 'applied', oldText: c.old, newText: c.new });
    }
  }

  hits.sort((a, b) => a.start - b.start);

  const kept: Hit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start < lastEnd) continue;
    kept.push(h);
    lastEnd = h.end;
  }

  const out: InlineSegment[] = [];
  let cursor = 0;
  for (const h of kept) {
    if (h.start > cursor) {
      out.push({ kind: 'plain', text: pageText.slice(cursor, h.start) });
    }
    if (h.kind === 'applied') {
      out.push({ kind: 'applied', text: h.newText, cid: h.cid });
    } else {
      for (const part of charDiff(h.oldText, h.newText)) {
        if (part.kind === 'eq') out.push({ kind: 'eq', text: part.text, cid: h.cid });
        else if (part.kind === 'del') out.push({ kind: 'del', text: part.text, cid: h.cid });
        else out.push({ kind: 'ins', text: part.text, cid: h.cid });
      }
    }
    cursor = h.end;
  }
  if (cursor < pageText.length) {
    out.push({ kind: 'plain', text: pageText.slice(cursor) });
  }
  return out;
}
