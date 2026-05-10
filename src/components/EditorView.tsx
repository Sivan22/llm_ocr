import { useProject } from '../store/ProjectContext';
import { PageImage } from './PageImage';
import { OcrTextarea } from './OcrTextarea';
import { FixPanel } from './FixPanel';
import { Button } from './ui/button';

export function EditorView() {
  const { loadedDoc, currentPageNum, setCurrentPageNum } = useProject();
  if (!loadedDoc) return <p className="text-gray-500">Load a file first.</p>;

  const last = loadedDoc.pageCount - 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={currentPageNum <= 0} onClick={() => setCurrentPageNum(currentPageNum - 1)}>←</Button>
        <span className="text-sm">Page {currentPageNum + 1} / {loadedDoc.pageCount}</span>
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
