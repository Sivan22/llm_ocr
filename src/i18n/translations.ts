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
  'tabs.history': 'History',

  // CostSummary
  'cost.estimated': 'Estimated: {in} in / {out} out tokens — ${cost}',

  // SettingsPanel
  'settings.provider': 'Provider',
  'settings.model': 'Model',
  'settings.apiKey': 'API Key — {provider}',
  'settings.getKey': 'Get a key ↗',
  'settings.apiKeyPlaceholder': 'paste your key here',
  'settings.apiKeyNote': "Stored in your browser's localStorage only. Never sent to a server.",
  'settings.batchSize': 'Batch Size — {n} pages in parallel',
  'settings.ocrPrompt': 'OCR Prompt',
  'settings.correctionNote':
    'Correction prompts (general / headers / punctuation / custom) are loaded as templates from the Editor tab.',
  'settings.reset': 'Reset all settings to defaults',

  'route.anthropic': 'Anthropic',
  'route.google': 'Google',
  'route.openai': 'OpenAI',
  'route.gateway': 'Vercel AI Gateway',

  // FileDrop
  'file.dropHint': 'Drop a PDF or images here',
  'file.formatHint': 'PDF, PNG, JPG, WEBP — multi-file OK',
  'file.choose': 'Choose files',
  'file.loaded': 'Loaded: {name} ({n} pages)',
  'file.errorMixed': 'Drop one PDF, one or more images, or a PDF plus images.',

  // BatchRunner
  'batch.startAll': 'Start all pending ({n})',
  'batch.stop': 'Stop',
  'batch.retryFailed': 'Retry Failed ({n})',
  'batch.runPages': 'Run pages',
  'batch.to': 'to',
  'batch.runRange': 'Run range',
  'batch.selected': '{n} page(s) selected',
  'batch.runSelected': 'Run selected',
  'batch.clearSelection': 'Clear selection',
  'batch.showLog': 'Show log ({n})',
  'batch.hideLog': 'Hide log ({n})',
  'batch.errorPrefix': 'ERROR: {msg}',
  'batch.errorRange': 'ERROR: invalid range {from}-{to}',
  'batch.pageOk': 'Page {n} OK ({chars} chars)',
  'batch.pageFailed': 'Page {n} FAILED: {err}',

  // PageList
  'pages.selectHint': 'Click a chip to add/remove it from the run selection.',
  'pages.status.pending': 'pending',
  'pages.status.running': 'running',
  'pages.status.ok': 'ok',
  'pages.status.error': 'error',
  'pages.status.edited': 'edited',

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
  'image.zoomIn': 'Zoom in',
  'image.zoomOut': 'Zoom out',
  'image.reset': 'Reset',
  'image.fit': 'Fit width',

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
  'fix.accepted': 'Accepted',
  'fix.rejected': 'Rejected',
  'fix.cannotRestore': 'Text changed — cannot restore',
  'fix.textChanged': 'text changed',
  'fix.noLongerMatches': '{reason} (no longer matches)',
  'fix.promptPlaceholder': 'Write your correction prompt here. Use {text} for the current page text.',

  'mode.general': 'General',
  'mode.headers': 'Headers',
  'mode.punctuation': 'Punctuation',
  'mode.custom': 'Custom',

  // ExportPanel
  'export.building': 'Building DOCX…',
  'export.download': 'Download .docx',
  'export.preview': 'Markdown preview',
  'export.empty': '(no OCR\'d pages yet)',

  // RunHistory
  'history.empty': 'No runs yet.',
  'history.when': 'When',
  'history.file': 'File',
  'history.model': 'Model',
  'history.okFail': 'OK / Fail',
  'history.cost': 'Cost',

  // ErrorBoundary
  'error.title': 'Something went wrong',
  'error.reload': 'Reload',

  // Footer
  'footer.github': 'GitHub repository',
  'footer.madeWith': 'Made with',
  'footer.author': 'by Sivan Ratson',
};

const he: Dict = {
  // App shell
  'app.title': 'OCR בינה מלאכותית — טקסטים יהודיים',
  'tabs.ocr': 'OCR',
  'tabs.editor': 'עריכה',
  'tabs.export': 'ייצוא',
  'tabs.history': 'היסטוריה',

  // CostSummary
  'cost.estimated': 'הערכה: {in} כניסה / {out} יציאה טוקנים — ${cost}',

  // SettingsPanel
  'settings.provider': 'ספק',
  'settings.model': 'מודל',
  'settings.apiKey': 'מפתח API — {provider}',
  'settings.getKey': 'קבל מפתח ↗',
  'settings.apiKeyPlaceholder': 'הדבק את המפתח כאן',
  'settings.apiKeyNote': 'נשמר רק ב-localStorage של הדפדפן שלך. לא נשלח לשרת.',
  'settings.batchSize': 'גודל אצווה — {n} עמודים במקביל',
  'settings.ocrPrompt': 'פרומפט OCR',
  'settings.correctionNote':
    'פרומפטי תיקון (כללי / כותרות / פיסוק / מותאם) נטענים כתבניות מטאב העריכה.',
  'settings.reset': 'אפס את כל ההגדרות לברירת מחדל',

  'route.anthropic': 'Anthropic',
  'route.google': 'Google',
  'route.openai': 'OpenAI',
  'route.gateway': 'Vercel AI Gateway',

  // FileDrop
  'file.dropHint': 'גרור לכאן PDF או תמונות',
  'file.formatHint': 'PDF, PNG, JPG, WEBP — ניתן להעלות מספר קבצים',
  'file.choose': 'בחר קבצים',
  'file.loaded': 'נטען: {name} ({n} עמודים)',
  'file.errorMixed': 'גרור PDF אחד, תמונה אחת או יותר, או PDF יחד עם תמונות.',

  // BatchRunner
  'batch.startAll': 'הפעל את כל הממתינים ({n})',
  'batch.stop': 'עצור',
  'batch.retryFailed': 'נסה שוב כשלים ({n})',
  'batch.runPages': 'הפעל עמודים',
  'batch.to': 'עד',
  'batch.runRange': 'הפעל טווח',
  'batch.selected': '{n} עמודים נבחרו',
  'batch.runSelected': 'הפעל נבחרים',
  'batch.clearSelection': 'נקה בחירה',
  'batch.showLog': 'הצג יומן ({n})',
  'batch.hideLog': 'הסתר יומן ({n})',
  'batch.errorPrefix': 'שגיאה: {msg}',
  'batch.errorRange': 'שגיאה: טווח לא תקין {from}-{to}',
  'batch.pageOk': 'עמוד {n} הושלם ({chars} תווים)',
  'batch.pageFailed': 'עמוד {n} נכשל: {err}',

  // PageList
  'pages.selectHint': 'לחץ על תווית כדי להוסיף או להסיר אותה מבחירת ההפעלה.',
  'pages.status.pending': 'ממתין',
  'pages.status.running': 'רץ',
  'pages.status.ok': 'הושלם',
  'pages.status.error': 'שגיאה',
  'pages.status.edited': 'נערך',

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
  'image.zoomIn': 'הגדל',
  'image.zoomOut': 'הקטן',
  'image.reset': 'איפוס',
  'image.fit': 'התאם לרוחב',

  // PromptEditor
  'prompt.useFor': 'השתמש ב-{placeholder} לטקסט העמוד הנוכחי',

  // FixPanel
  'fix.title': 'תיקון בינה מלאכותית',
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
  'fix.acceptAll': 'אשר הכל',
  'fix.rejectAll': 'דחה הכל',
  'fix.restoreAll': 'שחזר הכל',
  'fix.accept': 'אשר',
  'fix.reject': 'דחה',
  'fix.restore': 'שחזר',
  'fix.accepted': 'אושר',
  'fix.rejected': 'נדחה',
  'fix.cannotRestore': 'הטקסט שונה — לא ניתן לשחזר',
  'fix.textChanged': 'הטקסט שונה',
  'fix.noLongerMatches': '{reason} (כבר לא תואם)',
  'fix.promptPlaceholder': 'כתוב כאן את פרומפט התיקון. השתמש ב-{text} לטקסט העמוד הנוכחי.',

  'mode.general': 'כללי',
  'mode.headers': 'כותרות',
  'mode.punctuation': 'פיסוק',
  'mode.custom': 'מותאם',

  // ExportPanel
  'export.building': 'בונה DOCX…',
  'export.download': 'הורד .docx',
  'export.preview': 'תצוגה מקדימה של Markdown',
  'export.empty': '(אין עדיין עמודים שעברו OCR)',

  // RunHistory
  'history.empty': 'אין עדיין הפעלות.',
  'history.when': 'מתי',
  'history.file': 'קובץ',
  'history.model': 'מודל',
  'history.okFail': 'הצלחה / כישלון',
  'history.cost': 'עלות',

  // ErrorBoundary
  'error.title': 'משהו השתבש',
  'error.reload': 'טען מחדש',

  // Footer
  'footer.github': 'מאגר GitHub',
  'footer.madeWith': 'נוצר באהבה',
  'footer.author': 'על ידי סיון רצון',
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
