import type { Correction, Route, Settings } from '../lib/types';
import { correctPageViaServer, ocrPageViaServer } from '../lib/api';
import { createModel } from './providers';
import { ocrPage } from '../../shared/ai/ocr';
import { correctPage } from '../../shared/ai/correct';

/**
 * Browsers allow only ~6 concurrent connections per origin. In server mode every
 * page is one long-lived POST to our origin, so a higher batch size (gateway
 * defaults to 50) queues and surfaces as "Failed to fetch" mid-run — the exact
 * failure documented in Mugah's pdf-proofread orchestrator.
 */
export const SERVER_CONCURRENCY_CAP = 6;

/** One `claude` subprocess per page; more than a couple thrashes the box. */
export const CLAUDE_CLI_CONCURRENCY = 2;

export function effectiveConcurrency(
  batchSize: number,
  route: Route,
  serverAvailable: boolean,
): number {
  if (!serverAvailable) return batchSize;
  const cap = route === 'claude-cli' ? CLAUDE_CLI_CONCURRENCY : SERVER_CONCURRENCY_CAP;
  return Math.min(batchSize, cap);
}

interface OcrArgs {
  settings: Settings;
  serverAvailable: boolean;
  imageDataUrl: string;
  signal?: AbortSignal;
}

export async function runOcrPage(
  args: OcrArgs,
): Promise<{ text: string; tokensIn?: number; tokensOut?: number }> {
  const { settings, serverAvailable, imageDataUrl, signal } = args;
  if (serverAvailable) {
    return ocrPageViaServer({
      route: settings.route,
      model: settings.model,
      imageDataUrl,
      prompt: settings.prompts.ocr,
      signal,
    });
  }
  return ocrPage(createModel(settings), imageDataUrl, settings.prompts.ocr, signal);
}

export async function runCorrectPage(args: {
  settings: Settings;
  serverAvailable: boolean;
  imageDataUrl: string;
  filledPrompt: string;
  lang: 'en' | 'he';
  signal?: AbortSignal;
}): Promise<{ corrections: Correction[]; tokensIn?: number; tokensOut?: number }> {
  const { settings, serverAvailable, imageDataUrl, filledPrompt, lang, signal } = args;
  if (serverAvailable) {
    return correctPageViaServer({
      route: settings.route,
      model: settings.model,
      imageDataUrl,
      prompt: filledPrompt,
      lang,
      signal,
    });
  }
  return correctPage(createModel(settings), imageDataUrl, filledPrompt, lang, signal);
}
