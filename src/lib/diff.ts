import { diffChars } from 'diff';

export type DiffPart = { kind: 'eq' | 'add' | 'del'; text: string };

export function charDiff(oldText: string, newText: string): DiffPart[] {
  const parts = diffChars(oldText, newText);
  return parts.map((p) => ({
    kind: p.added ? 'add' : p.removed ? 'del' : 'eq',
    text: p.value,
  }));
}
