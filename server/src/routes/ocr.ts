import { Hono } from 'hono';
import { z } from 'zod';
import type { Model, Route } from '../../../shared/ai/types.js';
import { isRouteModelValid } from '../../../shared/ai/models.js';
import { createServerModel } from '../ai/providers.js';
import { ocrPage } from '../../../shared/ai/ocr.js';

export const pageRequestSchema = z.object({
  route: z.enum(['anthropic', 'google', 'openai', 'gateway', 'claude-cli']),
  model: z.string().min(1),
  // Raw base64, no data: prefix. Capped to bound request memory.
  image: z.string().min(1).max(15_000_000),
  imageMediaType: z.enum(['image/png', 'image/jpeg']),
  prompt: z.string().min(1),
});

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

export const ocrRoutes = new Hono();

ocrRoutes.post('/', async (c) => {
  const parsed = pageRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
  }
  const { route, model, image, imageMediaType, prompt } = parsed.data;
  if (!isRouteModelValid(route, model as Model)) {
    return c.json({ error: `Model "${model}" is not available on route "${route}".` }, 400);
  }
  try {
    const languageModel = await createServerModel(route, model as Model);
    const result = await ocrPage(languageModel, dataUrlFor(image, imageMediaType), prompt);
    return c.json({ ...result, costSource: costSourceFor(route) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, errorStatus(err));
  }
});
