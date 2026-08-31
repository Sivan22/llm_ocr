import { Hono } from 'hono';
import { z } from 'zod';
import type { Model } from '../../../shared/ai/types.js';
import { isRouteModelValid } from '../../../shared/ai/models.js';
import { createServerModel } from '../ai/providers.js';
import { correctPage } from '../../../shared/ai/correct.js';
import { costSourceFor, dataUrlFor, errorStatus, pageRequestSchema } from './ocr.js';

const correctRequestSchema = pageRequestSchema.extend({
  lang: z.enum(['en', 'he']).default('en'),
});

export const correctRoutes = new Hono();

correctRoutes.post('/', async (c) => {
  const parsed = correctRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
  }
  const { route, model, image, imageMediaType, prompt, lang } = parsed.data;
  if (!isRouteModelValid(route, model as Model)) {
    return c.json({ error: `Model "${model}" is not available on route "${route}".` }, 400);
  }
  try {
    const languageModel = await createServerModel(route, model as Model);
    const result = await correctPage(languageModel, dataUrlFor(image, imageMediaType), prompt, lang);
    return c.json({ ...result, costSource: costSourceFor(route) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, errorStatus(err));
  }
});
