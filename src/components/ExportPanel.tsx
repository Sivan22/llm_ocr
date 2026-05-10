import { useMemo, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { joinPages } from '../docx/markdown';
import { mdToDocxBlob, downloadBlob } from '../docx/export';
import { Button } from './ui/button';

export function ExportPanel() {
  const { pages, fileName } = useProject();
  const md = useMemo(() => joinPages(pages), [pages]);
  const [busy, setBusy] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    try {
      const blob = await mdToDocxBlob(md);
      const stem = fileName.replace(/\.[^.]+$/, '') || 'ocr';
      downloadBlob(blob, `${stem}_ocr.docx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={onDownload} disabled={!md || busy}>
        {busy ? 'Building DOCX…' : 'Download .docx'}
      </Button>
      <div>
        <h3 className="font-bold mb-1">Markdown preview</h3>
        <pre dir="rtl" className="border rounded p-2 max-h-[60vh] overflow-auto whitespace-pre-wrap font-serif text-sm bg-gray-50">
          {md || '(no OCR\'d pages yet)'}
        </pre>
      </div>
    </div>
  );
}
