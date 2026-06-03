import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { mdToDocxBlob } from './export';

async function readDocxFile(blob: Blob, path: string): Promise<string> {
  const buf = await blobToArrayBuffer(blob);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(path);
  if (!file) throw new Error(`missing ${path} in docx`);
  return file.async('string');
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    const result = blob.arrayBuffer();
    if (result && typeof (result as Promise<ArrayBuffer>).then === 'function') {
      return result as Promise<ArrayBuffer>;
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

describe('mdToDocxBlob footnotes', () => {
  it('produces a docx without footnotes when none present', async () => {
    const blob = await mdToDocxBlob('plain body');
    const doc = await readDocxFile(blob, 'word/document.xml');
    expect(doc).toContain('plain body');
    expect(doc).not.toContain('w:footnoteReference');
  });

  it('emits a footnote reference and footnotes part when [*] markers and notes are present', async () => {
    const md = 'before [*] after\n\n---\nהערות\n---\n[*] the note';
    const blob = await mdToDocxBlob(md);
    const doc = await readDocxFile(blob, 'word/document.xml');
    expect(doc).toContain('w:footnoteReference');
    const footnotes = await readDocxFile(blob, 'word/footnotes.xml');
    expect(footnotes).toContain('the note');
  });

  it('marks paragraphs and runs as RTL for Hebrew content', async () => {
    const md = 'שלום עולם [*]\n\n---\nהערות\n---\n[*] הערה';
    const blob = await mdToDocxBlob(md);
    const doc = await readDocxFile(blob, 'word/document.xml');
    // paragraph-level bidi and run-level rtl must both be present
    expect(doc).toContain('<w:bidi');
    expect(doc).toContain('<w:rtl');
    const footnotes = await readDocxFile(blob, 'word/footnotes.xml');
    expect(footnotes).toContain('<w:rtl');
  });

  it('keeps literal [*] when no matching footnote exists', async () => {
    const md = 'body with [*] dangling marker';
    const blob = await mdToDocxBlob(md);
    const doc = await readDocxFile(blob, 'word/document.xml');
    expect(doc).toContain('[*]');
    expect(doc).not.toContain('w:footnoteReference');
  });
});
