import {
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from 'docx';
import { marked, type Token, type Tokens } from 'marked';
import { parsePageFootnotes, FOOTNOTE_MARKER } from './markdown';

type ParagraphChild = TextRun | FootnoteReferenceRun;

interface RenderContext {
  nextFootnoteId: number;
  totalFootnotes: number;
}

export async function mdToDocxBlob(md: string): Promise<Blob> {
  const { body, footnotes } = parsePageFootnotes(md);
  const ctx: RenderContext = { nextFootnoteId: 1, totalFootnotes: footnotes.length };
  const tokens = marked.lexer(body);
  const children: Paragraph[] = [];

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const heading = tok as Tokens.Heading;
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          heading: headingLevelFor(heading.depth),
          children: inlineRuns(
            heading.tokens ?? [{ type: 'text', text: heading.text, raw: heading.text } as Token],
            ctx,
          ),
        }),
      );
    } else if (tok.type === 'paragraph') {
      const para = tok as Tokens.Paragraph;
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: inlineRuns(para.tokens ?? [], ctx),
        }),
      );
    } else if (tok.type === 'space') {
      // skip
    } else if ('text' in tok && typeof (tok as { text?: unknown }).text === 'string') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: textWithFootnotes(decodeEntities((tok as { text: string }).text), false, false, ctx),
        }),
      );
    }
  }

  const footnotesMap: Record<string, { children: Paragraph[] }> = {};
  footnotes.forEach((note, idx) => {
    footnotesMap[String(idx + 1)] = {
      children: [
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: [new TextRun({ text: decodeEntities(note), rightToLeft: true })],
        }),
      ],
    };
  });

  const doc = new Document({
    sections: [{ children }],
    footnotes: footnotes.length > 0 ? footnotesMap : undefined,
  });
  return Packer.toBlob(doc);
}

function headingLevelFor(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (depth) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    case 4: return HeadingLevel.HEADING_4;
    case 5: return HeadingLevel.HEADING_5;
    default: return HeadingLevel.HEADING_6;
  }
}

function inlineRuns(tokens: Token[], ctx: RenderContext): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  for (const t of tokens) {
    runs.push(...runsForToken(t, false, false, ctx));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '', rightToLeft: true }));
  return runs;
}

function runsForToken(t: Token, bold: boolean, italic: boolean, ctx: RenderContext): ParagraphChild[] {
  if (t.type === 'text') {
    return textWithFootnotes(decodeEntities((t as Tokens.Text).text), bold, italic, ctx);
  }
  if (t.type === 'strong') {
    const inner = (t as Tokens.Strong).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, true, italic, ctx));
  }
  if (t.type === 'em') {
    const inner = (t as Tokens.Em).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, bold, true, ctx));
  }
  if (t.type === 'codespan') {
    return textWithFootnotes(decodeEntities((t as Tokens.Codespan).text), bold, italic, ctx);
  }
  if (t.type === 'br') {
    return [new TextRun({ text: '', break: 1 })];
  }
  if ('raw' in t && typeof (t as { raw?: unknown }).raw === 'string') {
    return textWithFootnotes(decodeEntities((t as { raw: string }).raw), bold, italic, ctx);
  }
  return [];
}

function textWithFootnotes(text: string, bold: boolean, italic: boolean, ctx: RenderContext): ParagraphChild[] {
  if (!text) return [];
  const runs: ParagraphChild[] = [];
  let i = 0;
  while (i < text.length) {
    const next = text.indexOf(FOOTNOTE_MARKER, i);
    if (next === -1) {
      runs.push(makeTextRun(text.slice(i), bold, italic));
      break;
    }
    if (next > i) runs.push(makeTextRun(text.slice(i, next), bold, italic));
    if (ctx.nextFootnoteId <= ctx.totalFootnotes) {
      runs.push(new FootnoteReferenceRun(ctx.nextFootnoteId));
      ctx.nextFootnoteId += 1;
    } else {
      runs.push(makeTextRun(FOOTNOTE_MARKER, bold, italic));
    }
    i = next + FOOTNOTE_MARKER.length;
  }
  return runs;
}

function makeTextRun(text: string, bold: boolean, italic: boolean): TextRun {
  return new TextRun({ text, bold: bold || undefined, italics: italic || undefined, rightToLeft: true });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
