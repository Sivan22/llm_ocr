import type { RegionRole } from './types';

// Single-column adaptation of DEFAULT_OCR_PROMPT: no two-column ordering text,
// no footnote-block logic (footnotes are a separate crop).
export const BODY_PROMPT =
  'בצע OCR. זהו טור בודד מתוך עמוד בספר חסידות יהודי ישן שנדפס בכתב רש"י ישן. ' +
  'החזר את כל הטקסט של הטור הזה ברצף, בצורה המדויקת ביותר האפשרית. ' +
  'השמט את מספרי העמודים ואת כותרות העמוד (running headers), והחזר רק את גוף הטקסט. ' +
  'החזר אך ורק את הטקסט הגולמי, ללא הסברים, התנצלויות או כל תוספת — רק טקסט ה-OCR. ' +
  'ניתן לסמן כותרות פנימיות (כגון "פרק א") או מילים מודגשות, אך אין לסמן את כותרות העמוד או את מספרי העמודים.';

// Tuned for the dense, small footnote type at the bottom of the page.
export const FOOTNOTE_PROMPT =
  'בצע OCR. זהו בלוק של הערות שוליים בכתב קטן וצפוף מתוך ספר חסידות יהודי ישן בכתב רש"י. ' +
  'החזר את כל טקסט ההערות ברצף, בצורה המדויקת ביותר האפשרית, כל הערה בשורה חדשה. ' +
  'החזר אך ורק את הטקסט הגולמי, ללא הסברים או כל תוספת.';

export function regionPrompt(role: RegionRole): string {
  return role === 'footnotes' ? FOOTNOTE_PROMPT : BODY_PROMPT;
}

export function stitch(rightBody: string, leftBody: string, footnotes?: string): string {
  let out = [rightBody.trim(), leftBody.trim()].filter(Boolean).join('\n\n');
  const fn = footnotes?.trim();
  if (fn) out += `\n\n---\nהערות\n---\n${fn}`;
  return out;
}
