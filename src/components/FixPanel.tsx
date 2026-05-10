import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { createModel } from '../ai/providers';
import { correctPage } from '../ai/correct';
import { renderPageToPng } from '../pdf/render';
import { substitute } from '../runner/prompt';
import { savePageResult } from '../store/persistence';
import type { Correction, FixMode } from '../lib/types';
import { DiffCard } from './DiffCard';
import { Button } from './ui/button';

const MODES: FixMode[] = ['general', 'headers', 'punctuation', 'custom'];
const MODE_LABEL: Record<FixMode, string> = {
  general: 'General Fix',
  headers: 'Fix Headers',
  punctuation: 'Fix Punctuation',
  custom: 'Custom',
};

export function FixPanel() {
  const { settings } = useSettings();
  const { loadedDoc, fileHash, currentPageNum, pages, setPage } = useProject();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { setCorrections([]); setStatus(''); }, [currentPageNum]);

  const page = pages.find((p) => p.pageNum === currentPageNum);

  const runFix = async (mode: FixMode) => {
    if (!loadedDoc || !page) return;
    if (!page.text.trim()) { setStatus('No text on this page yet — OCR it first.'); return; }
    if (mode === 'custom' && !settings.prompts.custom.trim()) {
      setStatus('Custom prompt is empty — set it in the Setup tab.'); return;
    }
    setRunning(true); setStatus(`Running ${MODE_LABEL[mode]}…`);
    try {
      const model = createModel(settings);
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      const filled = substitute(settings.prompts[mode], { text: page.text });
      const result = await correctPage(model, img.dataUrl, filled);
      setCorrections(result);
      setStatus(result.length === 0 ? 'No corrections found.' : `Found ${result.length} correction(s).`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const accept = (id: string) => {
    if (!page) return;
    const idx = corrections.findIndex((c) => c.id === id);
    if (idx < 0 || corrections[idx].status !== 'pending') return;
    const c = corrections[idx];
    const cur = page.text;
    if (!cur.includes(c.old)) {
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'rejected', reason: `${x.reason} (no longer matches)` } : x)));
      return;
    }
    const updatedText = cur.replace(c.old, c.new);
    const updated = { ...page, text: updatedText, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'accepted' } : x)));
  };

  const reject = (id: string) => {
    setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'rejected' } : x)));
  };

  const acceptAll = () => {
    if (!page) return;
    let text = page.text;
    const next = corrections.map((c) => {
      if (c.status !== 'pending') return c;
      if (!text.includes(c.old)) return { ...c, status: 'rejected' as const, reason: `${c.reason} (no longer matches)` };
      text = text.replace(c.old, c.new);
      return { ...c, status: 'accepted' as const };
    });
    const updated = { ...page, text, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections(next);
  };

  const rejectAll = () => {
    setCorrections((arr) => arr.map((c) => (c.status === 'pending' ? { ...c, status: 'rejected' } : c)));
  };

  const hasPending = corrections.some((c) => c.status === 'pending');

  return (
    <div className="flex flex-col h-[70vh] space-y-2 overflow-auto">
      <h3 className="font-bold">AI Correction</h3>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => (
          <Button key={m} onClick={() => runFix(m)} disabled={running} variant={m === 'general' ? 'default' : 'outline'} className="text-xs">
            {MODE_LABEL[m]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-gray-600">{status}</p>
      {hasPending && (
        <div className="flex gap-2">
          <Button onClick={acceptAll} className="text-xs h-7">Accept All</Button>
          <Button variant="outline" onClick={rejectAll} className="text-xs h-7">Reject All</Button>
        </div>
      )}
      <div className="space-y-2 flex-1 overflow-auto">
        {corrections.map((c) => (
          <DiffCard key={c.id} correction={c} onAccept={accept} onReject={reject} />
        ))}
      </div>
    </div>
  );
}
