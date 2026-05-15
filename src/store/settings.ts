import type { Settings } from '../lib/types';

const STORAGE_KEY = 'llm_ocr_web:settings:v1';

const DEFAULT_OCR_PROMPT =
  "בצע OCR. זהו ספר חסידות יהודי ישן שנדפס בכתב רש\"י ישן. " +
  "הספר בנוי בשני טורים מימין לשמאל. קרא תחילה את הטור הימני, ואחר כך את הטור השמאלי. " +
  "החזר את כל הטקסט ברצף, בצורה המדויקת ביותר האפשרית. " +
  "השמט את מספרי העמודים ואת כותרות העמוד (running headers), והחזר רק את גוף הטקסט. " +
  "החזר אך ורק את הטקסט הגולמי, ללא הסברים, התנצלויות או כל תוספת — רק טקסט ה-OCR. " +
  "ניתן לסמן כותרות פנימיות (כגון 'פרק א') או מילים מודגשות כדי להפרידן מהטקסט, אך אין לסמן את כותרות העמוד או את מספרי העמודים. " +
  "אם בעמוד מופיעות הערות שוליים (footnotes): " +
  "סמן את מקום העוגן בתוך גוף הטקסט בסימן [*]. " +
  "בסוף תוכן העמוד, לאחר שורה ריקה, הוסף את הבלוק הבא בדיוק:\n" +
  "---\n" +
  "הערות\n" +
  "---\n" +
  "ולאחריו את ההערות, כשכל הערה חדשה מתחילה בשורה חדשה עם הסימן [*] בתחילתה. " +
  "אם הערה ממשיכה מהעמוד הקודם (כלומר אין לה עוגן בעמוד הנוכחי), הוסף את המשכה כשורה ראשונה בבלוק ההערות ללא הסימן [*]. " +
  "אם אין הערות שוליים בעמוד — אל תוסיף את הבלוק כלל.";

const DEFAULT_GENERAL_PROMPT =
  "אתה עוזר לתיקון OCR של טקסט עברי מספר חסידות. " +
  "השווה את טקסט ה-OCR שלהלן לתמונת העמוד ואתר טעויות OCR: " +
  "אותיות שגויות (ד/ר, ב/כ וכדומה), מילים חסרות/מיותרות/מאוחדות/מפוצלות, " +
  "בעיות שבירת שורה ובעיות ניקוד.\n\n" +
  "טקסט OCR:\n{text}";

const DEFAULT_HEADERS_PROMPT =
  "אתה עוזר לעיצוב OCR של טקסט חסידות עברי. " +
  "השווה את טקסט ה-OCR שלהלן לתמונת העמוד. אתר כותרות סעיפים, " +
  "כותרות פרקים (כגון פרק א, סימן ב), וכל טקסט מודגש או מובלט בתמונה. " +
  "עבור כל כותרת שנמצאה, ספק את הטקסט הגולמי בשדה 'old' ואת אותו טקסט עטוף " +
  "בסימוני **bold** בשדה 'new'. כמו כן, הפרד כותרות לשורה משלהן אם הן " +
  "מאוחדות לתוך פסקה.\n\n" +
  "טקסט OCR:\n{text}";

const DEFAULT_PUNCTUATION_PROMPT =
  "אתה עוזר לתיקון OCR של טקסט עברי. התמקד אך ורק בבעיות פיסוק " +
  "בטקסט ה-OCR שלהלן בהשוואה לתמונת העמוד: סימני פיסוק שגויים או חסרים, " +
  "סוגריים, גרשיים, נקודתיים, נקודות, פסיקים וכדומה.\n\n" +
  "טקסט OCR:\n{text}";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  route: 'gateway',
  model: 'gemini-3.1-pro',
  apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
  batchSize: 8,
  prompts: {
    ocr: DEFAULT_OCR_PROMPT,
    general: DEFAULT_GENERAL_PROMPT,
    headers: DEFAULT_HEADERS_PROMPT,
    punctuation: DEFAULT_PUNCTUATION_PROMPT,
    custom: '',
  },
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const defaults = cloneDefaults();
    return {
      ...defaults,
      ...parsed,
      version: 1,
      apiKeys: { ...defaults.apiKeys, ...(parsed.apiKeys ?? {}) },
      prompts: { ...defaults.prompts, ...(parsed.prompts ?? {}) },
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / disabled storage — silently drop
  }
}

function cloneDefaults(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
