import type { Settings } from '../lib/types';

const STORAGE_KEY = 'llm_ocr_web:settings:v1';

const DEFAULT_OCR_PROMPT =
  "OCR this, this is an old jewish Chassidus book written in old Rashi script. " +
  "it has two columns, RTL. first read the right column, then the left one. " +
  "provide all the text ברצף, in the most accurate way possible." +
  "omit the page numbers and page headers, only the main text. RETURN ONLY THE RAW TEXT, DO NOT RETURN ANY EXPLANATIONS OR APOLOGIES OR ANYTHING ELSE, JUST THE RAW OCR TEXT." +
  "you can mark the inner headers (like 'פרק א') or bold words to separate them from the main text, but do not mark the page headers or page numbers. ";

const DEFAULT_GENERAL_PROMPT =
  "You are an OCR correction assistant for Hebrew text from a Chassidus book. " +
  "Compare the OCR text below with the page image and find any OCR errors: " +
  "wrong letters (ד/ר, ב/כ, etc.), missing/extra/merged/split words, " +
  "line break issues, nikud problems.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (the exact incorrect text as it appears), "new" (the corrected text), ' +
  'and "reason" (brief explanation in English). Example:\n' +
  '[{"old": "שלומ", "new": "שלום", "reason": "wrong final letter"}]\n\n' +
  "If no corrections are needed, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

const DEFAULT_HEADERS_PROMPT =
  "You are an OCR formatting assistant for Hebrew Chassidus text. " +
  "Compare the OCR text below with the page image. Identify section headers, " +
  "chapter titles (like פרק א, סימן ב), and any bold or emphasized text in the image. " +
  "For each header found, provide the raw text as 'old' and the same text wrapped " +
  "with **bold markers** as 'new'. Also split headers onto their own line if they are " +
  "merged into a paragraph.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (exact text as it appears), "new" (text with header marking/separation), ' +
  'and "reason" (e.g. "section header", "chapter title"). Example:\n' +
  '[{"old": "פרק א בענין", "new": "**פרק א**\\nבענין", "reason": "chapter title merged into text"}]\n\n' +
  "If no headers are found, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

const DEFAULT_PUNCTUATION_PROMPT =
  "You are an OCR correction assistant for Hebrew text. Focus ONLY on punctuation issues " +
  "in the OCR text below compared to the page image: wrong or missing punctuation marks, " +
  "parentheses, גרשיים (quotation marks), colons, periods, commas, etc.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (exact incorrect text), "new" (corrected text), and "reason" (what punctuation issue was found).\n' +
  "If no corrections are needed, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

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
