import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { savePageResult } from '../store/persistence';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';

export function OcrTextarea() {
  const { pages, currentPageNum, fileHash, setPage } = useProject();
  const page = pages.find((p) => p.pageNum === currentPageNum);
  const [draft, setDraft] = useState<string>(page?.text ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(page?.text ?? '');
    setDirty(false);
  }, [currentPageNum, page?.text]);

  const save = () => {
    if (!page) return;
    const updated = { ...page, text: draft, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <Textarea
        dir="rtl"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) save(); }}
        className="flex-1 text-right font-serif text-base leading-relaxed"
        placeholder={page?.status === 'pending' ? '(not yet OCR\'d)' : ''}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-500">
          Page {currentPageNum + 1} — {draft.length} chars — {page?.status ?? '—'}
        </span>
        <Button onClick={save} disabled={!dirty}>Save Text</Button>
      </div>
    </div>
  );
}
