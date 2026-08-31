# Server-Side OCR + Claude CLI Route — Design

**Date:** 2026-08-31
**Status:** Approved
**Scope:** new `server/` package, new `shared/ai/`, client call path and settings UI.

## Problem

Every LLM call in llm_ocr runs in the browser: `useBatchRunner` and `FixPanel`
build a model with `createModel(settings)` and call the provider SDK directly
with an API key read from `localStorage`. Two consequences:

1. **Keys live in the browser.** `settings.apiKeyNote` promises "Stored in your
   browser's localStorage only. Never sent to a server." — true, but it means
   every user pastes a real provider key into a web page, and the Anthropic
   route needs `anthropic-dangerous-direct-browser-access: true` to work at all.
2. **The Claude CLI is unreachable.** `ai-sdk-provider-claude-code` drives a
   local `claude` subprocess, which a browser cannot spawn. The Pro/Max
   subscription that already pays for OCR-grade models elsewhere on this box
   (`Mugah/server`) can't be used here.

## Goals

- Route LLM calls through a server that holds the keys, so the browser never
  sees one.
- Add a `claude-cli` route that OCRs pages through the local `claude` CLI at no
  per-token cost.
- Keep the existing static GitHub Pages deployment working, unchanged, with
  today's browser-direct behaviour.

## Non-goals

- **Crash recovery / session restore.** Already implemented and at parity with
  `Mugah`'s `2026-07-08-pdf-proofread-session-restore-design.md`:
  `persistence.ts`, `pageImagesStore.ts`, `runLogStore.ts` and `jobs.ts`
  persist page results, rendered page PNGs, run log and page order to IndexedDB
  keyed by file hash; `reloadJob.ts` restores a job without needing the original
  PDF; `JobsList` is the restore surface; `pendingPages`/`failedPages` drive
  continue-where-you-left-off. `'running'` is never written to IndexedDB (only
  `ok` and `error` reach `savePageResult`), so Mugah's `running → pending`
  downgrade rule is a fix this codebase does not need. **No changes here.**
- Moving batch orchestration to the server (no job store, no resumable
  server-side runs).
- Authentication, usage metering, or multi-user access control.
- Changing the OCR or correction prompts, the editor, or the DOCX export.

## Decisions (user-confirmed)

1. **Separate `server/` package**, mirroring `Mugah/server`. The client reaches
   it via `VITE_API_URL`; when that is unset the client uses today's
   browser-direct path, so the GitHub Pages build is unaffected.
2. **`claude-cli` is a route in the UI**, shown only when the server reports the
   CLI is available — not a silent `AI_PROVIDER` env override as in Mugah.
3. **Keys live in the server's `.env`.** The client sends no keys in server
   mode; the Settings key field becomes a read-only "managed by server" note.
4. **Batching stays client-side.** The server exposes stateless per-page
   endpoints; `runBatch`, retries, abort, run log and IndexedDB persistence are
   untouched.

## Architecture

### Server package: `llm_ocr/server/`

Hono + `@hono/node-server` + `tsx watch`, port **3102** (`Mugah/server` holds
3101). `server/src/env.ts` loads `../.env` via dotenv with `override: true`,
exactly as `Mugah/server/src/env.ts` does — `llm_ocr/.env` already carries
`AI_GATEWAY_API_KEY`.

```
server/
  package.json  tsconfig.json  vitest.config.ts
  src/
    index.ts        # serve() on PORT || 3102
    env.ts          # dotenv config({ path: "../.env", override: true })
    app.ts          # cors + logger + routes
    ai/providers.ts # server-side createModel, incl. claude-cli
    ai/claude-cli.ts# lazy provider import + availability probe
    routes/health.ts routes/ocr.ts routes/correct.ts
```

#### Endpoints

`GET /api/health` →
```ts
{ status: "ok", claudeCli: boolean, routes: Route[] }
```
`routes` lists only providers whose key is present in the server env
(`ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`,
`AI_GATEWAY_API_KEY`). Today only the gateway key is set, so a server-mode UI
will offer `gateway` and — when the CLI probe passes — `claude-cli`. That is
expected, not a bug; adding a key to `.env` adds the route.

`claudeCli` is resolved once at server start by running `claude --version` with
a 5s timeout and caching the boolean. A missing CLI must never break the other
routes.

`POST /api/ocr`
```ts
// request
{ route: Route, model: Model, image: string, imageMediaType: "image/png" | "image/jpeg", prompt: string }
// response
{ text: string, tokensIn?: number, tokensOut?: number, costSource: "provider" | "claude-cli" }
```

`POST /api/correct`
```ts
// request
{ route, model, image, imageMediaType, prompt, lang: "en" | "he" }
// response
{ corrections: Correction[], tokensIn?, tokensOut?, costSource }
```

Bodies are zod-validated. The image field carries **raw base64, not a data
URL**, and is capped at `z.string().min(1).max(15_000_000)` — the same bound as
`Mugah/server/src/routes/pdf-proofread.ts:21`. The client strips the `data:`
prefix before sending.

Responses are plain JSON. Mugah uses `streamSSE` because one POST covers a whole
batch; here one POST is one page, so per-page granularity already gives
progress. If a reverse proxy ever cuts a long `claude-cli` call, Mugah's
`parseSseBlock` (`client/src/pdf-proofread/api/run.ts`) is a drop-in retrofit.

#### CORS

Mugah gets CORS from `vercel.json` response headers. This server needs
`hono/cors` with an explicit origin allowlist: the Vite dev origin and the
GitHub Pages origin, from `ALLOWED_ORIGINS` (comma-separated) with a
localhost-only default.

### Shared code: `llm_ocr/shared/ai/`

The call layer is already browser-agnostic — `ocr.ts`, `correct.ts` and
`pricing.ts` take a `LanguageModel` and touch no DOM API. They move to
`shared/ai/` so client and server run identical code:

| File | Contents |
|---|---|
| `shared/ai/types.ts` | `Route`, `Model`, `Correction` |
| `shared/ai/models.ts` | `DIRECT_MODEL_ID`, `isRouteModelValid`, `resolveModelId`, `modelsForRoute` |
| `shared/ai/pricing.ts` | `Rate`, `rateFor`, `estimateCost` |
| `shared/ai/ocr.ts` | `ocrPage` |
| `shared/ai/correct.ts` | `correctionSystemPrompt`, `parseCorrections`, `correctPage` |

Provider *construction* stays split, because the two sides build models from
different inputs: `src/ai/providers.ts` keeps browser key handling unchanged,
and `server/src/ai/providers.ts` builds from server env plus the CLI provider.

To keep the diff small, the moved modules keep their old paths as re-export
shims (`src/ai/ocr.ts` → `export * from '../../shared/ai/ocr'`), so the ~20
existing import sites and the existing tests in `src/ai/*.test.ts` continue to
work untouched. `src/lib/types.ts` re-exports `Route`/`Model`/`Correction` from
shared and keeps `Settings`, `ApiKeys`, `PageResult`, `RunRecord`, `Status`,
`FixMode` — those are client concepts.

Wiring: `tsconfig.json` `include` gains `"shared"` and a `@shared/*` path;
`vite.config.ts` and `vitest.config.ts` gain the matching alias; the server
tsconfig references `../shared`.

### Model registry additions

```ts
'claude-cli': {
  'cli-opus':   'opus',
  'cli-sonnet': 'sonnet',
  'cli-haiku':  'haiku',
  'cli-fable':  'fable',
}
```

`Route` gains `'claude-cli'`; `Model` gains `cli-opus | cli-sonnet | cli-haiku |
cli-fable`. `opus`/`sonnet`/`haiku` are the provider's validated aliases
(`ClaudeCodeModelId`); `fable` is passed as a custom model string, the same way
`Mugah/server/src/lib/ai-model.ts` does for its high-accuracy pdf-proofread
tier.

`pricing.ts` gets `cli-*` entries at zero rates, so `estimateCost` returns 0
instead of throwing on an unknown model.

### Claude CLI settings

Copied from `Mugah/server/src/lib/ai-model.ts`, verified against the installed
`ai-sdk-provider-claude-code@3.5.0`:

```ts
claudeCode(aliasFor(model), {
  effort: "high",
  tools: [],                     // plain text-in/text-out, no tool loop
  streamingInput: "always",      // MANDATORY — see below
  env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || "64000" },
})
```

- `streamingInput: "always"` is **required, not tuning**. The provider forwards
  image parts to the subprocess only in streaming-input mode; without it the
  page image is silently dropped with a warning and OCR returns nothing useful.
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS` defaults to 32k in the CLI, and the provider
  ignores the AI-SDK `maxOutputTokens` param. 64k gives headroom for a dense
  Hebrew page plus footnote block.
- The provider is imported lazily and memoised, so the other routes work when
  the CLI is absent.
- Usage **is** reported (`input_tokens` / `output_tokens` are converted by the
  provider), so token counts still display for CLI runs.

### Client changes

**`src/lib/api.ts` (new)**

```ts
export const API_BASE = import.meta.env.VITE_API_URL ?? '';
export interface ServerStatus { available: boolean; claudeCli: boolean; routes: Route[] }
export async function probeServer(): Promise<ServerStatus>
export async function ocrPageViaServer(...): Promise<OcrResult & { costSource }>
export async function correctPageViaServer(...): Promise<CorrectPageResult & { costSource }>
```

`probeServer` runs once on mount (in `SettingsContext`) and returns
`{ available: false }` when `API_BASE` is empty or the probe fails; a manual
retry is exposed in Settings.

**`src/lib/fetch-with-timeout.ts` (new)** — copied verbatim from
`Mugah/client/src/lib/fetch-with-timeout.ts`, including `LONG_TIMEOUT`
(~13 min), used for both AI endpoints. Plain `fetch` has no timeout, and a hung
CLI subprocess would otherwise occupy one of the six connection slots forever.

**Dispatcher** — `useBatchRunner.tsx` and `FixPanel.tsx` stop calling
`createModel` directly. Both go through a dispatcher that picks the server path
when `ServerStatus.available`, else today's in-browser path. `runBatch`,
retry/abort semantics, run-log lines and persistence calls are unchanged.

### Concurrency clamp — required for correctness

`PROVIDER_BATCH_DEFAULTS.gateway` is **50** today. That is safe for
browser-direct calls, which fan out to a provider over HTTP/2. Once every call
is a POST to *our* origin, 50 long-lived requests queue behind the browser's
~6-connections-per-origin limit and fail as "Failed to fetch" — the exact
failure documented at `Mugah/client/src/pdf-proofread/runner/orchestrator.ts`
(`CLIENT_CONCURRENCY = 6`).

Therefore, in server mode the effective concurrency is
`Math.min(settings.batchSize, 6)`, and `2` for `claude-cli` (one subprocess per
page). `PROVIDER_BATCH_DEFAULTS['claude-cli'] = 2`. The clamp applies at the
call site, so the stored `batchSize` is preserved for browser-direct mode.

### Settings UI

- The route dropdown is built from `ServerStatus.routes` in server mode, and
  from the current static list otherwise. `claude-cli` appears only when
  `status.claudeCli` is true.
- When server mode is active, the API-key input is replaced by a
  "managed by server" note; `settings.apiKeyNote`'s "Never sent to a server"
  wording gets a server-mode variant.
- If a persisted `settings.route` is unavailable (e.g. `claude-cli` saved, then
  the server goes away), the panel shows an offline notice and falls back to a
  valid route rather than throwing from `resolveModelId`.
- New i18n keys in **both** `en` and `he`: `route.claude-cli`,
  `settings.serverManaged`, `settings.serverOffline`, `settings.serverRetry`.

### Cost reporting

Responses carry `costSource`. For `claude-cli`, `CostSummary` shows the token
counts with a "subscription" label and `$0.00` rather than a fabricated dollar
figure. Borrowed from Mugah's `CallCost.source`.

## Error handling

- Server maps provider/CLI errors to `{ error: string }` with 4xx for validation
  and 5xx for provider failures; the client surfaces `error` through the
  existing per-page error path, so `runBatch`'s 3-attempt retry and the run log
  behave as they do today.
- Oversized images are rejected client-side *before* the request with a
  page-numbered message, so the user never sees a bare 413.
- A failed health probe degrades to browser-direct mode; it never blocks a run.
- **Accepted risk:** a page whose OCR completed server-side but whose response
  never arrived (crash or abort in flight) is re-run and re-paid on continue.
  Mugah accepted the same trade-off; it is small and rare.

## Testing

**Server** (vitest, node env)
- `providers.test.ts` — route→model resolution; the `claude-cli` settings object
  asserted field-by-field (`effort`, `tools: []`, `streamingInput: 'always'`,
  `env`), mirroring `Mugah/server/src/lib/ai-model.test.ts`'s `__claudeCode`
  mock; unknown route/model rejected; missing key produces a clear error.
- `routes.test.ts` — zod rejection of oversized/missing image, bad route/model,
  bad `lang`; success shape incl. `costSource`; health reports the probed CLI
  flag and only key-backed routes.

**Client**
- `api.test.ts` — data-URL prefix stripped; `LONG_TIMEOUT` applied; non-OK
  response surfaces server `error` text; probe failure yields
  `{ available: false }`.
- `dispatcher.test.ts` — server path chosen when available, browser path
  otherwise; concurrency clamped to 6 (and 2 for `claude-cli`) in server mode
  and left alone in browser-direct mode.
- `SettingsPanel` — `claude-cli` hidden unless reported; key field replaced in
  server mode; unavailable persisted route falls back without throwing.

**Regression** — the existing suite must stay green untouched, which the
re-export shims guarantee.

## Deployment

- `cd server && npm run dev` (tsx watch, :3102). A pm2 entry alongside
  `zoharia-server` is possible later; not part of this work.
- Client dev: `VITE_API_URL=http://localhost:3102` in `.env.local`.
- `.github/workflows/deploy.yml` is **unchanged**. `VITE_API_URL` is unset in
  CI, so the Pages build keeps today's browser-direct behaviour.
- `.env` additions: `ALLOWED_ORIGINS`, optional `CLAUDE_CODE_MAX_OUTPUT_TOKENS`,
  optional per-provider keys. `.gitignore` already covers `.env`.
