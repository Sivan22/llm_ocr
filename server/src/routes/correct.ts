import { Hono } from 'hono';
import { z } from 'zod';
import { correctPage } from '../../../shared/ai/correct.js';
import { dataUrlFor, pageBodyLimit, pageRequestSchema, runPageRoute } from './page-route.js';

const correctRequestSchema = pageRequestSchema.extend({
  lang: z.enum(['en', 'he']).default('en'),
});

export const correctRoutes = new Hono();

correctRoutes.post(
  '/',
  pageBodyLimit,
  runPageRoute(correctRequestSchema, (languageModel, data, signal) =>
    correctPage(languageModel, dataUrlFor(data.image, data.imageMediaType), data.prompt, data.lang, signal),
  ),
);
