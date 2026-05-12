import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { marked, type Token, type Tokens } from 'marked';

export async function mdToDocxBlob(md: string): Promise<Blob> {
  const tokens = marked.lexer(md);
  const children: Paragraph[] = [];

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const heading = tok as Tokens.Heading;
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          heading: headingLevelFor(heading.depth),
          children: inlineRuns(heading.tokens ?? [{ type: 'text', text: heading.text, raw: heading.text } as Token]),
        }),
      );
    } else if (tok.type === 'paragraph') {
      const para = tok as Tokens.Paragraph;
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: inlineRuns(para.tokens ?? []),
        }),
      );
    } else if (tok.type === 'space') {
      // skip
    } else if ('text' in tok && typeof (tok as any).text === 'string') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: [new TextRun({ text: decodeEntities((tok as any).text as string) })],
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
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

function inlineRuns(tokens: Token[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const t of tokens) {
    runs.push(...runsForToken(t, false));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '' }));
  return runs;
}

function runsForToken(t: Token, bold: boolean, italic: boolean = false): TextRun[] {
  if (t.type === 'text') {
    return [new TextRun({ text: decodeEntities((t as Tokens.Text).text), bold: bold || undefined, italics: italic || undefined })];
  }
  if (t.type === 'strong') {
    const inner = (t as Tokens.Strong).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, true, italic));
  }
  if (t.type === 'em') {
    const inner = (t as Tokens.Em).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, bold, true));
  }
  if (t.type === 'codespan') {
    return [new TextRun({ text: decodeEntities((t as Tokens.Codespan).text), bold: bold || undefined, italics: italic || undefined })];
  }
  if (t.type === 'br') {
    return [new TextRun({ text: '', break: 1 })];
  }
  if ('raw' in t && typeof (t as any).raw === 'string') {
    return [new TextRun({ text: decodeEntities((t as any).raw as string), bold: bold || undefined, italics: italic || undefined })];
  }
  return [];
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
