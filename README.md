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
