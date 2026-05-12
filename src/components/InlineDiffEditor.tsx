import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { savePageResult } from '../store/persistence';
import { planInlineDiff, extractEditorText, type InlineSegment } from '../lib/inlineDiff';
import type { Correction } from '../lib/types';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const SEG_CLASS: Record<InlineSegment['kind'], string> = {
  plain: '',
  eq: '',
  del: 'bg-red-100 line-through decoration-red-500',
  ins: 'bg-green-100 text-green-800 px-0.5 mx-0.5 rounded',
  applied: 'underline decoration-green-500 decoration-2 underline-offset-2',
};

const sigOf = (text: string, cs: Correction[]) =>
  text + '|' + cs.map((c) => `${c.id}:${c.status}`).join(',');

export function InlineDiffEditor() {
  const { pages, currentPageNum, fileHash, setPage, corrections } = useProject();
  const page = pages.find((p) => p.pageNum === currentPageNum);
  const pageText = page?.text ?? '';

  const [dirty, setDirty] = useState(false);
  const [plainDraft, setPlainDraft] = useState(pageText);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastPaintedSig = useRef<string>('');

  useEffect(() => {
    setPlainDraft(pageText);
    setDirty(false);
  }, [currentPageNum, pageText]);

  const hasRelevantCorrections = corrections.some(
    (c) => c.status === 'pending' || c.status === 'accepted',
  );

  useLayoutEffect(() => {
    if (!hasRelevantCorrections || !editorRef.current) return;
    const sig = sigOf(pageText, corrections);
    if (lastPaintedSig.current === sig) return;
    const root = editorRef.current;
    root.innerHTML = '';
    const segments = planInlineDiff(pageText, corrections);
    for (const s of segments) {
      if (s.kind === 'plain') {
        root.appendChild(document.createTextNode(s.text));
        continue;
      }
      const span = document.createElement('span');
      span.dataset.kind = s.kind;
      span.dataset.cid = s.cid;
      span.className = SEG_CLASS[s.kind];
      if (s.kind === 'ins' || s.kind === 'applied') {
        span.setAttribute('contenteditable', 'false');
      }
      if (s.kind === 'ins') span.dataset.ins = 'true';
      span.textContent = s.text;
      root.appendChild(span);
    }
    lastPaintedSig.current = sig;
  }, [pageText, corrections, hasRelevantCorrections]);

  const onInput = () => {
    if (!editorRef.current) return;
    const next = extractEditorText(editorRef.current);
    lastPaintedSig.current = sigOf(next, corrections);
    setPlainDraft(next);
    setDirty(true);
  };

  const save = () => {
    if (!page) return;
    const updated = { ...page, text: plainDraft, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setDirty(false);
  };

  if (!hasRelevantCorrections) {
    return (
      <div className="flex flex-col h-[70vh]">
        <Textarea
          dir="rtl"
          value={plainDraft}
          onChange={(e) => { setPlainDraft(e.target.value); setDirty(true); }}
          onBlur={() => { if (dirty) save(); }}
          className="flex-1 text-right font-serif text-base leading-relaxed"
          placeholder={page?.status === 'pending' ? "(not yet OCR'd)" : ''}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">
            Page {currentPageNum + 1} — {plainDraft.length} chars — {page?.status ?? '—'}
          </span>
          <Button onClick={save} disabled={!dirty}>Save Text</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div
        ref={editorRef}
        dir="rtl"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={() => { if (dirty) save(); }}
        className={cn(
          'flex-1 text-right font-serif text-base leading-relaxed',
          'border rounded-md px-3 py-2 overflow-auto',
          'focus:outline-none focus:ring-2 focus:ring-blue-400',
          'whitespace-pre-wrap break-words',
        )}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-500">
          Page {currentPageNum + 1} — {plainDraft.length} chars — {page?.status ?? '—'} — diff view
        </span>
        <Button onClick={save} disabled={!dirty}>Save Text</Button>
      </div>
    </div>
  );
}
