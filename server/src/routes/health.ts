import { Hono } from 'hono';
import type { Route } from '../../../shared/ai/types.js';
import { claudeCliAvailable } from '../ai/claude-cli.js';

/** Env var holding the key for each keyed route. */
const KEY_ENV: Record<Exclude<Route, 'claude-cli'>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
};

/**
 * Routes the server can actually serve. Only `AI_GATEWAY_API_KEY` is set today,
 * so a server-mode client will normally see `['gateway']` plus claude-cli —
 * adding a key to .env adds the route, no code change.
 */
export function availableRoutes(env: Record<string, string | undefined> = process.env): Route[] {
  const keyed = Object.keys(KEY_ENV) as Exclude<Route, 'claude-cli'>[];
  return keyed.filter((r) => (env[KEY_ENV[r]] ?? '').trim().length > 0);
}

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) =>
  c.json({
    status: 'ok',
    claudeCli: await claudeCliAvailable(),
    routes: availableRoutes(),
  }),
);
