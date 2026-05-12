import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
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

export function FixPanel() {
  const { settings } = useSettings();
  const { t } = useI18n();
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
    setStatus(t('fix.loadedTemplate', { name: t(`mode.${mode}`) }));
  };

  const run = async () => {
    if (!loadedDoc || !page) return;
    if (!page.text.trim()) {
      setStatus(t('fix.noText'));
      return;
    }
    if (!prompt.trim()) {
      setStatus(t('fix.emptyPrompt'));
      return;
    }
    setRunning(true);
    setStatus(t('fix.runningStatus'));
    try {
      const model = createModel(settings);
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      const filled = substitute(prompt, { text: page.text });
      const result = await correctPage(model, img.dataUrl, filled);
      setCorrections(result);
      setStatus(result.length === 0 ? t('fix.noCorrections') : t('fix.foundN', { n: result.length }));
    } catch (e) {
      setStatus(t('fix.error', { msg: e instanceof Error ? e.message : String(e) }));
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
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'rejected', reason: t('fix.noLongerMatches', { reason: x.reason }) } : x)));
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
      if (!text.includes(c.old)) return { ...c, status: 'rejected' as const, reason: t('fix.noLongerMatches', { reason: c.reason }) };
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
      <h3 className="font-bold">{t('fix.title')}</h3>
      <div>
        <div className="text-xs text-gray-500 mb-1">{t('fix.loadTemplate')}</div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <Button
              key={m}
              onClick={() => loadTemplate(m)}
              variant="outline"
              className="text-xs h-7 px-2"
              disabled={running || (m === 'custom' && !settings.prompts.custom.trim())}
            >
              {t(`mode.${m}`)}
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        placeholder={t('fix.promptPlaceholder')}
      />
      <Button onClick={run} disabled={running || !prompt.trim()} className="text-xs">
        {running ? t('fix.running') : t('fix.run')}
      </Button>
      <p className="text-xs text-gray-600">{status}</p>
      {hasPending && (
        <div className="flex gap-2">
          <Button onClick={acceptAll} className="text-xs h-7">{t('fix.acceptAll')}</Button>
          <Button variant="outline" onClick={rejectAll} className="text-xs h-7">{t('fix.rejectAll')}</Button>
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
