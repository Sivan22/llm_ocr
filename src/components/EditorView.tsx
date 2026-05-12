import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { PageImage } from './PageImage';
import { OcrTextarea } from './OcrTextarea';
import { FixPanel } from './FixPanel';
import { Button } from './ui/button';

export function EditorView() {
  const { loadedDoc, currentPageNum, setCurrentPageNum } = useProject();
  const { t } = useI18n();
  if (!loadedDoc) return <p className="text-gray-500">{t('editor.loadFirst')}</p>;

  const last = loadedDoc.pageCount - 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={currentPageNum <= 0} onClick={() => setCurrentPageNum(currentPageNum - 1)}>←</Button>
        <span className="text-sm">{t('editor.page', { n: currentPageNum + 1, total: loadedDoc.pageCount })}</span>
        <Button variant="outline" disabled={currentPageNum >= last} onClick={() => setCurrentPageNum(currentPageNum + 1)}>→</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <PageImage />
        <OcrTextarea />
        <FixPanel />
      </div>
    </div>
  );
}
