import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { runCorrectPage } from '../ai/dispatch';
import { useCanRun } from '../hooks/useCanRun';
import { useServerStatus } from '../store/ServerStatusContext';
import { renderPageToPng } from '../pdf/render';
import { substitute } from '../runner/prompt';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import type { FixMode } from '../lib/types';
import { DiffCard } from './DiffCard';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const MODES: FixMode[] = ['general', 'headers', 'punctuation', 'custom'];

export function FixPanel() {
  const { settings } = useSettings();
  const { t, lang } = useI18n();
  const { status: serverStatus } = useServerStatus();
  // Same server-aware gate the Run toolbar uses — see src/ai/canRun.ts.
  const { canRun, blockedMessage } = useCanRun();
  const {
    loadedDoc, fileHash, currentPageNum, pages, setPage,
    corrections, setCorrections,
  } = useProject();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [prompt, setPrompt] = useState<string>(() => settings.prompts.general);
  const [promptOpen, setPromptOpen] = useState<boolean>(() => corrections.length === 0);

  useEffect(() => {
    setStatus('');
  }, [currentPageNum]);

  const page = pages.find((p) => p.pageNum === currentPageNum);

  const loadTemplate = (mode: FixMode) => {
    if (mode === 'custom') {
      setPrompt('');
      setStatus('');
      return;
    }
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
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      savePageImage(fileHash, currentPageNum, img);
      const filled = substitute(prompt, { text: page.text });
      const { corrections: result, tokensIn, tokensOut } = await runCorrectPage({
        settings,
        serverAvailable: serverStatus.available,
        imageDataUrl: img.dataUrl,
        filledPrompt: filled,
        lang,
      });
      setCorrections((prev) => [...prev, ...result]);
      if (result.length > 0) setPromptOpen(false);
      if ((tokensIn ?? 0) > 0 || (tokensOut ?? 0) > 0) {
        const updated = {
          ...page,
          tokensIn: (page.tokensIn ?? 0) + (tokensIn ?? 0),
          tokensOut: (page.tokensOut ?? 0) + (tokensOut ?? 0),
        };
        setPage(updated);
        savePageResult(fileHash, updated);
      }
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

  const removeCorrection = (id: string) => {
    setCorrections((arr) => arr.filter((x) => x.id !== id));
  };

  const restore = (id: string) => {
    if (!page) return;
    const c = corrections.find((x) => x.id === id);
    if (!c) return;
    if (c.status === 'rejected') {
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)));
      return;
    }
    if (c.status === 'accepted') {
      if (!page.text.includes(c.new)) return;
      const updatedText = page.text.replace(c.new, c.old);
      const updated = { ...page, text: updatedText, status: 'edited' as const };
      setPage(updated);
      savePageResult(fileHash, updated);
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)));
    }
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

  const restoreAll = () => {
    if (!page) return;
    let text = page.text;
    const next = corrections.map((c) => {
      if (c.status === 'rejected') return { ...c, status: 'pending' as const };
      if (c.status === 'accepted') {
        if (!text.includes(c.new)) return c;
        text = text.replace(c.new, c.old);
        return { ...c, status: 'pending' as const };
      }
      return c;
    });
    const updated = { ...page, text, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections(next);
  };

  const hasPending = corrections.some((c) => c.status === 'pending');
  const hasResolved = corrections.some((c) => c.status !== 'pending');
  const currentPageText = page?.text ?? '';

  return (
    <div className="flex flex-col h-[70vh] space-y-2 overflow-auto">
      <h3 className="font-bold">{t('fix.title')}</h3>
      <details
        open={promptOpen}
        onToggle={(e) => setPromptOpen((e.target as HTMLDetailsElement).open)}
        className="border rounded-md"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('fix.editPrompt')}
        </summary>
        <div className="px-3 py-3 border-t space-y-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">{t('fix.loadTemplate')}</div>
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <Button
                  key={m}
                  onClick={() => loadTemplate(m)}
                  variant="outline"
                  className="text-xs h-7 px-2"
                  disabled={running}
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
          {!canRun ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button
                    disabled
                    className="text-xs pointer-events-none"
                  >
                    {running ? t('fix.running') : t('fix.run')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{blockedMessage}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={run}
              disabled={running || !prompt.trim()}
              className="text-xs"
            >
              {running ? t('fix.running') : t('fix.run')}
            </Button>
          )}
        </div>
      </details>
      {!canRun && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {blockedMessage}
        </p>
      )}
      <p className="text-xs text-gray-600">{status}</p>
      <div className="flex flex-wrap gap-2">
        {hasPending && (
          <>
            <Button onClick={acceptAll} className="text-xs h-7">{t('fix.acceptAll')}</Button>
            <Button variant="outline" onClick={rejectAll} className="text-xs h-7">{t('fix.rejectAll')}</Button>
          </>
        )}
        {hasResolved && (
          <Button variant="outline" onClick={restoreAll} className="text-xs h-7">{t('fix.restoreAll')}</Button>
        )}
      </div>
      <div className="space-y-2 flex-1 overflow-auto">
        {corrections.map((c) => (
          <DiffCard
            key={c.id}
            correction={c}
            pageText={currentPageText}
            onAccept={accept}
            onReject={reject}
            onRestore={restore}
            onDelete={removeCorrection}
          />
        ))}
      </div>
    </div>
  );
}
