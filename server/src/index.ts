import './env.js';
import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT) || 3102;

/**
 * Loopback by default. This server holds the API keys and can spawn `claude`
 * subprocesses, and authentication is a deliberate non-goal for it — so the bind
 * address is the only access control there is. Binding 0.0.0.0 on a shared
 * network lets anyone POST /api/ocr and spend the owner's gateway key and Claude
 * quota; CORS is a browser-side control and stops none of it. Set HOST
 * explicitly (and add your own auth/tunnel) if you really need remote access.
 */
const hostname = process.env.HOST || '127.0.0.1';

console.log(`llm_ocr API server starting on http://${hostname}:${port}`);

serve({ fetch: app.fetch, port, hostname });
