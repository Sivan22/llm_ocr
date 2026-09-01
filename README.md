# llm_ocr_web

Browser-based app that OCRs Hebrew/Jewish texts using vision LLMs (Anthropic,
Google, OpenAI, Vercel AI Gateway), provides a side-by-side image + text editor
with LLM-driven proofread suggestions as accept/reject diff cards, and exports
the result as DOCX.

It runs as a pure static site by default: you paste your own API key and every
call goes straight from the browser to the provider. An optional local server
(see [Server mode](#server-mode-optional)) keeps the keys off the browser and
adds a **Claude CLI** route that OCRs pages through your local `claude`
subscription instead of billing per token.

## Run locally

```bash
npm install
npm run dev
```

## Server mode (optional)

By default every LLM call runs in the browser with a key you paste into
Settings — that is what the GitHub Pages build does, and it is unchanged.

Running the optional server instead keeps the keys off the browser and unlocks
the **Claude CLI** route, which OCRs pages through your local `claude`
subscription at no per-token cost.

Both processes stay in the foreground, so run them in **two terminals**:

```bash
# terminal 1 — the API server on :3102
cd server && npm install && npm run dev
```

```bash
# terminal 2 — the app, pointed at it
VITE_API_URL=http://localhost:3102 npm run dev
```

The client probes `GET /api/health` on load. When it answers, Settings offers
only the providers the server has keys for, plus `Claude CLI` when a `claude`
binary is on its PATH, and the key field is replaced by a note. When it does
not answer, the app silently uses the in-browser path.

Concurrency is capped at 6 in server mode (browsers allow ~6 connections per
origin) and at 2 for the Claude CLI route (one subprocess per page).

The server has no authentication and it holds the keys, so it binds `127.0.0.1`
by default. Read the `HOST` note in `.env.example` before exposing it.

See `.env.example` for the server's environment variables.

## Build

```bash
npm run build
```

## Test

```bash
npm test              # client
cd server && npm test # server
```

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds with
`VITE_BASE=/llm_ocr/` and publishes `dist/` on every push to `main` or
`master`. Set GitHub Pages source to "GitHub Actions" in repo settings.

`VITE_API_URL` is unset in CI, so the published site keeps the browser-direct
behaviour — the server is a local-only option and is never part of the deploy.

## Licence
MIT
