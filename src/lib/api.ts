import type { Model, Route } from './types';
import { IMAGE_MEDIA_TYPES, type ImageMediaType } from '../../shared/ai/types';
import type { OcrResult } from '../../shared/ai/ocr';
import type { CorrectPageResult } from '../../shared/ai/correct';
import { fetchWithTimeout, LONG_TIMEOUT } from './fetch-with-timeout';

/** Empty when the app is served statically (GitHub Pages) — browser-direct mode. */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** Mirrors the server's zod bound so an oversized page fails with a real message. */
export const MAX_IMAGE_BASE64 = 15_000_000;

export type CostSource = 'provider' | 'claude-cli';

export interface ServerStatus {
  /**
   * Reachable *and* able to serve at least one route. Everything keys off this —
   * the dispatcher, the run gate, the Settings route list — so a server that
   * answers /api/health with no keys and no CLI reads as unavailable and the app
   * degrades to browser-direct instead of 400-ing every page.
   */
  available: boolean;
  /** /api/health answered. Only used to tell "not running" from "running but
   *  has nothing configured", which need different messages. */
  reachable: boolean;
  claudeCli: boolean;
  routes: Route[];
}

export const SERVER_OFFLINE: ServerStatus = {
  available: false,
  reachable: false,
  claudeCli: false,
  routes: [],
};

export function serverModeEnabled(): boolean {
  return API_BASE.trim().length > 0;
}

export function splitDataUrl(dataUrl: string): {
  image: string;
  imageMediaType: ImageMediaType;
} {
  const match = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 image data URL.');
  const mediaType = `image/${match[1].toLowerCase()}`;
  // Names the offending type: DropStrip accepts `image/*`, so this is reachable
  // with a real file (e.g. .bmp) and the message has to say which one.
  if (!(IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw new Error(
      `Unsupported image type "${mediaType}". Supported: ${IMAGE_MEDIA_TYPES.join(', ')}.`,
    );
  }
  return { image: match[2], imageMediaType: mediaType as ImageMediaType };
}

export async function probeServer(base: string = API_BASE): Promise<ServerStatus> {
  if (!base.trim()) return SERVER_OFFLINE;
  try {
    const res = await fetchWithTimeout(`${base}/api/health`, { timeout: 5000 });
    if (!res.ok) return SERVER_OFFLINE;
    const body = (await res.json()) as { claudeCli?: boolean; routes?: Route[] };
    const claudeCli = body.claudeCli === true;
    const routes = body.routes ?? [];
    return {
      // A reachable server with no keys and no CLI can serve nothing. Reporting
      // it as available would hide the key field in Settings, leave the route
      // picker empty and send every page to a server that 400s it.
      available: routes.length > 0 || claudeCli,
      reachable: true,
      claudeCli,
      routes,
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

/**
 * A non-2xx answer from our own server, carrying the status so callers can tell
 * "this request is wrong" from "the upstream hiccuped".
 */
export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

/**
 * True for a failure that retrying cannot fix — a 4xx from our own server means
 * the request itself is structurally wrong (model not on this route, key not set
 * server-side), so runBatch's 3 attempts with 5s/10s backoff would burn ~15s and
 * three requests per page for nothing. 408/429 are the exceptions: those really
 * are transient. 5xx and network errors stay retryable.
 */
export function isNonRetryable(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return false;
  if (err.status === 408 || err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
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
    throw new ApiRequestError(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
      res.status,
    );
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
