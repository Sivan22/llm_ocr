import { generateText, type LanguageModel } from 'ai';
import type { Correction } from '../lib/types';

export type CorrectionLang = 'en' | 'he';

export function correctionSystemPrompt(lang: CorrectionLang = 'en'): string {
  const reasonClause =
    lang === 'he'
      ? '"reason" (הסבר קצר בעברית)'
      : '"reason" (brief explanation in English)';
  const example =
    lang === 'he'
      ? '[{"old": "שלומ", "new": "שלום", "reason": "אות סופית שגויה"}]'
      : '[{"old": "שלומ", "new": "שלום", "reason": "wrong final letter"}]';
  return (
    'Return ONLY a JSON array of corrections. Each correction must be an object with ' +
    '"old" (the exact incorrect text as it appears), "new" (the corrected text), and ' +
    reasonClause + '. Example:\n' +
    example + '\n\n' +
    'If no corrections are needed, return an empty array: []\n' +
    'Return ONLY the JSON array, no markdown, no explanations.'
  );
}

export function parseCorrections(raw: string): Correction[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Correction[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.old !== 'string' || typeof obj.new !== 'string') continue;
    out.push({
      id: cryptoRandomId(),
      old: obj.old,
      new: obj.new,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      status: 'pending',
    });
  }
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function correctPage(
  model: LanguageModel,
  imageDataUrl: string,
  filledPrompt: string,
  lang: CorrectionLang = 'en',
  signal?: AbortSignal,
): Promise<Correction[]> {
  const res = await generateText({
    model,
    abortSignal: signal,
    system: correctionSystemPrompt(lang),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: imageDataUrl },
          { type: 'text', text: filledPrompt },
        ],
      },
    ],
  });
  return parseCorrections(res.text ?? '');
}
