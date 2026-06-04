import { createGateway, type LanguageModel } from 'ai';
import { ocrPage } from '../../src/ai/ocr';
import { DEFAULT_SETTINGS } from '../../src/store/settings';
import { regionPrompt, stitch } from './prompts';
import type { OcrCell, RegionCell, RegionRole } from './types';

const MODEL_ID = 'google/gemini-3.1-pro-preview';

export function toDataUrl(png: Uint8Array): string {
  return 'data:image/png;base64,' + Buffer.from(png).toString('base64');
}

export function makeModel(): LanguageModel {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set (put it in .env).');
  return createGateway({ apiKey })(MODEL_ID);
}

// A: full page through the EXACT default app prompt.
export async function runA(model: LanguageModel, fullPagePng: Uint8Array): Promise<OcrCell> {
  try {
    const r = await ocrPage(model, toDataUrl(fullPagePng), DEFAULT_SETTINGS.prompts.ocr);
    return { text: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch (e) {
    return { text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BCrop { role: RegionRole; png: Uint8Array; cropDataUrl: string }

export interface BResult {
  stitched: string;
  regions: RegionCell[];
  totalTokensIn: number;
  totalTokensOut: number;
  error?: string;
}

// B: OCR each crop with its per-region prompt, then stitch in RTL order.
export async function runB(model: LanguageModel, crops: BCrop[]): Promise<BResult> {
  const regions: RegionCell[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const byRole: Partial<Record<RegionRole, string>> = {};

  for (const c of crops) {
    try {
      const r = await ocrPage(model, toDataUrl(c.png), regionPrompt(c.role));
      totalTokensIn += r.tokensIn ?? 0;
      totalTokensOut += r.tokensOut ?? 0;
      byRole[c.role] = r.text;
      regions.push({ role: c.role, text: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut, cropDataUrl: c.cropDataUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      regions.push({ role: c.role, text: '', error: msg, cropDataUrl: c.cropDataUrl });
    }
  }

  const stitched = stitch(byRole['right-body'] ?? '', byRole['left-body'] ?? '', byRole['footnotes']);
  return { stitched, regions, totalTokensIn, totalTokensOut };
}
