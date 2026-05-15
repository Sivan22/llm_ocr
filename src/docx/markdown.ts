import { marked, type Tokens } from 'marked';
import type { PageResult } from '../lib/types';

const FOOTNOTE_SEPARATOR = /(?:^|\n)[ \t]*---[ \t]*\n[ \t]*הערות[ \t]*\n[ \t]*---[ \t]*(?=\n|$)/;
export const FOOTNOTE_MARKER = '[*]';

export type TocEntry = {
  id: string;
  depth: number;
  text: string;
  paragraphIndex: number;
};

export function extractToc(md: string): TocEntry[] {
  if (!md) return [];
  const tokens = marked.lexer(md);
  const entries: TocEntry[] = [];
  let paragraphIndex = 0;
  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const h = tok as Tokens.Heading;
      entries.push({
        id: `toc-${entries.length}`,
        depth: h.depth,
        text: h.text,
        paragraphIndex,
      });
      paragraphIndex += 1;
    } else if (tok.type === 'paragraph') {
      paragraphIndex += 1;
    } else if (tok.type === 'space') {
      // skipped in mdToDocxBlob
    } else if ('text' in tok && typeof (tok as { text?: unknown }).text === 'string') {
      paragraphIndex += 1;
    }
  }
  return entries;
}

export interface ParsedPage {
  body: string;
  continuation: string;
  footnotes: string[];
}

export function parsePageFootnotes(pageText: string): ParsedPage {
  const match = pageText.match(FOOTNOTE_SEPARATOR);
  if (!match || match.index === undefined) {
    return { body: pageText.trim(), continuation: '', footnotes: [] };
  }
  const body = pageText.slice(0, match.index).trimEnd();
  const notesBlock = pageText.slice(match.index + match[0].length).replace(/^\n+/, '');

  const lines = notesBlock.split('\n');
  const continuationLines: string[] = [];
  const footnotes: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith(FOOTNOTE_MARKER)) {
      if (current !== null) footnotes.push(current.trim());
      current = trimmed.slice(FOOTNOTE_MARKER.length).trimStart();
    } else if (current !== null) {
      current += '\n' + line;
    } else {
      continuationLines.push(line);
    }
  }
  if (current !== null) footnotes.push(current.trim());
  const continuation = continuationLines.join('\n').trim();
  return { body, continuation, footnotes };
}

export interface AssembledDocument {
  body: string;
  footnotes: string[];
}

export function assembleDocument(pages: PageResult[], order?: number[]): AssembledDocument {
  const sequence = orderedPages(pages, order);
  let body = '';
  const footnotes: string[] = [];
  for (const page of sequence) {
    if (!page.text.trim()) continue;
    const parsed = parsePageFootnotes(page.text);
    if (parsed.continuation) {
      if (footnotes.length > 0) {
        footnotes[footnotes.length - 1] = `${footnotes[footnotes.length - 1]} ${parsed.continuation}`.trim();
      } else {
        footnotes.push(parsed.continuation);
      }
    }
    for (const note of parsed.footnotes) footnotes.push(note);
    if (parsed.body) {
      body = body ? `${body}\n\n${parsed.body}` : parsed.body;
    }
  }
  return { body, footnotes };
}

export function joinPages(pages: PageResult[], order?: number[]): string {
  const { body, footnotes } = assembleDocument(pages, order);
  if (footnotes.length === 0) return body;
  const notesMd = footnotes.map((n) => `${FOOTNOTE_MARKER} ${n}`).join('\n');
  return `${body}\n\n---\nהערות\n---\n${notesMd}`;
}

function orderedPages(pages: PageResult[], order?: number[]): PageResult[] {
  let sequence: PageResult[];
  if (order) {
    const byNum = new Map(pages.map((p) => [p.pageNum, p]));
    sequence = order.map((n) => byNum.get(n)).filter((p): p is PageResult => Boolean(p));
  } else {
    sequence = [...pages].sort((a, b) => a.pageNum - b.pageNum);
  }
  return sequence.filter((p) => p.status !== 'error');
}
