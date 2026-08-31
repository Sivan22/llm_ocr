import './env.js';
import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT) || 3102;

console.log(`llm_ocr API server starting on port ${port}`);

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
