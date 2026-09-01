# llm_ocr_web

Static, browser-based app that OCRs Hebrew/Jewish texts using vision LLMs
(Anthropic, Google, OpenAI, Vercel AI Gateway), provides a side-by-side
image + text editor with LLM-driven proofread suggestions as accept/reject
diff cards, and exports the result as DOCX.


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

The server has no authentication and it holds the keys, so it binds `127.0.0.1`
by default. Read the `HOST` note in `.env.example` before exposing it.

See `.env.example` for the server's environment variables.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds with
`VITE_BASE=/llm_ocr_web/` and publishes `dist/` on every push to `main` or
`master`. Set GitHub Pages source to "GitHub Actions" in repo settings.

## Licence
MIT
