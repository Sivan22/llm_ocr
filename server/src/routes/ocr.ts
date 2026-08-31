import { Hono } from 'hono';
import { ocrPage } from '../../../shared/ai/ocr.js';
import { dataUrlFor, pageRequestSchema, runPageRoute } from './page-route.js';

export const ocrRoutes = new Hono();

ocrRoutes.post(
  '/',
  runPageRoute(pageRequestSchema, (languageModel, data, signal) =>
    ocrPage(languageModel, dataUrlFor(data.image, data.imageMediaType), data.prompt, signal),
  ),
);
