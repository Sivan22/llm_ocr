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
import { Textarea } from './ui/textarea';

const MODES: FixMode[] = ['general', 'headers', 'punctuation', 'custom'];
const MODE_LABEL: Record<FixMode, string> = {
  general: 'General',
  headers: 'Headers',
  punctuation: 'Punctuation',
  custom: 'Custom',
};

export function FixPanel() {
  const { settings } = useSettings();
  const { loadedDoc, fileHash, currentPageNum, pages, setPage } = useProject();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [prompt, setPrompt] = useState<string>(() => settings.prompts.general);

  useEffect(() => {
    setCorrections([]);
    setStatus('');
  }, [currentPageNum]);

  const page = pages.find((p) => p.pageNum === currentPageNum);

  const loadTemplate = (mode: FixMode) => {
    setPrompt(settings.prompts[mode]);
    setStatus(`Loaded "${MODE_LABEL[mode]}" template.`);
  };

  const run = async () => {
    if (!loadedDoc || !page) return;
    if (!page.text.trim()) {
      setStatus('No text on this page yet — OCR it first.');
      return;
    }
    if (!prompt.trim()) {
      setStatus('Prompt is empty.');
      return;
    }
    setRunning(true);
    setStatus('Running…');
    try {
      const model = createModel(settings);
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      const filled = substitute(prompt, { text: page.text });
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
      <div>
        <div className="text-xs text-gray-500 mb-1">Load template:</div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <Button
              key={m}
              onClick={() => loadTemplate(m)}
              variant="outline"
              className="text-xs h-7 px-2"
              disabled={running || (m === 'custom' && !settings.prompts.custom.trim())}
            >
              {MODE_LABEL[m]}
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        placeholder="Write your correction prompt here. Use {text} for the current page text."
      />
      <Button onClick={run} disabled={running || !prompt.trim()} className="text-xs">
        {running ? 'Running…' : 'Run'}
      </Button>
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
