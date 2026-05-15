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
import { Textarea } from './ui/textarea';

export function EditorView() {
  const {
    loadedDoc, fileHash, currentPageNum,
    pages, setPage, setPageStatus, setCorrections,
  } = useProject();
  const { settings, updatePrompts } = useSettings();
  const { t } = useI18n();

  const [showPrompt, setShowPrompt] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setStatus('');
  }, [currentPageNum]);

  if (!loadedDoc) return <p className="text-gray-500">{t('editor.loadFirst')}</p>;

  const currentPage = pages.find((p) => p.pageNum === currentPageNum);

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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <PageImage />
        <InlineDiffEditor />
        <div className="md:col-span-2 xl:col-span-1">
          <FixPanel />
        </div>
      </div>
    </div>
  );
}
