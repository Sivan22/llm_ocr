export type Lang = 'en' | 'he';

export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  he: 'עברית',
};

type Dict = Record<string, string>;

const en: Dict = {
  // App shell
  'app.title': 'LLM OCR — Jewish Texts',
  'tabs.ocr': 'OCR',
  'tabs.editor': 'Editor',
  'tabs.export': 'Export',
  'tabs.jobs': 'Jobs',

  // CostSummary
  'cost.estimated': 'Estimated: {in} in / {out} out tokens — ${cost}',
  'cost.subscription': 'Tokens: {in} in / {out} out — billed to your Claude subscription',

  // SettingsPanel
  'settings.provider': 'Provider',
  'settings.model': 'Model',
  'settings.apiKey': 'API Key — {provider}',
  'settings.getKey': 'Get a key ↗',
  'settings.apiKeyPlaceholder': 'paste your key here',
  'settings.apiKeyNote': "Stored in your browser's localStorage only. Never sent to a server.",
  'settings.batchSize': 'Batch Size — {n} pages in parallel',
  'settings.ocrPrompt': 'OCR Prompt',
  'settings.ocrPromptHint': 'Instructions sent to the model for transcribing each page image to text.',
  'settings.reset': 'Reset all settings to defaults',
  'settings.serverManaged': 'Keys are held by the server at {url} — nothing is stored in this browser.',
  'settings.serverOffline': 'Server not reachable at {url}. Using in-browser calls with your own key.',
  'settings.serverRetry': 'Retry connection',
  'settings.routeUnavailable': 'The saved provider is not available on this server; switched to {route}.',

  'route.anthropic': 'Anthropic',
  'route.google': 'Google',
  'route.openai': 'OpenAI',
  'route.gateway': 'Vercel AI Gateway',
  'route.claude-cli': 'Claude CLI (local subscription)',

  // FileDrop
  'file.errorMixed': 'Drop one PDF, one or more images, or a PDF plus images.',

  // DropZone
  'drop.empty.title': 'Drop a PDF or images here',
  'drop.empty.hint': 'or click anywhere to choose · PDF, PNG, JPG, WEBP — multi-file OK',
  'drop.loaded.summary.pages': '{pages} pages',
  'drop.loaded.summary.done': '{n} done',
  'drop.loaded.summary.todo': '{n} to do',
  'drop.loaded.summary.error': '{n} error',
  'drop.loaded.appendHint': 'Drop or click to add more',
  'drop.loaded.startOver': 'Start over',
  'drop.disabledForStoredJob': 'Drop disabled — a saved job is open',

  // SettingsToggle
  'settings.toggle': 'Settings',

  // BatchRunner
  'batch.run': 'Run',
  'batch.runSelected': 'Run {n} selected',
  'batch.clearSelectedN': 'Deselect {n}',
  'batch.stop': 'Stop',
  'batch.selectAll': 'All ({n})',
  'batch.selectPending': 'Pending ({n})',
  'batch.selectFailed': 'Failed ({n})',
  'batch.runPages': 'Pages',
  'batch.range.placeholder': 'e.g. 1-3, 5, 7-9',
  'batch.range.invalid': "Can't parse range",
  'batch.clearSelection': 'Clear selection',
  'batch.highlightInPreview': 'Highlight in preview',
  'batch.selectedBar': '{n} pages selected',
  'batch.showLog': 'Show log ({n})',
  'batch.hideLog': 'Hide log ({n})',
  'batch.errorPrefix': 'ERROR: {msg}',
  'batch.pageOk': 'Page {n} OK ({chars} chars)',
  'batch.pageFailed': 'Page {n} FAILED: {err}',
  'batch.apiKeyMissing': 'Add your {provider} API key in Settings to enable runs.',
  'batch.routeNotOnServer': 'The server has no {provider} configured. Pick another provider in Settings.',
  'batch.serverRequired': '{provider} only runs through the server, which is not reachable. Pick another provider in Settings.',

  // PageList / PageThumbs
  'pages.status.pending': 'pending',
  'pages.status.running': 'running',
  'pages.status.ok': 'ok',
  'pages.status.error': 'error',
  'pages.status.edited': 'edited',

  // PageThumbs view modes
  'view.grid': 'Grid',
  'view.compact': 'Compact',
  'view.list': 'List',

  // PageThumb
  'thumb.placeholderTooltip': 'Page image not stored',
  'thumb.remove': 'Remove page',

  // EditorView
  'editor.loadFirst': 'Load a file first.',
  'editor.page': 'Page {n} / {total}',
  'editor.ocrPage': 'OCR page',
  'editor.showPrompt': '▾ prompt',
  'editor.hidePrompt': '▴ prompt',
  'editor.confirmOverwrite': 'Re-run OCR will replace the current text. Continue?',
  'editor.ocrRunning': 'Running OCR…',
  'editor.ocrError': 'OCR error: {msg}',

  // OcrTextarea / InlineDiffEditor
  'ocr.notYet': '(not yet OCR\'d)',
  'ocr.pageStatus': 'Page {n} — {chars} chars — {status}',
  'ocr.pageStatusDiff': 'Page {n} — {chars} chars — {status} — diff view',

  // PageImage
  'image.rendering': 'Rendering page…',
  'image.notStored': 'Page image not stored — open the original file to view it.',
  'image.zoomIn': 'Zoom in',
  'image.zoomOut': 'Zoom out',
  'image.reset': 'Reset',
  'image.fit': 'Fit width',
  'image.fill': 'Fit page',
  'image.prevPage': 'Previous page',
  'image.nextPage': 'Next page',

  // PromptEditor
  'prompt.useFor': 'Use {placeholder} for current page text',

  // FixPanel
  'fix.title': 'AI Correction',
  'fix.loadTemplate': 'Load template:',
  'fix.loadedTemplate': 'Loaded "{name}" template.',
  'fix.run': 'Run',
  'fix.running': 'Running…',
  'fix.noText': 'No text on this page yet — OCR it first.',
  'fix.emptyPrompt': 'Prompt is empty.',
  'fix.runningStatus': 'Running…',
  'fix.noCorrections': 'No corrections found.',
  'fix.foundN': 'Found {n} correction(s).',
  'fix.error': 'Error: {msg}',
  'fix.acceptAll': 'Accept All',
  'fix.rejectAll': 'Reject All',
  'fix.restoreAll': 'Restore All',
  'fix.accept': 'Accept',
  'fix.reject': 'Reject',
  'fix.restore': 'Restore',
  'fix.remove': 'Remove',
  'fix.accepted': 'Accepted',
  'fix.rejected': 'Rejected',
  'fix.cannotRestore': 'Text changed — cannot restore',
  'fix.textChanged': 'text changed',
  'fix.noLongerMatches': '{reason} (no longer matches)',
  'fix.promptPlaceholder': 'Write your correction prompt here. Use {text} for the current page text.',
  'fix.editPrompt': 'Edit prompt',

  'mode.general': 'General',
  'mode.headers': 'Headers',
  'mode.punctuation': 'Punctuation',
  'mode.custom': 'Custom',

  // ExportPanel
  'export.building': 'Building DOCX…',
  'export.download': 'Download .docx',
  'export.download_md': 'Download .md',
  'export.preview_word': 'Word',
  'export.preview_markdown': 'Markdown',
  'export.rendering': 'Rendering preview…',
  'export.preview_error': "Couldn't render preview. The .docx download still works.",
  'export.toc': 'Contents',
  'export.empty': '(no OCR\'d pages yet)',

  // JobsList
  'jobs.empty': 'No saved jobs yet.',
  'jobs.file': 'File',
  'jobs.pages': 'Pages',
  'jobs.status': 'Status',
  'jobs.lastOpened': 'Last opened',
  'jobs.actions': 'Actions',
  'jobs.reload': 'Reload',
  'jobs.delete': 'Delete',
  'jobs.confirmDelete': 'Delete saved job for "{name}"? Text, corrections, and page images for this file will be removed from your browser.',
  'jobs.privacyNote': 'Saved in your browser only — clear browser data to remove.',
  'jobs.statusSummary': '{ok} ok · {edited} edited · {error} error · {pending} pending',
  'jobs.reloadFailed': 'Reload failed: {msg}',

  // ErrorBoundary
  'error.title': 'Something went wrong',
  'error.reload': 'Reload',

  // Footer
  'footer.github': 'GitHub repository',
  'footer.madeWith': 'Made with',
  'footer.author': 'by Sivan Ratson',

  // MugahPromo
  'mugah.brand': 'Mugah',
  'mugah.tagline': 'Proofreading for Word',
  'mugah.aria': 'Try Mugah — Torah proofreading add-in for Word',
};

const he: Dict = {
  // App shell
  'app.title': 'OCR תורני מתקדם',
  'tabs.ocr': 'OCR',
  'tabs.editor': 'עריכה',
  'tabs.export': 'ייצוא',
  'tabs.jobs': 'עבודות',

  // CostSummary
  'cost.estimated': 'הערכה: {in} כניסה / {out} יציאה טוקנים — ${cost}',
  'cost.subscription': 'טוקנים: {in} נכנס / {out} יוצא — נזקף למנוי Claude שלך',

  // SettingsPanel
  'settings.provider': 'ספק',
  'settings.model': 'מודל',
  'settings.apiKey': 'מפתח API — {provider}',
  'settings.getKey': 'קבל מפתח ↗',
  'settings.apiKeyPlaceholder': 'הדבק את המפתח כאן',
  'settings.apiKeyNote': 'נשמר רק ב-localStorage של הדפדפן שלך. לא נשלח לשרת.',
  'settings.batchSize': 'גודל אצווה — {n} עמודים במקביל',
  'settings.ocrPrompt': 'פרומפט OCR',
  'settings.ocrPromptHint': 'שנה את ההנחיות בהתאם לצורך, הנחיות מדוייקות יניבו תוצאות טובות יותר.',
  'settings.reset': 'אפס את כל ההגדרות לברירת מחדל',
  'settings.serverManaged': 'המפתחות נשמרים בשרת בכתובת {url} — דבר אינו נשמר בדפדפן זה.',
  'settings.serverOffline': 'השרת בכתובת {url} אינו זמין. הקריאות מתבצעות מהדפדפן עם המפתח שלך.',
  'settings.serverRetry': 'נסה להתחבר שוב',
  'settings.routeUnavailable': 'הספק השמור אינו זמין בשרת זה; הוחלף ל-{route}.',

  'route.anthropic': 'Anthropic',
  'route.google': 'Google',
  'route.openai': 'OpenAI',
  'route.gateway': 'Vercel AI Gateway',
  'route.claude-cli': 'Claude CLI (מנוי מקומי)',

  // FileDrop
  'file.errorMixed': 'גרור PDF אחד, תמונה אחת או יותר, או PDF יחד עם תמונות.',

  // DropZone
  'drop.empty.title': 'גרור לכאן PDF או תמונות',
  'drop.empty.hint': 'או לחץ בכל מקום לבחירה · PDF, PNG, JPG, WEBP — ניתן להעלות מספר קבצים',
  'drop.loaded.summary.pages': '{pages} עמודים',
  'drop.loaded.summary.done': '{n} הושלמו',
  'drop.loaded.summary.todo': '{n} ממתינים',
  'drop.loaded.summary.error': '{n} שגיאות',
  'drop.loaded.appendHint': 'גרור או לחץ להוספה',
  'drop.loaded.startOver': 'התחל מחדש',
  'drop.disabledForStoredJob': 'גרירה לא זמינה — פתוחה עבודה שמורה',

  // SettingsToggle
  'settings.toggle': 'הגדרות',

  // BatchRunner
  'batch.run': 'הפעל',
  'batch.runSelected': 'הפעל {n} נבחרים',
  'batch.clearSelectedN': 'בטל בחירה ({n})',
  'batch.stop': 'עצור',
  'batch.selectAll': 'הכל ({n})',
  'batch.selectPending': 'ממתינים ({n})',
  'batch.selectFailed': 'נכשלו ({n})',
  'batch.runPages': 'עמודים',
  'batch.range.placeholder': 'למשל 1-3, 5, 7-9',
  'batch.range.invalid': 'לא ניתן לפענח את הטווח',
  'batch.clearSelection': 'נקה בחירה',
  'batch.highlightInPreview': 'סמן בתצוגה',
  'batch.selectedBar': '{n} עמודים נבחרו',
  'batch.showLog': 'הצג יומן ({n})',
  'batch.hideLog': 'הסתר יומן ({n})',
  'batch.errorPrefix': 'שגיאה: {msg}',
  'batch.pageOk': 'עמוד {n} הושלם ({chars} תווים)',
  'batch.pageFailed': 'עמוד {n} נכשל: {err}',
  'batch.apiKeyMissing': 'הוסף מפתח API של {provider} בהגדרות כדי להפעיל.',
  'batch.routeNotOnServer': 'בשרת לא מוגדר {provider}. בחר ספק אחר בהגדרות.',
  'batch.serverRequired': '{provider} פועל רק דרך השרת, והשרת אינו זמין. בחר ספק אחר בהגדרות.',

  // PageList / PageThumbs
  'pages.status.pending': 'ממתין',
  'pages.status.running': 'רץ',
  'pages.status.ok': 'הושלם',
  'pages.status.error': 'שגיאה',
  'pages.status.edited': 'נערך',

  // PageThumbs view modes
  'view.grid': 'רשת',
  'view.compact': 'רשת צפופה',
  'view.list': 'רשימה',

  // PageThumb
  'thumb.placeholderTooltip': 'תמונת העמוד לא נשמרה',
  'thumb.remove': 'הסר עמוד',

  // EditorView
  'editor.loadFirst': 'טען קובץ קודם.',
  'editor.page': 'עמוד {n} / {total}',
  'editor.ocrPage': 'בצע OCR לעמוד',
  'editor.showPrompt': '▾ פרומפט',
  'editor.hidePrompt': '▴ פרומפט',
  'editor.confirmOverwrite': 'הפעלת OCR מחדש תחליף את הטקסט הקיים. להמשיך?',
  'editor.ocrRunning': 'מבצע OCR…',
  'editor.ocrError': 'שגיאת OCR: {msg}',

  // OcrTextarea / InlineDiffEditor
  'ocr.notYet': '(עדיין לא בוצע OCR)',
  'ocr.pageStatus': 'עמוד {n} — {chars} תווים — {status}',
  'ocr.pageStatusDiff': 'עמוד {n} — {chars} תווים — {status} — תצוגת השוואה',

  // PageImage
  'image.rendering': 'מעבד עמוד…',
  'image.notStored': 'תמונת העמוד לא נשמרה — פתח את הקובץ המקורי כדי להציג.',
  'image.zoomIn': 'הגדל',
  'image.zoomOut': 'הקטן',
  'image.reset': 'איפוס',
  'image.fit': 'התאם לרוחב',
  'image.fill': 'מלא',
  'image.prevPage': 'עמוד קודם',
  'image.nextPage': 'עמוד הבא',

  // PromptEditor
  'prompt.useFor': 'השתמש ב-{placeholder} לטקסט העמוד הנוכחי',

  // FixPanel
  'fix.title': 'הגהה אוטומטית',
  'fix.loadTemplate': 'טען תבנית:',
  'fix.loadedTemplate': 'תבנית "{name}" נטענה.',
  'fix.run': 'הפעל',
  'fix.running': 'רץ…',
  'fix.noText': 'אין טקסט בעמוד זה — בצע OCR קודם.',
  'fix.emptyPrompt': 'הפרומפט ריק.',
  'fix.runningStatus': 'רץ…',
  'fix.noCorrections': 'לא נמצאו תיקונים.',
  'fix.foundN': 'נמצאו {n} תיקונים.',
  'fix.error': 'שגיאה: {msg}',
  'fix.acceptAll': 'קבל הכל',
  'fix.rejectAll': 'דחה הכל',
  'fix.restoreAll': 'שחזר הכל',
  'fix.accept': 'קבל',
  'fix.reject': 'דחה',
  'fix.restore': 'שחזר',
  'fix.remove': 'הסר',
  'fix.accepted': 'התקבל',
  'fix.rejected': 'נדחה',
  'fix.cannotRestore': 'הטקסט שונה — לא ניתן לשחזר',
  'fix.textChanged': 'הטקסט שונה',
  'fix.noLongerMatches': '{reason} (כבר לא תואם)',
  'fix.promptPlaceholder': 'כתוב כאן את פרומפט התיקון. השתמש ב-{text} לטקסט העמוד הנוכחי.',
  'fix.editPrompt': 'ערוך פרומפט',

  'mode.general': 'כללי',
  'mode.headers': 'כותרות',
  'mode.punctuation': 'פיסוק',
  'mode.custom': 'מותאם',

  // ExportPanel
  'export.building': 'בונה DOCX…',
  'export.download': 'הורד .docx',
  'export.download_md': 'הורד .md',
  'export.preview_word': 'Word',
  'export.preview_markdown': 'Markdown',
  'export.rendering': 'מציג תצוגה מקדימה…',
  'export.preview_error': 'לא ניתן להציג תצוגה מקדימה. הורדת ה-.docx עדיין פועלת.',
  'export.toc': 'תוכן עניינים',
  'export.empty': '(אין עדיין עמודים שעברו OCR)',

  // JobsList
  'jobs.empty': 'אין עבודות שמורות עדיין.',
  'jobs.file': 'קובץ',
  'jobs.pages': 'עמודים',
  'jobs.status': 'מצב',
  'jobs.lastOpened': 'נפתח לאחרונה',
  'jobs.actions': 'פעולות',
  'jobs.reload': 'טען מחדש',
  'jobs.delete': 'מחק',
  'jobs.confirmDelete': 'למחוק את העבודה השמורה של "{name}"? טקסט, תיקונים ותמונות עמודים של קובץ זה יוסרו מהדפדפן.',
  'jobs.privacyNote': 'נשמר בדפדפן בלבד — נקה נתוני אתר להסרה.',
  'jobs.statusSummary': '{ok} הצלחות · {edited} נערכו · {error} שגיאות · {pending} ממתינים',
  'jobs.reloadFailed': 'הטעינה נכשלה: {msg}',

  // ErrorBoundary
  'error.title': 'משהו השתבש',
  'error.reload': 'טען מחדש',

  // Footer
  'footer.github': 'מאגר GitHub',
  'footer.madeWith': 'נוצר באהבה',
  'footer.author': 'על ידי סיון רצון',

  // MugahPromo
  'mugah.brand': 'מוגה',
  'mugah.tagline': 'הגהה לוורד',
  'mugah.aria': 'נסה את מוגה — תוסף הגהה תורנית לוורד',
};

export const TRANSLATIONS: Record<Lang, Dict> = { en, he };

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
  let template = dict[key] ?? TRANSLATIONS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}
