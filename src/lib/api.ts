import type { Model, Route } from './types';
import type { OcrResult } from '../../shared/ai/ocr';
import type { CorrectPageResult } from '../../shared/ai/correct';
import { fetchWithTimeout, LONG_TIMEOUT } from './fetch-with-timeout';

/** Empty when the app is served statically (GitHub Pages) — browser-direct mode. */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** Mirrors the server's zod bound so an oversized page fails with a real message. */
export const MAX_IMAGE_BASE64 = 15_000_000;

export type CostSource = 'provider' | 'claude-cli';

export interface ServerStatus {
  available: boolean;
  claudeCli: boolean;
  routes: Route[];
}

export const SERVER_OFFLINE: ServerStatus = { available: false, claudeCli: false, routes: [] };

export function serverModeEnabled(): boolean {
  return API_BASE.trim().length > 0;
}

export function splitDataUrl(dataUrl: string): {
  image: string;
  imageMediaType: 'image/png' | 'image/jpeg';
} {
  const match = /^data:(image\/(?:png|jpeg));base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 png/jpeg data URL.');
  return { image: match[2], imageMediaType: match[1] as 'image/png' | 'image/jpeg' };
}

export async function probeServer(base: string = API_BASE): Promise<ServerStatus> {
  if (!base.trim()) return SERVER_OFFLINE;
  try {
    const res = await fetchWithTimeout(`${base}/api/health`, { timeout: 5000 });
    if (!res.ok) return SERVER_OFFLINE;
    const body = (await res.json()) as { claudeCli?: boolean; routes?: Route[] };
    return {
      available: true,
      claudeCli: body.claudeCli === true,
      routes: body.routes ?? [],
    };
  } catch {
    return SERVER_OFFLINE;
  }
}

interface PageCallArgs {
  base?: string;
  route: Route;
  model: Model;
  imageDataUrl: string;
  prompt: string;
  signal?: AbortSignal;
}

async function postPage<T>(path: string, args: PageCallArgs, extra: object = {}): Promise<T> {
  const { image, imageMediaType } = splitDataUrl(args.imageDataUrl);
  if (image.length > MAX_IMAGE_BASE64) {
    throw new Error(`Page image is too large to send (${image.length} base64 chars).`);
  }
  const res = await fetchWithTimeout(`${args.base ?? API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route: args.route,
      model: args.model,
      image,
      imageMediaType,
      prompt: args.prompt,
      ...extra,
    }),
    signal: args.signal,
    timeout: LONG_TIMEOUT,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return body as T;
}

export function ocrPageViaServer(args: PageCallArgs): Promise<OcrResult & { costSource: CostSource }> {
  return postPage('/api/ocr', args);
}

export function correctPageViaServer(
  args: PageCallArgs & { lang: 'en' | 'he' },
): Promise<CorrectPageResult & { costSource: CostSource }> {
  return postPage('/api/correct', args, { lang: args.lang });
}
