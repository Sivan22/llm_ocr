# Server-Side OCR + Claude CLI Route — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route llm_ocr's OCR and correction calls through a local Hono server that holds the API keys, and add a `claude-cli` route that OCRs pages through the local `claude` CLI subscription.

**Architecture:** The pure call layer (`ocrPage`, `correctPage`, pricing, the model registry) moves to `shared/ai/`, imported by both the browser bundle and a new `server/` package. The server exposes stateless per-page endpoints; the browser keeps `runBatch`, retries, abort and all IndexedDB persistence. When `VITE_API_URL` is unset the client falls back to today's browser-direct path, so the GitHub Pages build is unchanged.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4, Hono 4 + `@hono/node-server`, Vercel AI SDK 6, `ai-sdk-provider-claude-code` 3.5, zod 4.

**Spec:** `docs/superpowers/specs/2026-08-31-server-side-ocr-and-claude-cli-design.md`

## Global Constraints

- Server port **3102** (`Mugah/server` owns 3101). Override via `PORT`.
- Server env loads `../.env` — i.e. `llm_ocr/.env`, which already holds `AI_GATEWAY_API_KEY`.
- Base64 image field cap: **`z.string().min(1).max(15_000_000)`**, matching `Mugah/server/src/routes/pdf-proofread.ts:21`.
- Server-mode client concurrency cap: **6** (browser allows ~6 connections per origin; see `Mugah/client/src/pdf-proofread/runner/orchestrator.ts`). `claude-cli` cap: **2**.
- Claude CLI settings, verbatim: `{ effort: "high", tools: [], streamingInput: "always", env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || "64000" } }`. `streamingInput: "always"` is mandatory — without it image parts are silently dropped.
- Every new user-facing string needs both `en` and `he` entries in `src/i18n/translations.ts`.
- `.github/workflows/deploy.yml` must not be modified.
- Crash recovery / IndexedDB persistence must not be modified — it is already at parity with Mugah's session-restore design.
- Run `npm test` (repo root) and `npm run build` before every commit that touches client code.

---

### Task 1: Shared AI module + `claude-cli` route in the registry

**Files:**
- Create: `shared/ai/types.ts`, `shared/ai/models.ts`, `shared/ai/pricing.ts`, `shared/ai/ocr.ts`, `shared/ai/correct.ts`
- Create: `shared/ai/models.test.ts`
- Modify: `src/ai/ocr.ts`, `src/ai/correct.ts`, `src/ai/pricing.ts` (become re-export shims)
- Modify: `src/ai/providers.ts` (import registry from shared, add `claude-cli` case)
- Modify: `src/lib/types.ts:1-11` (re-export `Route`/`Model`/`Correction`)
- Modify: `src/components/SettingsPanel.tsx:10-31` (keep records total over the widened `Route`)
- Modify: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Route` (now includes `'claude-cli'`), `Model` (now includes `'cli-opus' | 'cli-sonnet' | 'cli-haiku' | 'cli-fable'`), `resolveModelId(route, model): string`, `isRouteModelValid(route, model): boolean`, `modelsForRoute(route): Model[]`, `ocrPage(model, imageDataUrl, prompt, signal): Promise<OcrResult>`, `correctPage(model, imageDataUrl, filledPrompt, lang, signal): Promise<CorrectPageResult>`, `estimateCost(model, usage): number`.

- [ ] **Step 1: Write the failing test**

Create `shared/ai/models.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isRouteModelValid, resolveModelId, modelsForRoute } from './models';
import { estimateCost } from './pricing';

describe('claude-cli route', () => {
  it('maps cli models to the provider aliases', () => {
    expect(resolveModelId('claude-cli', 'cli-opus')).toBe('opus');
    expect(resolveModelId('claude-cli', 'cli-sonnet')).toBe('sonnet');
    expect(resolveModelId('claude-cli', 'cli-haiku')).toBe('haiku');
    expect(resolveModelId('claude-cli', 'cli-fable')).toBe('fable');
  });

  it('lists exactly the four cli models', () => {
    expect(modelsForRoute('claude-cli')).toEqual(['cli-opus', 'cli-sonnet', 'cli-haiku', 'cli-fable']);
  });

  it('rejects cli models on other routes and vice versa', () => {
    expect(isRouteModelValid('gateway', 'cli-opus')).toBe(false);
    expect(isRouteModelValid('claude-cli', 'gpt-4o')).toBe(false);
    expect(() => resolveModelId('anthropic', 'cli-opus')).toThrow();
  });

  it('costs nothing — CLI runs bill against the subscription', () => {
    expect(estimateCost('cli-opus', { tokensIn: 1_000_000, tokensOut: 1_000_000 })).toBe(0);
  });

  it('still prices gateway models', () => {
    expect(estimateCost('gpt-4o-mini', { tokensIn: 1_000_000, tokensOut: 0 })).toBeCloseTo(0.15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/ai/models.test.ts`
Expected: FAIL — `Cannot find module './models'`.

- [ ] **Step 3: Create the shared types**

Create `shared/ai/types.ts` — the three types both sides need. Copy them out of `src/lib/types.ts` and add the new members:

```ts
export type Route = 'anthropic' | 'google' | 'openai' | 'gateway' | 'claude-cli';

export type Model =
  | 'claude-fable-5'
  | 'claude-opus-4-8'
  | 'claude-sonnet-5'
  | 'gemini-3.1-pro'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash'
  | 'gemini-2.5-flash'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'cli-opus'
  | 'cli-sonnet'
  | 'cli-haiku'
  | 'cli-fable';

export interface Correction {
  id: string;
  old: string;
  new: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}
```

- [ ] **Step 4: Create the shared model registry**

Create `shared/ai/models.ts`. This is the `DIRECT_MODEL_ID` block plus the three helpers moved verbatim out of `src/ai/providers.ts:7-45`, with the new `claude-cli` entry:

```ts
import type { Model, Route } from './types';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: {
    'claude-fable-5':    'claude-fable-5',
    'claude-opus-4-8':   'claude-opus-4-8',
    'claude-sonnet-5':   'claude-sonnet-5',
  },
  google: {
    'gemini-3.1-pro':        'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
    'gemini-3.5-flash':      'gemini-3.5-flash',
    'gemini-2.5-flash':      'gemini-2.5-flash',
  },
  openai: {
    'gpt-4o':      'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
  },
  gateway: {
    'claude-fable-5':    'anthropic/claude-fable-5',
    'claude-opus-4-8':   'anthropic/claude-opus-4-8',
    'claude-sonnet-5':   'anthropic/claude-sonnet-5',
    'gemini-3.1-pro':    'google/gemini-3.1-pro-preview',
    'gemini-3.5-flash':  'google/gemini-3.5-flash',
    'gpt-4o':            'openai/gpt-4o',
    'gpt-4o-mini':       'openai/gpt-4o-mini',
  },
  // The CLI provider validates 'opus' | 'sonnet' | 'haiku' against its alias
  // list; 'fable' is accepted as a custom model string, the same way
  // Mugah/server/src/lib/ai-model.ts passes it for high-accuracy runs.
  'claude-cli': {
    'cli-opus':   'opus',
    'cli-sonnet': 'sonnet',
    'cli-haiku':  'haiku',
    'cli-fable':  'fable',
  },
};

export function isRouteModelValid(route: Route, model: Model): boolean {
  return DIRECT_MODEL_ID[route]?.[model] !== undefined;
}

export function resolveModelId(route: Route, model: Model): string {
  const id = DIRECT_MODEL_ID[route]?.[model];
  if (!id) throw new Error(`Model "${model}" is not available on route "${route}".`);
  return id;
}

export function modelsForRoute(route: Route): Model[] {
  return Object.keys(DIRECT_MODEL_ID[route] ?? {}) as Model[];
}
```

- [ ] **Step 5: Move pricing, ocr and correct into `shared/ai/`**

Run these moves, then fix the import lines:

```bash
cd /root/llm_ocr
git mv src/ai/pricing.ts shared/ai/pricing.ts
git mv src/ai/ocr.ts     shared/ai/ocr.ts
git mv src/ai/correct.ts shared/ai/correct.ts
```

In `shared/ai/pricing.ts`, change the import to `import type { Model } from './types';` and add the four zero-rate entries to `RATES` (a CLI run bills against the Pro/Max subscription, not per token):

```ts
  'cli-opus':   { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-sonnet': { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-haiku':  { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-fable':  { inputPerMillion: 0, outputPerMillion: 0 },
```

In `shared/ai/correct.ts`, change `import type { Correction } from '../lib/types';` to `import type { Correction } from './types';`. `shared/ai/ocr.ts` needs no import change.

- [ ] **Step 6: Add re-export shims so existing imports and tests keep working**

There are ~20 import sites and three existing test files (`src/ai/ocr.test.ts`, `src/ai/correct.test.ts`, `src/ai/pricing.test.ts`) pointing at the old paths. Keep them valid:

```bash
cd /root/llm_ocr
printf "export * from '../../shared/ai/ocr';\n"     > src/ai/ocr.ts
printf "export * from '../../shared/ai/correct';\n" > src/ai/correct.ts
printf "export * from '../../shared/ai/pricing';\n" > src/ai/pricing.ts
```

In `src/lib/types.ts`, delete the local `Route`, `Model` and `Correction` declarations and re-export them instead, keeping every other type in place:

```ts
export type { Route, Model, Correction } from '../../shared/ai/types';
import type { Route, Model } from '../../shared/ai/types';
```

(`Route` and `Model` are still referenced by `Settings` and `RunRecord` further down the file, hence the second line.)

- [ ] **Step 7: Point `src/ai/providers.ts` at the shared registry and handle the new route**

Replace the registry block and helpers at the top of `src/ai/providers.ts` with a re-export, keeping `createModel` and `hasApiKey`:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Settings } from '../lib/types';

export { isRouteModelValid, resolveModelId, modelsForRoute } from '../../shared/ai/models';
import { resolveModelId } from '../../shared/ai/models';
```

`hasApiKey` must stop indexing `apiKeys` with a route that has no key field:

```ts
export function hasApiKey(settings: Settings): boolean {
  if (settings.route === 'claude-cli') return true;
  return settings.apiKeys[settings.route].trim().length > 0;
}
```

And `createModel`'s switch needs the new case — the browser cannot spawn a subprocess, so this is a clear error, not a fallback (`noFallthroughCasesInSwitch` and exhaustiveness make this mandatory for `tsc` to pass):

```ts
    case 'claude-cli':
      throw new Error('The Claude CLI route runs on the server. Set VITE_API_URL to use it.');
```

- [ ] **Step 8: Keep `SettingsPanel`'s route records total**

`Route` just gained a member, so the three `Record<Route, …>` maps at `src/components/SettingsPanel.tsx:10-31` no longer typecheck. Make them total without changing any behaviour — `ROUTES` stays the browser-direct list, so the UI is byte-identical until Task 8:

```ts
const ROUTES: Route[] = ['anthropic', 'google', 'openai', 'gateway'];

const KEY_FIELD: Record<Route, keyof ApiKeys | null> = {
  anthropic: 'anthropic',
  google: 'google',
  openai: 'openai',
  gateway: 'gateway',
  'claude-cli': null,
};

const KEY_URLS: Partial<Record<Route, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  gateway: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%3FshowCreateKeyModal%26utm_source%3Dai_gateway_landing_page&title=Get+an+API+Key',
};

export const PROVIDER_BATCH_DEFAULTS: Record<Route, number> = {
  google: 5,
  anthropic: 10,
  openai: 10,
  gateway: 50,
  'claude-cli': 2,
};
```

In the component body, derive the key field once and render the key block only when there is one:

```tsx
  const keyField = KEY_FIELD[settings.route];
```

Wrap the existing `<Label>{t('settings.apiKey', …)}</Label>` block (through the end of the key input and its note) in `{keyField && ( … )}`, replacing `KEY_FIELD[settings.route]` with `keyField` and `KEY_URLS[settings.route]` with `KEY_URLS[settings.route] ?? '#'` inside it.

- [ ] **Step 9: Wire `shared/` into the three build configs**

In `tsconfig.json`: `"include": ["src", "shared"]`.

In `vite.config.ts` and `vitest.config.ts`, add the alias next to the existing `'@'` entry:

```ts
      '@shared': path.resolve(__dirname, 'shared'),
```

- [ ] **Step 10: Run the tests and the build**

Run: `npm test && npm run build`
Expected: PASS — the new `shared/ai/models.test.ts` passes and every pre-existing test still passes through the shims.

- [ ] **Step 11: Commit**

```bash
git add shared src/ai src/lib/types.ts src/components/SettingsPanel.tsx tsconfig.json vite.config.ts vitest.config.ts
git commit -m "refactor: move the AI call layer to shared/ai and register the claude-cli route"
```

---

### Task 2: Server package skeleton + health endpoint

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/.gitignore`
- Create: `server/src/index.ts`, `server/src/env.ts`, `server/src/app.ts`
- Create: `server/src/ai/claude-cli.ts`, `server/src/routes/health.ts`
- Create: `server/src/routes/health.test.ts`

**Interfaces:**
- Consumes: `Route` from `shared/ai/types`.
- Produces: `app` (Hono instance) from `server/src/app.ts`; `availableRoutes(env?): Route[]` and `healthRoutes` from `server/src/routes/health.ts`; `claudeCliAvailable(): Promise<boolean>` and `resetClaudeCliProbe(): void` from `server/src/ai/claude-cli.ts`.

- [ ] **Step 1: Scaffold the package**

Create `server/package.json`:

```json
{
  "name": "llm-ocr-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/google": "^3.0.39",
    "@ai-sdk/openai": "^3.0.0",
    "@hono/node-server": "^1.19.14",
    "ai": "^6.0.168",
    "ai-sdk-provider-claude-code": "^3.5.0",
    "dotenv": "^17.4.2",
    "hono": "^4.12.27",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "tsx": "^4.22.4",
    "typescript": "^5.6.3",
    "vitest": "^4.1.0"
  }
}
```

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "../shared"]
}
```

Create `server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

Create `server/.gitignore`:

```
node_modules
dist
```

Then: `cd server && npm install`

- [ ] **Step 2: Write the failing test**

Create `server/src/routes/health.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/claude-cli.js', () => ({
  claudeCliAvailable: vi.fn(async () => true),
}));

import { availableRoutes, healthRoutes } from './health.js';
import { claudeCliAvailable } from '../ai/claude-cli.js';

describe('availableRoutes', () => {
  it('lists only routes whose key is present in the env', () => {
    expect(availableRoutes({ AI_GATEWAY_API_KEY: 'sk-test' })).toEqual(['gateway']);
  });

  it('ignores blank keys', () => {
    expect(availableRoutes({ AI_GATEWAY_API_KEY: '   ', OPENAI_API_KEY: 'sk-o' })).toEqual(['openai']);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(availableRoutes({})).toEqual([]);
  });
});

describe('GET /api/health', () => {
  beforeEach(() => vi.mocked(claudeCliAvailable).mockResolvedValue(true));

  it('reports status, the probed CLI flag, and the key-backed routes', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test';
    const res = await healthRoutes.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', claudeCli: true, routes: ['gateway'] });
  });

  it('reports claudeCli false when the probe fails', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test';
    vi.mocked(claudeCliAvailable).mockResolvedValue(false);
    const res = await healthRoutes.request('/');
    expect(await res.json()).toMatchObject({ claudeCli: false });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/health.test.ts`
Expected: FAIL — `Cannot find module './health.js'`.

- [ ] **Step 4: Write the CLI availability probe**

Create `server/src/ai/claude-cli.ts`. The result is cached because the probe spawns a process and health is polled by every client:

```ts
import { execFile } from 'node:child_process';

let cached: boolean | undefined;

/**
 * True when a `claude` binary is on PATH. Probed once (spawning a process per
 * health check would be silly) with a 5s timeout, and never allowed to throw —
 * a missing CLI must degrade to "route unavailable", not break the server.
 */
export function claudeCliAvailable(): Promise<boolean> {
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise<boolean>((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err) => {
      cached = !err;
      resolve(cached);
    });
  }).catch(() => {
    cached = false;
    return false;
  });
}

/** Test seam: forget the cached probe result. */
export function resetClaudeCliProbe(): void {
  cached = undefined;
}
```

- [ ] **Step 5: Write the health route**

Create `server/src/routes/health.ts`:

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/health.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Write env loading, the app and the entrypoint**

Create `server/src/env.ts` (mirrors `Mugah/server/src/env.ts` — the root `.env` already holds `AI_GATEWAY_API_KEY`):

```ts
import { config } from 'dotenv';

config({ path: '../.env', override: true });
```

Create `server/src/app.ts`. CORS is required because the Vite dev origin differs from the API origin; Mugah gets the equivalent from `vercel.json` headers:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function allowedOrigins(): string[] {
  const raw = (process.env.ALLOWED_ORIGINS ?? '').trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: allowedOrigins(),
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.route('/api/health', healthRoutes);

export default app;
```

Create `server/src/index.ts`:

```ts
import './env.js';
import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT) || 3102;

console.log(`llm_ocr API server starting on port ${port}`);

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
```

- [ ] **Step 8: Verify the server boots and answers**

Run: `cd server && npm run start &` then `curl -s localhost:3102/api/health`
Expected: `{"status":"ok","claudeCli":true,"routes":["gateway"]}` (`claudeCli` is true on this box — `claude --version` reports 2.1.251). Stop the server afterwards.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "feat(server): hono skeleton on :3102 with health + claude CLI probe"
```

---

### Task 3: Server-side model construction, including `claude-cli`

**Files:**
- Create: `server/src/ai/providers.ts`
- Create: `server/src/ai/providers.test.ts`
- Modify: `server/src/ai/claude-cli.ts` (add the lazy provider getter)

**Interfaces:**
- Consumes: `resolveModelId` from `shared/ai/models`, `Route`/`Model` from `shared/ai/types`.
- Produces: `createServerModel(route: Route, model: Model): Promise<LanguageModel>`.

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/providers.test.ts`. The mocks mirror `Mugah/server/src/lib/ai-model.test.ts`, which captures both args so the settings object can be asserted field-by-field:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('ai', () => ({
  createGateway: (opts: unknown) => (id: string) => ({ __gateway: id, opts }),
}));

vi.mock('ai-sdk-provider-claude-code', () => ({
  createClaudeCode: () => (id: string, settings?: unknown) => ({ __claudeCode: id, settings }),
}));

import { createServerModel } from './providers.js';

// The CLI caps output at 32k by default and the provider ignores the AI-SDK
// maxOutputTokens param, so the subprocess env has to raise it.
const DEFAULT_CLI_ENV = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000' };

describe('createServerModel', () => {
  const originalMaxTokens = process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  const originalGateway = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    if (originalMaxTokens === undefined) delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
    else process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = originalMaxTokens;
    if (originalGateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalGateway;
  });

  it('builds a gateway model from the resolved id', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test';
    const model = await createServerModel('gateway', 'gemini-3.1-pro');
    expect(model).toMatchObject({ __gateway: 'google/gemini-3.1-pro-preview' });
  });

  it('throws a named error when the route key is missing', async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    await expect(createServerModel('gateway', 'gemini-3.1-pro')).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it('builds the CLI model with streamingInput always and no tools', async () => {
    delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
    const model = await createServerModel('claude-cli', 'cli-opus');
    expect(model).toEqual({
      __claudeCode: 'opus',
      settings: {
        effort: 'high',
        // No tool loop — this is a plain image-in / text-out OCR call.
        tools: [],
        // MANDATORY: the provider only forwards image parts to the subprocess
        // in streaming-input mode; without it the page image is dropped.
        streamingInput: 'always',
        env: DEFAULT_CLI_ENV,
      },
    });
  });

  it('honors a CLAUDE_CODE_MAX_OUTPUT_TOKENS override', async () => {
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '100000';
    const model = await createServerModel('claude-cli', 'cli-fable');
    expect(model).toMatchObject({
      __claudeCode: 'fable',
      settings: { env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '100000' } },
    });
  });

  it('rejects a model that does not belong to the route', async () => {
    await expect(createServerModel('claude-cli', 'gpt-4o')).rejects.toThrow(/not available on route/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/ai/providers.test.ts`
Expected: FAIL — `Cannot find module './providers.js'`.

- [ ] **Step 3: Add the lazy provider getter**

Append to `server/src/ai/claude-cli.ts`:

```ts
import type { LanguageModel } from 'ai';
import type { ClaudeCodeSettings } from 'ai-sdk-provider-claude-code';

type ClaudeCodeFactory = (modelId: string, settings?: ClaudeCodeSettings) => LanguageModel;

let claudeCodeProvider: ClaudeCodeFactory | undefined;

/**
 * Memoized lazy import. Kept lazy so a box without the CLI still serves the
 * key-backed routes instead of failing at module load.
 */
export async function getClaudeCodeProvider(): Promise<ClaudeCodeFactory> {
  if (!claudeCodeProvider) {
    const mod = await import('ai-sdk-provider-claude-code');
    const provider =
      typeof mod.createClaudeCode === 'function' ? mod.createClaudeCode() : mod.claudeCode;
    claudeCodeProvider = provider as unknown as ClaudeCodeFactory;
  }
  return claudeCodeProvider;
}

/** Subprocess env for the CLI. See CLAUDE_CODE_MAX_OUTPUT_TOKENS note above. */
export function claudeCliEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '64000',
  };
}
```

- [ ] **Step 4: Write the server provider factory**

Create `server/src/ai/providers.ts`:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Model, Route } from '../../../shared/ai/types.js';
import { resolveModelId } from '../../../shared/ai/models.js';
import { claudeCliEnv, getClaudeCodeProvider } from './claude-cli.js';

function requireKey(name: string): string {
  const key = (process.env[name] ?? '').trim();
  if (!key) throw new Error(`${name} is not set on the server.`);
  return key;
}

export async function createServerModel(route: Route, model: Model): Promise<LanguageModel> {
  const id = resolveModelId(route, model);
  switch (route) {
    case 'anthropic':
      return createAnthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') })(id);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: requireKey('GOOGLE_GENERATIVE_AI_API_KEY') })(id);
    case 'openai':
      return createOpenAI({ apiKey: requireKey('OPENAI_API_KEY') })(id);
    case 'gateway':
      return createGateway({ apiKey: requireKey('AI_GATEWAY_API_KEY') })(id);
    case 'claude-cli': {
      const claudeCode = await getClaudeCodeProvider();
      return claudeCode(id, {
        effort: 'high',
        tools: [],
        streamingInput: 'always',
        env: claudeCliEnv(),
      });
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/ai/providers.test.ts && npm run typecheck`
Expected: PASS (5 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai
git commit -m "feat(server): model factory with the claude-cli provider"
```

---

### Task 4: `/api/ocr` and `/api/correct`

**Files:**
- Create: `server/src/routes/ocr.ts`, `server/src/routes/correct.ts`
- Create: `server/src/routes/ocr.test.ts`
- Modify: `server/src/app.ts` (mount both)

**Interfaces:**
- Consumes: `createServerModel` from `server/src/ai/providers`, `ocrPage`/`correctPage` from `shared/ai/`.
- Produces: `POST /api/ocr` → `{ text, tokensIn?, tokensOut?, costSource }`; `POST /api/correct` → `{ corrections, tokensIn?, tokensOut?, costSource }`; shared `pageRequestSchema` exported from `server/src/routes/ocr.ts`.

- [ ] **Step 1: Write the failing test**

Create `server/src/routes/ocr.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../ai/providers.js', () => ({
  createServerModel: vi.fn(async () => ({ __model: true })),
}));

vi.mock('../../../shared/ai/ocr.js', () => ({
  ocrPage: vi.fn(async () => ({ text: 'שלום', tokensIn: 11, tokensOut: 22 })),
}));

import { ocrRoutes } from './ocr.js';
import { ocrPage } from '../../../shared/ai/ocr.js';

const body = {
  route: 'gateway',
  model: 'gemini-3.1-pro',
  image: 'aGVsbG8=',
  imageMediaType: 'image/png',
  prompt: 'do ocr',
};

function post(payload: unknown) {
  return ocrRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/ocr', () => {
  it('returns text, usage and the cost source', async () => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: 'שלום',
      tokensIn: 11,
      tokensOut: 22,
      costSource: 'provider',
    });
  });

  it('tags claude-cli runs so the client can show them as subscription spend', async () => {
    const res = await post({ ...body, route: 'claude-cli', model: 'cli-opus' });
    expect(await res.json()).toMatchObject({ costSource: 'claude-cli' });
  });

  it('rebuilds a data URL for the model call', async () => {
    await post(body);
    expect(vi.mocked(ocrPage).mock.calls[0][1]).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('rejects an image over the 15MB base64 cap', async () => {
    const res = await post({ ...body, image: 'a'.repeat(15_000_001) });
    expect(res.status).toBe(400);
  });

  it('rejects a model that does not belong to the route', async () => {
    const res = await post({ ...body, model: 'cli-opus' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not available on route/);
  });

  it('reports provider failures as 502 with the message', async () => {
    vi.mocked(ocrPage).mockRejectedValueOnce(new Error('upstream exploded'));
    const res = await post(body);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/upstream exploded/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/ocr.test.ts`
Expected: FAIL — `Cannot find module './ocr.js'`.

- [ ] **Step 3: Write the OCR route**

Create `server/src/routes/ocr.ts`. The `.max(15_000_000)` bound is copied from `Mugah/server/src/routes/pdf-proofread.ts:21` — it bounds request memory against a malformed or hostile client:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/ocr.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the correction route**

Create `server/src/routes/correct.ts`. Same shape, plus the `lang` field that selects the Hebrew or English reason wording:

```ts
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
```

- [ ] **Step 6: Mount both routes**

In `server/src/app.ts`, add the imports and mounts below the health route:

```ts
import { ocrRoutes } from './routes/ocr.js';
import { correctRoutes } from './routes/correct.js';
```

```ts
app.route('/api/ocr', ocrRoutes);
app.route('/api/correct', correctRoutes);
```

- [ ] **Step 7: Verify end to end against the real CLI**

Run the server (`cd server && npm run start &`), then OCR a real page through the CLI route:

```bash
curl -s -X POST localhost:3102/api/ocr \
  -H 'Content-Type: application/json' \
  -d "{\"route\":\"claude-cli\",\"model\":\"cli-sonnet\",\"imageMediaType\":\"image/png\",\"prompt\":\"Transcribe the text in this image. Return only the text.\",\"image\":\"$(base64 -w0 /path/to/a/page.png)\"}"
```

Expected: JSON with a non-empty `text`, `costSource: "claude-cli"`, and non-zero token counts. **If `text` comes back empty, `streamingInput: "always"` is missing or ineffective — the image never reached the subprocess.** Stop the server afterwards.

- [ ] **Step 8: Commit**

```bash
git add server/src
git commit -m "feat(server): stateless /api/ocr and /api/correct endpoints"
```

---

### Task 5: Client HTTP layer

**Files:**
- Create: `src/lib/fetch-with-timeout.ts`, `src/lib/api.ts`
- Create: `src/lib/api.test.ts`

**Interfaces:**
- Consumes: `Route`/`Model`/`Correction` from `src/lib/types`, `OcrResult` from `shared/ai/ocr`, `CorrectPageResult` from `shared/ai/correct`.
- Produces: `API_BASE`, `serverModeEnabled(): boolean`, `probeServer(): Promise<ServerStatus>`, `ServerStatus`, `splitDataUrl(dataUrl): { image, imageMediaType }`, `MAX_IMAGE_BASE64`, `ocrPageViaServer(...)`, `correctPageViaServer(...)`, `LONG_TIMEOUT`.

- [ ] **Step 1: Copy the timeout helper**

Create `src/lib/fetch-with-timeout.ts` — copied verbatim from `Mugah/client/src/lib/fetch-with-timeout.ts`. Plain `fetch` has no timeout, and a hung CLI subprocess would otherwise hold one of the six per-origin connection slots forever:

```ts
const DEFAULT_TIMEOUT = 120000; // 2 minutes default
const LONG_TIMEOUT = 800000; // ~13 minutes for AI operations

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { DEFAULT_TIMEOUT, LONG_TIMEOUT };
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitDataUrl, probeServer, ocrPageViaServer, MAX_IMAGE_BASE64 } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('splitDataUrl', () => {
  it('strips the data: prefix and reports the media type', () => {
    expect(splitDataUrl('data:image/png;base64,aGVsbG8=')).toEqual({
      image: 'aGVsbG8=',
      imageMediaType: 'image/png',
    });
  });

  it('handles jpeg', () => {
    expect(splitDataUrl('data:image/jpeg;base64,QQ==').imageMediaType).toBe('image/jpeg');
  });

  it('throws on a non-data URL rather than sending garbage', () => {
    expect(() => splitDataUrl('https://example.com/a.png')).toThrow(/data URL/);
  });
});

describe('probeServer', () => {
  it('reports unavailable when the probe rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: false, claudeCli: false, routes: [],
    });
  });

  it('passes through the reported capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ status: 'ok', claudeCli: true, routes: ['gateway'] }),
      { status: 200 },
    )));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: true, claudeCli: true, routes: ['gateway'],
    });
  });

  it('reports unavailable when no base URL is configured', async () => {
    expect(await probeServer('')).toMatchObject({ available: false });
  });
});

describe('ocrPageViaServer', () => {
  const args = {
    base: 'http://localhost:3102',
    route: 'gateway' as const,
    model: 'gemini-3.1-pro' as const,
    imageDataUrl: 'data:image/png;base64,aGVsbG8=',
    prompt: 'do ocr',
  };

  it('posts the split image and returns the parsed result', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ text: 'שלום', tokensIn: 1, tokensOut: 2, costSource: 'provider' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const res = await ocrPageViaServer(args);
    expect(res).toMatchObject({ text: 'שלום', tokensIn: 1, tokensOut: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ image: 'aGVsbG8=', imageMediaType: 'image/png' });
    expect(body.imageDataUrl).toBeUndefined();
  });

  it('surfaces the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'AI_GATEWAY_API_KEY is not set on the server.' }),
      { status: 400 },
    )));
    await expect(ocrPageViaServer(args)).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it('rejects an oversized image before it hits the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const big = `data:image/png;base64,${'a'.repeat(MAX_IMAGE_BASE64 + 1)}`;
    await expect(ocrPageViaServer({ ...args, imageDataUrl: big })).rejects.toThrow(/too large/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 4: Write the API client**

Create `src/lib/api.ts`:

```ts
import type { Correction, Model, Route } from './types';
import type { OcrResult } from '../../shared/ai/ocr';
import { fetchWithTimeout, LONG_TIMEOUT } from './fetch-with-timeout';

/** Empty when the app is served statically (GitHub Pages) — browser-direct mode. */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** Mirrors the server's zod bound so an oversized page fails with a real message. */
export const MAX_IMAGE_BASE64 = 15_000_000;

export type CostSource = 'provider' | 'claude-cli';

export interface ServerStatus {
  available: boolean;
  claudeCli: boolean;
  routes: Route[];
}

export const SERVER_OFFLINE: ServerStatus = { available: false, claudeCli: false, routes: [] };

export function serverModeEnabled(): boolean {
  return API_BASE.trim().length > 0;
}

export function splitDataUrl(dataUrl: string): {
  image: string;
  imageMediaType: 'image/png' | 'image/jpeg';
} {
  const match = /^data:(image\/(?:png|jpeg));base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 png/jpeg data URL.');
  return { image: match[2], imageMediaType: match[1] as 'image/png' | 'image/jpeg' };
}

export async function probeServer(base: string = API_BASE): Promise<ServerStatus> {
  if (!base.trim()) return SERVER_OFFLINE;
  try {
    const res = await fetchWithTimeout(`${base}/api/health`, { timeout: 5000 });
    if (!res.ok) return SERVER_OFFLINE;
    const body = (await res.json()) as { claudeCli?: boolean; routes?: Route[] };
    return {
      available: true,
      claudeCli: body.claudeCli === true,
      routes: body.routes ?? [],
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
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return body as T;
}

export function ocrPageViaServer(args: PageCallArgs): Promise<OcrResult & { costSource: CostSource }> {
  return postPage('/api/ocr', args);
}

export function correctPageViaServer(
  args: PageCallArgs & { lang: 'en' | 'he' },
): Promise<{ corrections: Correction[]; tokensIn?: number; tokensOut?: number; costSource: CostSource }> {
  return postPage('/api/correct', args, { lang: args.lang });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/api.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts src/lib/fetch-with-timeout.ts
git commit -m "feat(client): server API client with long timeout and image size guard"
```

---

### Task 6: Server-status context and the call dispatcher

**Files:**
- Create: `src/store/ServerStatusContext.tsx`
- Create: `src/ai/dispatch.ts`, `src/ai/dispatch.test.ts`

**Interfaces:**
- Consumes: `probeServer`, `ServerStatus`, `ocrPageViaServer`, `correctPageViaServer` from `src/lib/api`; `createModel` from `src/ai/providers`; `ocrPage`/`correctPage` from `shared/ai/`.
- Produces: `ServerStatusProvider`, `useServerStatus(): { status: ServerStatus; refresh: () => void }`, `effectiveConcurrency(batchSize, route, serverAvailable): number`, `SERVER_CONCURRENCY_CAP`, `CLAUDE_CLI_CONCURRENCY`, `runOcrPage(...)`, `runCorrectPage(...)`.

- [ ] **Step 1: Write the failing test**

Create `src/ai/dispatch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  ocrPageViaServer: vi.fn(async () => ({ text: 'server', costSource: 'provider' })),
  correctPageViaServer: vi.fn(async () => ({ corrections: [], costSource: 'provider' })),
}));

vi.mock('./providers', () => ({
  createModel: vi.fn(() => ({ __browserModel: true })),
}));

vi.mock('../../shared/ai/ocr', () => ({
  ocrPage: vi.fn(async () => ({ text: 'browser' })),
}));

import { effectiveConcurrency, runOcrPage, SERVER_CONCURRENCY_CAP, CLAUDE_CLI_CONCURRENCY } from './dispatch';
import { ocrPageViaServer } from '../lib/api';
import { ocrPage } from '../../shared/ai/ocr';
import { DEFAULT_SETTINGS } from '../store/settings';

describe('effectiveConcurrency', () => {
  it('leaves browser-direct runs alone — they fan out to the provider, not to us', () => {
    expect(effectiveConcurrency(50, 'gateway', false)).toBe(50);
  });

  it('caps server-mode runs at the browser per-origin connection limit', () => {
    // 50 concurrent POSTs to one origin queue behind ~6 connections and fail
    // as "Failed to fetch" — see Mugah pdf-proofread orchestrator.
    expect(effectiveConcurrency(50, 'gateway', true)).toBe(SERVER_CONCURRENCY_CAP);
  });

  it('never raises a lower batch size', () => {
    expect(effectiveConcurrency(3, 'gateway', true)).toBe(3);
  });

  it('caps claude-cli harder — one subprocess per page', () => {
    expect(effectiveConcurrency(50, 'claude-cli', true)).toBe(CLAUDE_CLI_CONCURRENCY);
  });
});

describe('runOcrPage', () => {
  const settings = { ...DEFAULT_SETTINGS, route: 'gateway' as const, model: 'gemini-3.1-pro' as const };

  it('uses the server when it is available', async () => {
    const res = await runOcrPage({
      settings, serverAvailable: true, imageDataUrl: 'data:image/png;base64,aGk=',
    });
    expect(res.text).toBe('server');
    expect(ocrPageViaServer).toHaveBeenCalled();
    expect(ocrPage).not.toHaveBeenCalled();
  });

  it('falls back to the in-browser provider when the server is absent', async () => {
    const res = await runOcrPage({
      settings, serverAvailable: false, imageDataUrl: 'data:image/png;base64,aGk=',
    });
    expect(res.text).toBe('browser');
    expect(ocrPage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/dispatch.test.ts`
Expected: FAIL — `Cannot find module './dispatch'`.

- [ ] **Step 3: Write the dispatcher**

Create `src/ai/dispatch.ts`:

```ts
import type { Correction, Route, Settings } from '../lib/types';
import { correctPageViaServer, ocrPageViaServer } from '../lib/api';
import { createModel } from './providers';
import { ocrPage } from '../../shared/ai/ocr';
import { correctPage } from '../../shared/ai/correct';

/**
 * Browsers allow only ~6 concurrent connections per origin. In server mode every
 * page is one long-lived POST to our origin, so a higher batch size (gateway
 * defaults to 50) queues and surfaces as "Failed to fetch" mid-run — the exact
 * failure documented in Mugah's pdf-proofread orchestrator.
 */
export const SERVER_CONCURRENCY_CAP = 6;

/** One `claude` subprocess per page; more than a couple thrashes the box. */
export const CLAUDE_CLI_CONCURRENCY = 2;

export function effectiveConcurrency(
  batchSize: number,
  route: Route,
  serverAvailable: boolean,
): number {
  if (!serverAvailable) return batchSize;
  const cap = route === 'claude-cli' ? CLAUDE_CLI_CONCURRENCY : SERVER_CONCURRENCY_CAP;
  return Math.min(batchSize, cap);
}

interface OcrArgs {
  settings: Settings;
  serverAvailable: boolean;
  imageDataUrl: string;
  signal?: AbortSignal;
}

export async function runOcrPage(
  args: OcrArgs,
): Promise<{ text: string; tokensIn?: number; tokensOut?: number }> {
  const { settings, serverAvailable, imageDataUrl, signal } = args;
  if (serverAvailable) {
    return ocrPageViaServer({
      route: settings.route,
      model: settings.model,
      imageDataUrl,
      prompt: settings.prompts.ocr,
      signal,
    });
  }
  return ocrPage(createModel(settings), imageDataUrl, settings.prompts.ocr, signal);
}

export async function runCorrectPage(args: {
  settings: Settings;
  serverAvailable: boolean;
  imageDataUrl: string;
  filledPrompt: string;
  lang: 'en' | 'he';
  signal?: AbortSignal;
}): Promise<{ corrections: Correction[]; tokensIn?: number; tokensOut?: number }> {
  const { settings, serverAvailable, imageDataUrl, filledPrompt, lang, signal } = args;
  if (serverAvailable) {
    return correctPageViaServer({
      route: settings.route,
      model: settings.model,
      imageDataUrl,
      prompt: filledPrompt,
      lang,
      signal,
    });
  }
  return correctPage(createModel(settings), imageDataUrl, filledPrompt, lang, signal);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/dispatch.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the status context**

Create `src/store/ServerStatusContext.tsx`. It probes once on mount and exposes a manual retry; a failed probe silently means browser-direct mode:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { probeServer, SERVER_OFFLINE, serverModeEnabled, type ServerStatus } from '../lib/api';

interface Ctx {
  status: ServerStatus;
  /** True until the first probe settles, so the UI can avoid flashing "offline". */
  probing: boolean;
  refresh: () => void;
}

const ServerStatusCtx = createContext<Ctx | null>(null);

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServerStatus>(SERVER_OFFLINE);
  const [probing, setProbing] = useState<boolean>(serverModeEnabled());

  const refresh = useCallback(() => {
    if (!serverModeEnabled()) {
      setStatus(SERVER_OFFLINE);
      setProbing(false);
      return;
    }
    setProbing(true);
    probeServer().then((s) => {
      setStatus(s);
      setProbing(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const ctx = useMemo(() => ({ status, probing, refresh }), [status, probing, refresh]);
  return <ServerStatusCtx.Provider value={ctx}>{children}</ServerStatusCtx.Provider>;
}

export function useServerStatus(): Ctx {
  const ctx = useContext(ServerStatusCtx);
  if (!ctx) throw new Error('useServerStatus must be used within ServerStatusProvider');
  return ctx;
}
```

- [ ] **Step 6: Mount the provider**

In `src/App.tsx`, add the import and open `<ServerStatusProvider>` immediately inside `<SettingsProvider>` (line 102), closing it before `</SettingsProvider>`. That places it above `ProjectProvider` → `BatchRunnerProvider` and the settings/fix panels, which are the consumers:

```tsx
import { ServerStatusProvider } from './store/ServerStatusContext';
```

```tsx
        <SettingsProvider>
          <ServerStatusProvider>
            <ProjectProvider>
              {/* … existing tree, indented one level … */}
            </ProjectProvider>
          </ServerStatusProvider>
        </SettingsProvider>
```

- [ ] **Step 7: Run the full suite and build**

Run: `npm test && npm run build`
Expected: PASS, build clean.

- [ ] **Step 8: Commit**

```bash
git add src/ai/dispatch.ts src/ai/dispatch.test.ts src/store/ServerStatusContext.tsx src/App.tsx
git commit -m "feat(client): server status context and OCR/correct dispatcher"
```

---

### Task 7: Route the batch runner and fix panel through the dispatcher

**Files:**
- Modify: `src/hooks/useBatchRunner.tsx:1-12` (imports), `:70-110` (the `start` body)
- Modify: `src/components/FixPanel.tsx:1-10` (imports), `:57-66` (the `run` body)

**Interfaces:**
- Consumes: `runOcrPage`, `runCorrectPage`, `effectiveConcurrency` from `src/ai/dispatch`; `useServerStatus` from `src/store/ServerStatusContext`.
- Produces: no new exports — behaviour change only.

- [ ] **Step 1: Switch the batch runner to the dispatcher**

In `src/hooks/useBatchRunner.tsx`, replace the two AI imports:

```ts
import { effectiveConcurrency, runOcrPage } from '../ai/dispatch';
import { useServerStatus } from '../store/ServerStatusContext';
```

(`createModel` and `ocrPage` are no longer imported here.)

Add the hook next to the other context reads at the top of `BatchRunnerProvider`:

```ts
  const { status: serverStatus } = useServerStatus();
```

In `start`, delete the `let model; try { model = createModel(settings); } catch { … }` preamble — model construction now happens inside the dispatcher, and a bad key surfaces as a per-page error through the existing retry path. Replace the `runBatch` call's `concurrency` and `work`:

```ts
    await runBatch({
      items: pageNums,
      concurrency: effectiveConcurrency(settings.batchSize, settings.route, serverStatus.available),
      signal: abortRef.current.signal,
      work: async (n, sig) => {
        const img = await renderPageToPng(loadedDoc, n);
        savePageImage(fileHash, n, img);
        const r = await runOcrPage({
          settings,
          serverAvailable: serverStatus.available,
          imageDataUrl: img.dataUrl,
          signal: sig,
        });
        return { ok: true as const, value: r };
      },
```

Everything below (`onProgress`, the pending reset, `setRunning(false)`) is unchanged.

- [ ] **Step 2: Switch the fix panel to the dispatcher**

In `src/components/FixPanel.tsx`, replace the `createModel`/`correctPage` imports with:

```ts
import { runCorrectPage } from '../ai/dispatch';
import { useServerStatus } from '../store/ServerStatusContext';
```

Add `const { status: serverStatus } = useServerStatus();` beside the other hooks, then in `run` replace the model construction and call:

```ts
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      savePageImage(fileHash, currentPageNum, img);
      const filled = substitute(prompt, { text: page.text });
      const { corrections: result, tokensIn, tokensOut } = await runCorrectPage({
        settings,
        serverAvailable: serverStatus.available,
        imageDataUrl: img.dataUrl,
        filledPrompt: filled,
        lang,
      });
```

The `hasApiKey` guard elsewhere in the file stays as is — it already returns true for `claude-cli`.

- [ ] **Step 3: Verify both modes by hand**

Browser-direct (must be unchanged): `npm run dev` with no `VITE_API_URL`, drop a PDF, OCR two pages with the gateway route.
Server mode: `cd server && npm run dev &`, then `VITE_API_URL=http://localhost:3102 npm run dev`, select the gateway route, OCR the same two pages. Both must produce text and token counts.

- [ ] **Step 4: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBatchRunner.tsx src/components/FixPanel.tsx
git commit -m "feat(client): run OCR and corrections through the server when available"
```

---

### Task 8: Settings UI, i18n and subscription cost display

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/CostSummary.tsx`
- Modify: `src/i18n/translations.ts` (both `en` and `he`)
- Create: `src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `useServerStatus` from `src/store/ServerStatusContext`; `modelsForRoute`/`isRouteModelValid` from `src/ai/providers`.
- Produces: no new exports.

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/translations.ts`, add to the `en` map:

```ts
  'route.claude-cli': 'Claude CLI (local subscription)',
  'settings.serverManaged': 'Keys are held by the server at {url} — nothing is stored in this browser.',
  'settings.serverOffline': 'Server not reachable at {url}. Using in-browser calls with your own key.',
  'settings.serverRetry': 'Retry connection',
  'settings.routeUnavailable': 'The saved provider is not available on this server; switched to {route}.',
  'cost.subscription': 'Tokens: {in} in / {out} out — billed to your Claude subscription',
```

And to the `he` map:

```ts
  'route.claude-cli': 'Claude CLI (מנוי מקומי)',
  'settings.serverManaged': 'המפתחות נשמרים בשרת בכתובת {url} — דבר אינו נשמר בדפדפן זה.',
  'settings.serverOffline': 'השרת בכתובת {url} אינו זמין. הקריאות מתבצעות מהדפדפן עם המפתח שלך.',
  'settings.serverRetry': 'נסה להתחבר שוב',
  'settings.routeUnavailable': 'הספק השמור אינו זמין בשרת זה; הוחלף ל-{route}.',
  'cost.subscription': 'טוקנים: {in} נכנס / {out} יוצא — נזקף למנוי Claude שלך',
```

- [ ] **Step 2: Write the failing test**

Create `src/components/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { SettingsProvider } from '../store/SettingsContext';
import { I18nProvider } from '../i18n/I18nContext';
import type { ServerStatus } from '../lib/api';

const status = vi.hoisted(() => ({ current: { available: false, claudeCli: false, routes: [] } as ServerStatus }));

vi.mock('../store/ServerStatusContext', () => ({
  useServerStatus: () => ({ status: status.current, probing: false, refresh: vi.fn() }),
}));

function renderPanel() {
  return render(
    <I18nProvider><SettingsProvider><SettingsPanel /></SettingsProvider></I18nProvider>,
  );
}

describe('SettingsPanel', () => {
  it('shows the API key field in browser-direct mode', () => {
    status.current = { available: false, claudeCli: false, routes: [] };
    renderPanel();
    expect(screen.getByPlaceholderText(/paste your key/i)).toBeTruthy();
    expect(screen.queryByText(/held by the server/i)).toBeNull();
  });

  it('replaces the key field with a server note in server mode', () => {
    status.current = { available: true, claudeCli: false, routes: ['gateway'] };
    renderPanel();
    expect(screen.queryByPlaceholderText(/paste your key/i)).toBeNull();
    expect(screen.getByText(/held by the server/i)).toBeTruthy();
  });

  it('hides claude-cli unless the server reports it', () => {
    status.current = { available: true, claudeCli: false, routes: ['gateway'] };
    renderPanel();
    expect(screen.queryByRole('option', { name: /Claude CLI/i })).toBeNull();
  });

  it('offers claude-cli when the server reports it', () => {
    status.current = { available: true, claudeCli: true, routes: ['gateway'] };
    renderPanel();
    expect(screen.getByRole('option', { name: /Claude CLI/i })).toBeTruthy();
  });
});
```

Install the testing library if it is not present: `npm i -D @testing-library/react @testing-library/dom`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/SettingsPanel.test.tsx`
Expected: FAIL — the key field renders in both modes and `claude-cli` is never offered.

- [ ] **Step 4: Make the route list dynamic**

In `src/components/SettingsPanel.tsx`, add the imports:

```ts
import { useEffect } from 'react';
import { useServerStatus } from '../store/ServerStatusContext';
import { API_BASE } from '../lib/api';
import { isRouteModelValid } from '../ai/providers';
```

Rename the static list and derive the visible one inside the component:

```ts
const BROWSER_ROUTES: Route[] = ['anthropic', 'google', 'openai', 'gateway'];
```

```tsx
  const { status, probing, refresh } = useServerStatus();
  const routes: Route[] = status.available
    ? [...status.routes, ...(status.claudeCli ? (['claude-cli'] as Route[]) : [])]
    : BROWSER_ROUTES;
```

Replace `ROUTES.map(...)` in the select with `routes.map(...)`.

Guard against a persisted route the current server cannot serve — without this, `resolveModelId` throws mid-run:

```tsx
  useEffect(() => {
    if (probing || routes.length === 0 || routes.includes(settings.route)) return;
    const fallback = routes[0];
    const models = modelsForRoute(fallback);
    update({
      route: fallback,
      model: models[0] as Model,
      batchSize: PROVIDER_BATCH_DEFAULTS[fallback],
    });
  }, [probing, routes, settings.route, update]);
```

Also make the model select self-heal when a stale model is paired with a valid route, by replacing `const models = modelsForRoute(settings.route);` with:

```tsx
  const models = modelsForRoute(settings.route);
  const modelValue = isRouteModelValid(settings.route, settings.model) ? settings.model : (models[0] as Model);
```

and using `value={modelValue}` on the model `<select>`.

- [ ] **Step 5: Swap the key field for the server note**

Replace the `{keyField && ( … )}` block from Task 1 with a three-way render:

```tsx
        {status.available ? (
          <p className="text-xs text-gray-500">{t('settings.serverManaged', { url: API_BASE })}</p>
        ) : keyField ? (
          <>
            {/* existing Label + link + input + settings.apiKeyNote, unchanged */}
          </>
        ) : null}
        {!status.available && API_BASE && !probing && (
          <p className="text-xs text-amber-700">
            {t('settings.serverOffline', { url: API_BASE })}{' '}
            <button type="button" className="underline" onClick={refresh}>
              {t('settings.serverRetry')}
            </button>
          </p>
        )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/SettingsPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Show CLI runs as subscription spend**

In `src/components/CostSummary.tsx`, a `cli-*` model must not render `$0.0000` as if it were a priced run. After the existing `cost` computation:

```tsx
  const isSubscription = settings.route === 'claude-cli';
  const fullText = isSubscription
    ? t('cost.subscription', { in: inStr, out: outStr })
    : t('cost.estimated', { in: inStr, out: outStr, cost: costStr });
```

and render the compact span as `{isSubscription ? '∞' : `$${costStr}`}`.

- [ ] **Step 8: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS, build clean.

- [ ] **Step 9: Commit**

```bash
git add src/components src/i18n/translations.ts
git commit -m "feat(client): server-aware settings, claude-cli route and subscription cost display"
```

---

### Task 9: Documentation and end-to-end verification

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Write `.env.example`**

`.env` is already gitignored, so the example file is the documentation:

```bash
# Vercel AI Gateway key — used by both the browser (paste in Settings) and the server.
AI_GATEWAY_API_KEY=

# Optional per-provider keys. A key present here adds that route to the
# server-mode provider list reported by GET /api/health.
# ANTHROPIC_API_KEY=
# GOOGLE_GENERATIVE_AI_API_KEY=
# OPENAI_API_KEY=

# Comma-separated CORS allowlist for the server. Defaults to the Vite dev origins.
# ALLOWED_ORIGINS=http://localhost:5173

# The claude CLI caps output at 32k tokens by default; the server raises it to 64k.
# CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000

# Client: point the app at the server. Leave unset for browser-direct mode
# (this is what the GitHub Pages build does).
# VITE_API_URL=http://localhost:3102
```

- [ ] **Step 2: Document the server in the README**

Add after the existing "Run locally" section:

````markdown
## Server mode (optional)

By default every LLM call runs in the browser with a key you paste into
Settings — that is what the GitHub Pages build does, and it is unchanged.

Running the optional server instead keeps the keys off the browser and unlocks
the **Claude CLI** route, which OCRs pages through your local `claude`
subscription at no per-token cost.

```bash
cd server && npm install && npm run dev   # :3102
VITE_API_URL=http://localhost:3102 npm run dev
```

The client probes `GET /api/health` on load. When it answers, Settings offers
only the providers the server has keys for, plus `Claude CLI` when a `claude`
binary is on its PATH, and the key field is replaced by a note. When it does
not answer, the app silently uses the in-browser path.

Concurrency is capped at 6 in server mode (browsers allow ~6 connections per
origin) and at 2 for the Claude CLI route (one subprocess per page).
````

- [ ] **Step 3: Full end-to-end verification**

1. `cd server && npm test && npm run typecheck` — all green.
2. From the repo root: `npm test && npm run build` — all green.
3. `cd server && npm run dev &` then `VITE_API_URL=http://localhost:3102 npm run dev`.
4. Drop a real Hebrew PDF, select the **Claude CLI** route with `cli-sonnet`, OCR 4 pages. Expect Hebrew text on every page, the cost chip reading "billed to your Claude subscription", and at most 2 pages in flight at a time.
5. Reload the tab mid-run, restore the job from the jobs list, and confirm completed pages come back and the remaining ones are still selectable as pending — crash recovery must be untouched by this work.
6. Stop the server, reload, confirm Settings falls back to the browser routes with the key field back and an "offline" notice.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document optional server mode and the claude-cli route"
```

---

## Self-Review

**Spec coverage:** server package + port + env (Task 2); health/routes/claudeCli probe (Task 2); `/api/ocr` + `/api/correct` with the 15MB cap and raw-base64 transport (Task 4); CORS (Task 2); `shared/ai/` with the re-export shims (Task 1); model registry + `cli-*` models + zero pricing (Task 1); Claude CLI settings incl. `streamingInput: "always"` (Task 3, asserted in test); client `api.ts` + `fetch-with-timeout` (Task 5); dispatcher + 6/2 concurrency clamp (Task 6); batch runner + fix panel wiring (Task 7); settings UI, i18n en+he, offline fallback, unavailable-route recovery, subscription cost (Task 8); README/.env.example + end-to-end check (Task 9). Non-goals (crash recovery, deploy workflow) are asserted untouched in Task 9 step 3.

**Type consistency:** `ServerStatus { available, claudeCli, routes }` is produced in Task 5 and consumed unchanged in Tasks 6 and 8. `costSource: 'provider' | 'claude-cli'` is produced by the server in Task 4 and typed as `CostSource` in Task 5. `effectiveConcurrency(batchSize, route, serverAvailable)` keeps the same signature in Tasks 6 and 7. `runOcrPage`/`runCorrectPage` argument objects match their call sites. `pageRequestSchema` is exported in Task 4 and extended by `correct.ts` in the same task.
