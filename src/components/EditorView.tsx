import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { savePageImage } from '../store/pageImagesStore';
import { PageImage } from './PageImage';
import { InlineDiffEditor } from './InlineDiffEditor';
import { FixPanel } from './FixPanel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

export function EditorView() {
  const {
    loadedDoc, fileHash, currentPageNum, setCurrentPageNum,
    pages, pageOrder, setPage, setPageStatus, setCorrections,
  } = useProject();
  const { settings, updatePrompts } = useSettings();
  const { t, lang } = useI18n();
  const isRtl = lang === 'he';
  const prevArrow = isRtl ? '→' : '←';
  const nextArrow = isRtl ? '←' : '→';

  const total = pageOrder.length;
  const currentIdx = pageOrder.indexOf(currentPageNum);
  const displayPos = currentIdx >= 0 ? currentIdx + 1 : 0;

  const [pageInput, setPageInput] = useState(String(displayPos || 1));
  const [showPrompt, setShowPrompt] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPageInput(String(displayPos || 1));
  }, [displayPos]);

  useEffect(() => {
    setStatus('');
  }, [currentPageNum]);

  if (!loadedDoc) return <p className="text-gray-500">{t('editor.loadFirst')}</p>;

  const currentPage = pages.find((p) => p.pageNum === currentPageNum);

  const goToDisplayIdx = (idx: number) => {
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(total - 1, idx));
    setCurrentPageNum(pageOrder[clamped]);
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isFinite(parsed) && total > 0) {
      const clamped = Math.min(total, Math.max(1, parsed));
      goToDisplayIdx(clamped - 1);
      setPageInput(String(clamped));
    } else {
      setPageInput(String(displayPos || 1));
    }
  };

  const runOcr = async () => {
    if (running) return;
    const existing = currentPage?.text?.trim() ?? '';
    if (existing && !window.confirm(t('editor.confirmOverwrite'))) return;

    let model;
    try {
      model = createModel(settings);
    } catch (e) {
      setStatus(t('editor.ocrError', { msg: e instanceof Error ? e.message : String(e) }));
      return;
    }

    setRunning(true);
    setStatus(t('editor.ocrRunning'));
    setPageStatus(currentPageNum, 'running');
    try {
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      savePageImage(fileHash, currentPageNum, img);
      const r = await ocrPage(model, img.dataUrl, settings.prompts.ocr);
      const result = {
        pageNum: currentPageNum,
        text: r.text,
        status: 'ok' as const,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
      };
      setPage(result);
      savePageResult(fileHash, result);
      setCorrections([]);
      setStatus('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const result = {
        pageNum: currentPageNum,
        text: currentPage?.text ?? '',
        status: 'error' as const,
        error: msg,
      };
      setPage(result);
      savePageResult(fileHash, result);
      setStatus(t('editor.ocrError', { msg }));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" disabled={currentIdx <= 0} onClick={() => goToDisplayIdx(currentIdx - 1)}>{prevArrow}</Button>
        <div dir="ltr" className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={total}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={commitPageInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="w-20 text-center"
            aria-label={t('editor.page', { n: displayPos, total })}
          />
          <span className="text-sm text-gray-600">/ {total}</span>
        </div>
        <Button variant="outline" disabled={currentIdx < 0 || currentIdx >= total - 1} onClick={() => goToDisplayIdx(currentIdx + 1)}>{nextArrow}</Button>
        <Button onClick={runOcr} disabled={running}>
          {running ? t('editor.ocrRunning') : t('editor.ocrPage')}
        </Button>
        <Button variant="outline" onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? t('editor.hidePrompt') : t('editor.showPrompt')}
        </Button>
        {status && <span className="text-xs text-gray-600">{status}</span>}
      </div>
      {showPrompt && (
        <Textarea
          value={settings.prompts.ocr}
          onChange={(e) => updatePrompts({ ocr: e.target.value })}
          rows={5}
          className="font-mono text-sm"
          aria-label={t('settings.ocrPrompt')}
        />
      )}
      <div className="grid grid-cols-3 gap-3">
        <PageImage />
        <InlineDiffEditor />
        <FixPanel />
      </div>
    </div>
  );
}
