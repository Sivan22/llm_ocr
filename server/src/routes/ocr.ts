import { Hono } from 'hono';
import { ocrPage } from '../../../shared/ai/ocr.js';
import { dataUrlFor, pageBodyLimit, pageRequestSchema, runPageRoute } from './page-route.js';

export const ocrRoutes = new Hono();

ocrRoutes.post(
  '/',
  pageBodyLimit,
  runPageRoute(pageRequestSchema, (languageModel, data, signal) =>
    ocrPage(languageModel, dataUrlFor(data.image, data.imageMediaType), data.prompt, signal),
  ),
);
