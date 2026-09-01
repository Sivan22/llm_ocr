import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { Model, Route } from '../../../shared/ai/types.js';
import { isRouteModelValid } from '../../../shared/ai/models.js';
import { createServerModel } from '../ai/providers.js';

/**
 * Compile-time tie to the shared `Route` union. `satisfies Record<Route, true>`
 * fails to compile if a route is added to shared/ai/types.ts and not listed
 * here — without it, a new route would just 400 at runtime with no build error.
 */
const ROUTE_KEYS = {
  anthropic: true,
  google: true,
  openai: true,
  gateway: true,
  'claude-cli': true,
} satisfies Record<Route, true>;

const ROUTE_VALUES = Object.keys(ROUTE_KEYS) as [Route, ...Route[]];

/** Base64 of a max-size image is 15 MB; leave room for the JSON envelope. */
export const MAX_BODY_BYTES = 20_000_000;

/**
 * `c.req.json()` buffers the whole body before zod's per-field caps can apply,
 * so without this a single huge POST OOMs the process. Rejects with a clean 413
 * (a Response, not a thrown HTTPException) rather than crashing.
 */
export const pageBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ error: `Request body exceeds ${MAX_BODY_BYTES} bytes.` }, 413),
});

export const pageRequestSchema = z.object({
  route: z.enum(ROUTE_VALUES),
  model: z.string().min(1),
  // Raw base64, no data: prefix. Capped to bound request memory.
  image: z.string().min(1).max(15_000_000),
  imageMediaType: z.enum(['image/png', 'image/jpeg']),
  prompt: z.string().min(1),
});

export type PageRequest = z.infer<typeof pageRequestSchema>;

export function dataUrlFor(image: string, mediaType: string): string {
  return `data:${mediaType};base64,${image}`;
}

export function costSourceFor(route: Route): 'provider' | 'claude-cli' {
  return route === 'claude-cli' ? 'claude-cli' : 'provider';
}

/** 400 for anything the client can fix, 502 for an upstream/provider failure. */
export function errorStatus(err: unknown): 400 | 502 {
  const msg = err instanceof Error ? err.message : String(err);
  return /not available on route|is not set on the server/.test(msg) ? 400 : 502;
}

/**
 * Shared parse -> validate route/model -> build model -> call -> respond scaffold for
 * the page-image routes (/api/ocr, /api/correct). `schema` may extend pageRequestSchema
 * with extra fields (e.g. correct's `lang`); `call` runs the route's AI call-layer
 * function and gets the client's abort signal forwarded so a cancelled request doesn't
 * leave the provider call (or, on claude-cli, the subprocess) running server-side.
 */
export function runPageRoute<T extends PageRequest, R extends object>(
  schema: z.ZodType<T>,
  call: (languageModel: LanguageModel, data: T, signal: AbortSignal | undefined) => Promise<R>,
) {
  return async (c: Context) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
    }
    const data = parsed.data;
    const { route, model } = data;
    if (!isRouteModelValid(route, model as Model)) {
      return c.json({ error: `Model "${model}" is not available on route "${route}".` }, 400);
    }
    try {
      const languageModel = await createServerModel(route, model as Model);
      const result = await call(languageModel, data, c.req.raw.signal);
      return c.json({ ...result, costSource: costSourceFor(route) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, errorStatus(err));
    }
  };
}
