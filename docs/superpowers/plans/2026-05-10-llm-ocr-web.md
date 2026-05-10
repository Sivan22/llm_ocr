# llm_ocr_web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages SPA that OCRs Hebrew PDFs/images via vision LLMs (Anthropic, Google, OpenAI, Vercel AI Gateway), provides a side-by-side image+text editor with LLM-driven proofread suggestions as accept/reject diff cards, and exports the final result as DOCX.

**Architecture:** Vite + React 19 + TypeScript + Tailwind v4. Three layers: thin AI/PDF boundary modules, a UI-free orchestrator core (parallel batch runner with `AbortController` + retries), and React contexts (settings + project) feeding component trees. Persistence is split: settings/runHistory in localStorage, page OCR results in IndexedDB keyed by file SHA-256.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`), `mupdf` (WASM), `docx`, `marked`, `diff`, `idb`, Vitest, `fake-indexeddb`.

**Reference projects:** `~/llm_ocr/main.py` (Flet desktop — source of OCR/correction prompts and accept/reject UX) and `~/pdf_proofread` (source of Vite+React+Tailwind+AI SDK+mupdf scaffolding and many code patterns).

**Working directory:** `/root/llm_ocr_web` (repo already initialized; spec committed at `docs/superpowers/specs/2026-05-10-llm-ocr-web-design.md`).

---

## File structure

```
llm_ocr_web/
├── .github/workflows/deploy.yml
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── ai/
│   │   ├── providers.ts
│   │   ├── pricing.ts
│   │   ├── ocr.ts
│   │   └── correct.ts
│   ├── pdf/
│   │   ├── render.ts
│   │   └── hash.ts
│   ├── runner/
│   │   ├── prompt.ts
│   │   └── orchestrator.ts
│   ├── store/
│   │   ├── settings.ts
│   │   ├── persistence.ts
│   │   ├── runHistory.ts
│   │   ├── ProjectContext.tsx
│   │   └── SettingsContext.tsx
│   ├── docx/
│   │   ├── markdown.ts
│   │   └── export.ts
│   ├── lib/
│   │   ├── diff.ts
│   │   └── utils.ts
│   └── components/
│       ├── ui/                ← shadcn primitives (copied from pdf_proofread)
│       ├── ErrorBoundary.tsx
│       ├── FileDrop.tsx
│       ├── SettingsPanel.tsx
│       ├── PromptEditor.tsx
│       ├── PageList.tsx
│       ├── BatchRunner.tsx
│       ├── PageImage.tsx
│       ├── OcrTextarea.tsx
│       ├── DiffCard.tsx
│       ├── FixPanel.tsx
│       ├── EditorView.tsx
│       ├── CostSummary.tsx
│       ├── RunHistory.tsx
│       └── ExportPanel.tsx
└── tests/                     ← (Vitest finds *.test.ts colocated, no separate dir)
```

---

# Phase 1 — Project scaffolding

### Task 1: Initialize package.json and tooling configs

**Files:**
- Create: `/root/llm_ocr_web/package.json`
- Create: `/root/llm_ocr_web/.gitignore`
- Create: `/root/llm_ocr_web/tsconfig.json`
- Create: `/root/llm_ocr_web/tsconfig.node.json`
- Create: `/root/llm_ocr_web/vite.config.ts`
- Create: `/root/llm_ocr_web/index.html`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "llm-ocr-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/google": "^3.0.39",
    "@ai-sdk/openai": "^3.0.0",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tabs": "^1.1.13",
    "ai": "^6.0.168",
    "buffer": "^6.0.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "diff": "^7.0.0",
    "docx": "^9.0.0",
    "idb": "^8.0.0",
    "lucide-react": "^1.11.0",
    "marked": "^14.0.0",
    "mupdf": "^1.3.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.4",
    "@types/diff": "^7.0.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "fake-indexeddb": "^6.0.0",
    "tailwindcss": "^4.2.4",
    "typescript": "^5.6.3",
    "vite": "^8.0.0",
    "vitest": "^4.1.0"
  },
  "vitest": {
    "environment": "node"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.local
.env
.env.local
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`** (copy of pdf_proofread's pattern)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['mupdf'] },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM OCR</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Install and verify build runs**

```bash
cd /root/llm_ocr_web && npm install
```

Expected: dependencies install without resolution errors. Don't run `npm run build` yet — there's no `src/` content.

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore tsconfig.json tsconfig.node.json vite.config.ts index.html package-lock.json
git commit -m "chore: scaffold Vite + React + Tailwind project"
```

---

### Task 2: Tailwind, App entry, and minimal "Hello" rendering

**Files:**
- Create: `/root/llm_ocr_web/src/main.tsx`
- Create: `/root/llm_ocr_web/src/App.tsx`
- Create: `/root/llm_ocr_web/src/index.css`
- Create: `/root/llm_ocr_web/src/vite-env.d.ts`

- [ ] **Step 1: Write `src/index.css`**

```css
@import "tailwindcss";

html, body, #root {
  height: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 2: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Write `src/App.tsx` (placeholder, replaced in later tasks)**

```tsx
export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">LLM OCR</h1>
      <p className="text-gray-600">Scaffolding online.</p>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: Verify build succeeds**

```bash
cd /root/llm_ocr_web && npm run build
```

Expected: `tsc` passes; Vite emits `dist/index.html` and `dist/assets/*`.

- [ ] **Step 6: Commit**

```bash
git add src/ dist/
# dist/ should NOT be committed; remove if accidentally added:
git reset HEAD dist/ 2>/dev/null || true
git add src/
git commit -m "feat: app entry + tailwind boot"
```

---

### Task 3: GitHub Pages deploy workflow

**Files:**
- Create: `/root/llm_ocr_web/.github/workflows/deploy.yml`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run build
        env:
          VITE_BASE: /llm_ocr_web/

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Pages deploy workflow"
```

---

# Phase 2 — Core types and settings

### Task 4: Core types module

**Files:**
- Create: `/root/llm_ocr_web/src/lib/types.ts`

- [ ] **Step 1: Write `src/lib/types.ts`**

```ts
export type Route = 'anthropic' | 'google' | 'openai' | 'gateway';

export type Model =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'gemini-3.1-pro'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export type Status = 'pending' | 'running' | 'ok' | 'error' | 'edited';

export type FixMode = 'general' | 'headers' | 'punctuation' | 'custom';

export interface PageResult {
  pageNum: number;        // 0-indexed
  text: string;
  status: Status;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface Correction {
  id: string;
  old: string;
  new: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
  gateway: string;
}

export interface Settings {
  version: 1;
  route: Route;
  model: Model;
  apiKeys: ApiKeys;
  batchSize: number;
  prompts: {
    ocr: string;
    general: string;
    headers: string;
    punctuation: string;
    custom: string;
  };
}

export interface RunRecord {
  id: string;
  ts: number;
  fileName: string;
  pagesOk: number;
  pagesFailed: number;
  route: Route;
  model: Model;
  costUsd?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: core type definitions"
```

---

### Task 5: Settings store (localStorage with versioned schema)

**Files:**
- Create: `/root/llm_ocr_web/src/store/settings.ts`
- Create: `/root/llm_ocr_web/src/store/settings.test.ts`

The default OCR prompt and the three default correction prompts come verbatim from `~/llm_ocr/main.py` (`DEFAULT_PROMPT` and `CORRECTION_PROMPTS`). Custom prompt defaults to empty.

- [ ] **Step 1: Write the failing test**

```ts
// src/store/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

beforeEach(() => {
  localStorage.clear();
});

describe('settings store', () => {
  it('returns defaults when storage is empty', () => {
    const s = loadSettings();
    expect(s.version).toBe(1);
    expect(s.route).toBe('gateway');
    expect(s.batchSize).toBeGreaterThan(0);
    expect(s.prompts.ocr).toContain('OCR');
    expect(s.prompts.custom).toBe('');
  });

  it('round-trips multi-line prompts', () => {
    const s = { ...DEFAULT_SETTINGS };
    s.prompts.ocr = 'line1\nline2\nline3';
    saveSettings(s);
    expect(loadSettings().prompts.ocr).toBe('line1\nline2\nline3');
  });

  it('returns defaults on corrupt JSON', () => {
    localStorage.setItem('llm_ocr_web:settings:v1', '{not json');
    const s = loadSettings();
    expect(s.version).toBe(1);
  });

  it('merges with defaults when stored object is partial', () => {
    localStorage.setItem(
      'llm_ocr_web:settings:v1',
      JSON.stringify({ version: 1, route: 'anthropic' }),
    );
    const s = loadSettings();
    expect(s.route).toBe('anthropic');
    expect(s.apiKeys.anthropic).toBe(''); // default
    expect(s.prompts.ocr).toContain('OCR'); // default
  });
});
```

Vitest needs a DOM-like environment for `localStorage`. Configure that next.

- [ ] **Step 2: Add jsdom to vitest config**

Edit `/root/llm_ocr_web/package.json` — change the existing `"vitest"` block at the bottom:

```json
  "vitest": {
    "environment": "jsdom"
  }
```

Add `"jsdom": "^25.0.0"` to `devDependencies`. Run:

```bash
cd /root/llm_ocr_web && npm install
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/settings.test.ts
```

Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 4: Write `src/store/settings.ts`**

```ts
import type { Settings } from '../lib/types';

const STORAGE_KEY = 'llm_ocr_web:settings:v1';

const DEFAULT_OCR_PROMPT =
  "OCR this, this is an old jewish Chassidus book written in old Rashi script. " +
  "it has two columns, RTL. first read the right column, then the left one. " +
  "provide all the text ברצף, in the most accurate way possible." +
  "omit the page numbers and page headers, only the main text. RETURN ONLY THE RAW TEXT, DO NOT RETURN ANY EXPLANATIONS OR APOLOGIES OR ANYTHING ELSE, JUST THE RAW OCR TEXT." +
  "you can mark the inner headers (like 'פרק א') or bold words to separate them from the main text, but do not mark the page headers or page numbers. ";

const DEFAULT_GENERAL_PROMPT =
  "You are an OCR correction assistant for Hebrew text from a Chassidus book. " +
  "Compare the OCR text below with the page image and find any OCR errors: " +
  "wrong letters (ד/ר, ב/כ, etc.), missing/extra/merged/split words, " +
  "line break issues, nikud problems.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (the exact incorrect text as it appears), "new" (the corrected text), ' +
  'and "reason" (brief explanation in English). Example:\n' +
  '[{"old": "שלומ", "new": "שלום", "reason": "wrong final letter"}]\n\n' +
  "If no corrections are needed, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

const DEFAULT_HEADERS_PROMPT =
  "You are an OCR formatting assistant for Hebrew Chassidus text. " +
  "Compare the OCR text below with the page image. Identify section headers, " +
  "chapter titles (like פרק א, סימן ב), and any bold or emphasized text in the image. " +
  "For each header found, provide the raw text as 'old' and the same text wrapped " +
  "with **bold markers** as 'new'. Also split headers onto their own line if they are " +
  "merged into a paragraph.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (exact text as it appears), "new" (text with header marking/separation), ' +
  'and "reason" (e.g. "section header", "chapter title"). Example:\n' +
  '[{"old": "פרק א בענין", "new": "**פרק א**\\nבענין", "reason": "chapter title merged into text"}]\n\n' +
  "If no headers are found, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

const DEFAULT_PUNCTUATION_PROMPT =
  "You are an OCR correction assistant for Hebrew text. Focus ONLY on punctuation issues " +
  "in the OCR text below compared to the page image: wrong or missing punctuation marks, " +
  "parentheses, גרשיים (quotation marks), colons, periods, commas, etc.\n\n" +
  "OCR Text:\n{text}\n\n" +
  "Return ONLY a JSON array of corrections. Each correction must be an object with " +
  '"old" (exact incorrect text), "new" (corrected text), and "reason" (what punctuation issue was found).\n' +
  "If no corrections are needed, return an empty array: []\n" +
  "Return ONLY the JSON array, no markdown, no explanations.";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  route: 'gateway',
  model: 'gemini-3.1-pro',
  apiKeys: { anthropic: '', google: '', openai: '', gateway: '' },
  batchSize: 8,
  prompts: {
    ocr: DEFAULT_OCR_PROMPT,
    general: DEFAULT_GENERAL_PROMPT,
    headers: DEFAULT_HEADERS_PROMPT,
    punctuation: DEFAULT_PUNCTUATION_PROMPT,
    custom: '',
  },
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      version: 1,
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(parsed.apiKeys ?? {}) },
      prompts: { ...DEFAULT_SETTINGS.prompts, ...(parsed.prompts ?? {}) },
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / disabled storage — silently drop
  }
}

function cloneDefaults(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/settings.test.ts
```

Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/store/settings.ts src/store/settings.test.ts package.json package-lock.json
git commit -m "feat: settings store with versioned localStorage"
```

---

### Task 6: Provider factory

**Files:**
- Create: `/root/llm_ocr_web/src/ai/providers.ts`
- Create: `/root/llm_ocr_web/src/ai/providers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/providers.test.ts
import { describe, it, expect } from 'vitest';
import { isRouteModelValid, resolveModelId, createModel } from './providers';
import type { Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../store/settings';

describe('providers', () => {
  it('resolves direct anthropic model id', () => {
    expect(resolveModelId('anthropic', 'claude-opus-4-7')).toBe('claude-opus-4-7');
  });

  it('resolves gateway model id with prefix', () => {
    expect(resolveModelId('gateway', 'claude-opus-4-7')).toBe('anthropic/claude-opus-4-7');
    expect(resolveModelId('gateway', 'gemini-3.1-pro')).toBe('google/gemini-3.1-pro-preview');
    expect(resolveModelId('gateway', 'gpt-4o')).toBe('openai/gpt-4o');
  });

  it('rejects invalid route+model pairs', () => {
    expect(isRouteModelValid('anthropic', 'gemini-3.1-pro')).toBe(false);
    expect(() => resolveModelId('anthropic', 'gemini-3.1-pro')).toThrow();
  });

  it('createModel throws when key for active route is missing', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, route: 'anthropic', model: 'claude-opus-4-7' };
    s.apiKeys = { anthropic: '', google: '', openai: '', gateway: '' };
    expect(() => createModel(s)).toThrow(/Anthropic API key/);
  });

  it('createModel succeeds with key present', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, route: 'gateway', model: 'gemini-3.1-pro' };
    s.apiKeys = { anthropic: '', google: '', openai: '', gateway: 'sk-test' };
    expect(() => createModel(s)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/providers.test.ts
```

Expected: FAIL — `Cannot find module './providers'`.

- [ ] **Step 3: Write `src/ai/providers.ts`**

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Model, Route, Settings } from '../lib/types';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: {
    'claude-opus-4-7':   'claude-opus-4-7',
    'claude-sonnet-4-6': 'claude-sonnet-4-6',
  },
  google: {
    'gemini-3.1-pro': 'gemini-3.1-pro-preview',
  },
  openai: {
    'gpt-4o':      'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
  },
  gateway: {
    'claude-opus-4-7':   'anthropic/claude-opus-4-7',
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
    'gemini-3.1-pro':    'google/gemini-3.1-pro-preview',
    'gpt-4o':            'openai/gpt-4o',
    'gpt-4o-mini':       'openai/gpt-4o-mini',
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

export function createModel(settings: Settings): LanguageModel {
  const id = resolveModelId(settings.route, settings.model);
  switch (settings.route) {
    case 'anthropic': {
      const key = settings.apiKeys.anthropic;
      if (!key) throw new Error('Anthropic API key is required.');
      const provider = createAnthropic({
        apiKey: key,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return provider(id);
    }
    case 'google': {
      const key = settings.apiKeys.google;
      if (!key) throw new Error('Google API key is required.');
      return createGoogleGenerativeAI({ apiKey: key })(id);
    }
    case 'openai': {
      const key = settings.apiKeys.openai;
      if (!key) throw new Error('OpenAI API key is required.');
      return createOpenAI({ apiKey: key })(id);
    }
    case 'gateway': {
      const key = settings.apiKeys.gateway;
      if (!key) throw new Error('Gateway API key is required.');
      return createGateway({ apiKey: key })(id);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/providers.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers.ts src/ai/providers.test.ts
git commit -m "feat: provider factory for 4 routes"
```

---

### Task 7: Pricing module

**Files:**
- Create: `/root/llm_ocr_web/src/ai/pricing.ts`
- Create: `/root/llm_ocr_web/src/ai/pricing.test.ts`

Rates are USD per 1M tokens. Numbers chosen to match published list prices at spec-write time; engineer should NOT update them as part of this task.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { rateFor, estimateCost } from './pricing';

describe('pricing', () => {
  it('returns rates for known model', () => {
    const r = rateFor('claude-opus-4-7');
    expect(r.inputPerMillion).toBeGreaterThan(0);
    expect(r.outputPerMillion).toBeGreaterThan(0);
  });

  it('throws for unknown model', () => {
    expect(() => rateFor('made-up-model' as any)).toThrow();
  });

  it('computes cost from token counts', () => {
    const cost = estimateCost('claude-opus-4-7', { tokensIn: 1_000_000, tokensOut: 1_000_000 });
    const r = rateFor('claude-opus-4-7');
    expect(cost).toBeCloseTo(r.inputPerMillion + r.outputPerMillion, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/pricing.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/ai/pricing.ts`**

```ts
import type { Model } from '../lib/types';

export interface Rate { inputPerMillion: number; outputPerMillion: number; }

const RATES: Record<Model, Rate> = {
  'claude-opus-4-7':   { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0,  outputPerMillion: 15.0 },
  'gemini-3.1-pro':    { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-4o':            { inputPerMillion: 2.5,  outputPerMillion: 10.0 },
  'gpt-4o-mini':       { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export function rateFor(model: Model): Rate {
  const r = RATES[model];
  if (!r) throw new Error(`No pricing for model "${model}"`);
  return r;
}

export function estimateCost(model: Model, usage: { tokensIn: number; tokensOut: number }): number {
  const r = rateFor(model);
  return (usage.tokensIn / 1_000_000) * r.inputPerMillion +
         (usage.tokensOut / 1_000_000) * r.outputPerMillion;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/pricing.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/pricing.ts src/ai/pricing.test.ts
git commit -m "feat: pricing rates and cost estimator"
```

---

# Phase 3 — PDF and persistence

### Task 8: SHA-256 hash util

**Files:**
- Create: `/root/llm_ocr_web/src/pdf/hash.ts`

Trivial wrapper around `crypto.subtle`; no dedicated test (covered indirectly by persistence tests).

- [ ] **Step 1: Write `src/pdf/hash.ts`**

```ts
export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pdf/hash.ts
git commit -m "feat: sha256 hash util"
```

---

### Task 9: PDF render wrapper (mupdf)

**Files:**
- Create: `/root/llm_ocr_web/src/pdf/render.ts`

Thin wrapper. No unit tests (it's a thin upstream wrapper; verifying mupdf rendering belongs in manual testing).

- [ ] **Step 1: Write `src/pdf/render.ts`**

```ts
import * as mupdf from 'mupdf';

export interface PdfDoc {
  type: 'pdf';
  doc: mupdf.PDFDocument;
  pageCount: number;
}

export interface ImageDoc {
  type: 'images';
  pages: { dataUrl: string; mediaType: string }[];
  pageCount: number;
}

export interface CombinedDoc {
  type: 'combined';
  pdf: PdfDoc;            // pdf pages occupy [0, pdf.pageCount)
  images: ImageDoc;       // image pages occupy [pdf.pageCount, pageCount)
  pageCount: number;
}

export type LoadedDoc = PdfDoc | ImageDoc | CombinedDoc;

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf') as mupdf.PDFDocument;
  return { type: 'pdf', doc, pageCount: doc.countPages() };
}

export function imagesAsDoc(images: { bytes: Uint8Array; mediaType: string }[]): ImageDoc {
  const pages = images.map((img) => ({
    dataUrl: bytesToDataUrl(img.bytes, img.mediaType),
    mediaType: img.mediaType,
  }));
  return { type: 'images', pages, pageCount: pages.length };
}

export function combine(pdf: PdfDoc, images: ImageDoc): CombinedDoc {
  return { type: 'combined', pdf, images, pageCount: pdf.pageCount + images.pageCount };
}

export async function renderPageToPng(loaded: LoadedDoc, pageNum: number, dpi = 200): Promise<{ dataUrl: string; mediaType: string }> {
  if (loaded.type === 'images') {
    const p = loaded.pages[pageNum];
    if (!p) throw new Error(`Page ${pageNum} out of range`);
    return { dataUrl: p.dataUrl, mediaType: p.mediaType };
  }
  if (loaded.type === 'combined') {
    if (pageNum < loaded.pdf.pageCount) {
      return renderPageToPng(loaded.pdf, pageNum, dpi);
    }
    return renderPageToPng(loaded.images, pageNum - loaded.pdf.pageCount, dpi);
  }
  const page = loaded.doc.loadPage(pageNum);
  const matrix = mupdf.Matrix.scale(dpi / 72, dpi / 72);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();
  pixmap.destroy();
  page.destroy();
  return { dataUrl: bytesToDataUrl(png, 'image/png'), mediaType: 'image/png' };
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mediaType};base64,${btoa(bin)}`;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

Expected: no errors. (mupdf's TS types may differ slightly between versions; if there's a mismatch, update the call sites to match the installed types — keep the public surface stable.)

- [ ] **Step 3: Commit**

```bash
git add src/pdf/render.ts
git commit -m "feat: mupdf render wrapper"
```

---

### Task 10: IndexedDB persistence

**Files:**
- Create: `/root/llm_ocr_web/src/store/persistence.ts`
- Create: `/root/llm_ocr_web/src/store/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { savePageResult, loadAllPageResults, deleteFile } from './persistence';
import type { PageResult } from '../lib/types';

const A = 'aaaa';
const B = 'bbbb';

const result = (n: number, t: string): PageResult => ({
  pageNum: n, text: t, status: 'ok',
});

beforeEach(async () => {
  // fake-indexeddb resets per test? Force by deleting both files.
  await deleteFile(A); await deleteFile(B);
});

describe('persistence', () => {
  it('saves and reloads a page result', async () => {
    await savePageResult(A, result(0, 'hello'));
    const out = await loadAllPageResults(A);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('hello');
  });

  it('isolates results by fileHash', async () => {
    await savePageResult(A, result(0, 'A0'));
    await savePageResult(B, result(0, 'B0'));
    expect((await loadAllPageResults(A))[0].text).toBe('A0');
    expect((await loadAllPageResults(B))[0].text).toBe('B0');
  });

  it('returns sorted page results', async () => {
    await savePageResult(A, result(2, 'two'));
    await savePageResult(A, result(0, 'zero'));
    await savePageResult(A, result(1, 'one'));
    const out = await loadAllPageResults(A);
    expect(out.map((p) => p.pageNum)).toEqual([0, 1, 2]);
  });

  it('overwrites a page result on resave', async () => {
    await savePageResult(A, result(0, 'first'));
    await savePageResult(A, result(0, 'second'));
    const out = await loadAllPageResults(A);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('second');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/persistence.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/store/persistence.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { PageResult } from '../lib/types';

const DB_NAME = 'llm_ocr_web';
const DB_VERSION = 1;
const STORE = 'pageResults';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

function key(fileHash: string, pageNum: number): string {
  return `${fileHash}:${String(pageNum).padStart(6, '0')}`;
}

function rangeFor(fileHash: string): IDBKeyRange {
  return IDBKeyRange.bound(`${fileHash}:000000`, `${fileHash}:999999`);
}

export async function savePageResult(fileHash: string, result: PageResult): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE, result, key(fileHash, result.pageNum));
  } catch (err) {
    // Quota / disabled — silently degrade
    console.warn('persistence.savePageResult failed', err);
  }
}

export async function loadAllPageResults(fileHash: string): Promise<PageResult[]> {
  try {
    const d = await db();
    const tx = d.transaction(STORE, 'readonly');
    const out: PageResult[] = [];
    let cursor = await tx.store.openCursor(rangeFor(fileHash));
    while (cursor) {
      out.push(cursor.value as PageResult);
      cursor = await cursor.continue();
    }
    out.sort((a, b) => a.pageNum - b.pageNum);
    return out;
  } catch (err) {
    console.warn('persistence.loadAllPageResults failed', err);
    return [];
  }
}

export async function deleteFile(fileHash: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  let cursor = await tx.store.openCursor(rangeFor(fileHash));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/persistence.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/persistence.ts src/store/persistence.test.ts
git commit -m "feat: IndexedDB persistence keyed by fileHash"
```

---

### Task 11: Run history store

**Files:**
- Create: `/root/llm_ocr_web/src/store/runHistory.ts`
- Create: `/root/llm_ocr_web/src/store/runHistory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/runHistory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { appendRun, loadRuns, MAX_RUNS } from './runHistory';
import type { RunRecord } from '../lib/types';

const r = (id: string, ts: number): RunRecord => ({
  id, ts, fileName: 'f.pdf', pagesOk: 1, pagesFailed: 0, route: 'gateway', model: 'gemini-3.1-pro',
});

beforeEach(() => localStorage.clear());

describe('runHistory', () => {
  it('starts empty', () => {
    expect(loadRuns()).toEqual([]);
  });

  it('appends and reloads in newest-first order', () => {
    appendRun(r('a', 1000));
    appendRun(r('b', 2000));
    const runs = loadRuns();
    expect(runs.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('caps at MAX_RUNS', () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) appendRun(r(String(i), i));
    expect(loadRuns()).toHaveLength(MAX_RUNS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/runHistory.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `src/store/runHistory.ts`**

```ts
import type { RunRecord } from '../lib/types';

const STORAGE_KEY = 'llm_ocr_web:runHistory:v1';
export const MAX_RUNS = 20;

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RunRecord[];
  } catch {
    return [];
  }
}

export function appendRun(record: RunRecord): void {
  const runs = loadRuns();
  runs.unshift(record);
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // ignore quota errors
  }
}

export function clearRuns(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/store/runHistory.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/runHistory.ts src/store/runHistory.test.ts
git commit -m "feat: run history capped at 20"
```

---

# Phase 4 — Prompt and AI client modules

### Task 12: Prompt template registry + placeholder substitution

**Files:**
- Create: `/root/llm_ocr_web/src/runner/prompt.ts`
- Create: `/root/llm_ocr_web/src/runner/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/runner/prompt.test.ts
import { describe, it, expect } from 'vitest';
import { substitute } from './prompt';

describe('prompt.substitute', () => {
  it('replaces single {text} placeholder', () => {
    expect(substitute('Fix: {text}', { text: 'abc' })).toBe('Fix: abc');
  });

  it('replaces multiple occurrences', () => {
    expect(substitute('{text} again {text}', { text: 'X' })).toBe('X again X');
  });

  it('returns input unchanged when no placeholder', () => {
    expect(substitute('no placeholder here', { text: 'X' })).toBe('no placeholder here');
  });

  it('does not interpret regex chars in replacement value', () => {
    expect(substitute('Got {text}', { text: '$1 and \\n' })).toBe('Got $1 and \\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/runner/prompt.test.ts
```

- [ ] **Step 3: Write `src/runner/prompt.ts`**

```ts
export function substitute(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/runner/prompt.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runner/prompt.ts src/runner/prompt.test.ts
git commit -m "feat: prompt placeholder substitution"
```

---

### Task 13: OCR client (`ai/ocr.ts`)

**Files:**
- Create: `/root/llm_ocr_web/src/ai/ocr.ts`
- Create: `/root/llm_ocr_web/src/ai/ocr.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/ocr.test.ts
import { describe, it, expect } from 'vitest';
import { ocrPage } from './ocr';

describe('ocrPage', () => {
  it('passes image + prompt to model and returns text + usage', async () => {
    const calls: any[] = [];
    const fakeModel = {
      doGenerate: async (opts: any) => {
        calls.push(opts);
        return {
          content: [{ type: 'text', text: 'דברי תורה' }],
          usage: { inputTokens: 1500, outputTokens: 25 },
          finishReason: 'stop',
          warnings: [],
          response: { id: 'r1', modelId: 'm', timestamp: new Date() },
        };
      },
      specificationVersion: 'v2',
      provider: 'fake',
      modelId: 'fake',
    };
    const result = await ocrPage(fakeModel as any, 'data:image/png;base64,XXX', 'OCR this');
    expect(result.text).toBe('דברי תורה');
    expect(result.tokensIn).toBe(1500);
    expect(result.tokensOut).toBe(25);
    expect(calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/ocr.test.ts
```

- [ ] **Step 3: Write `src/ai/ocr.ts`**

```ts
import { generateText, type LanguageModel } from 'ai';

export interface OcrResult {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
}

export async function ocrPage(
  model: LanguageModel,
  imageDataUrl: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const res = await generateText({
    model,
    abortSignal: signal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: imageDataUrl },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  return {
    text: res.text ?? '',
    tokensIn: res.usage?.inputTokens,
    tokensOut: res.usage?.outputTokens,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/ocr.test.ts
```

Expected: 1 PASS. If the fake-model `doGenerate` shape doesn't match the installed `ai` SDK version, adjust the fake to whatever shape the SDK calls — keep the assertions on `text` / `tokensIn` / `tokensOut`.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ocr.ts src/ai/ocr.test.ts
git commit -m "feat: OCR client wrapping AI SDK generateText"
```

---

### Task 14: Correction client + JSON parser

**Files:**
- Create: `/root/llm_ocr_web/src/ai/correct.ts`
- Create: `/root/llm_ocr_web/src/ai/correct.test.ts`

The JSON parser mirrors `parse_corrections_json` from `~/llm_ocr/main.py:171-192`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/correct.test.ts
import { describe, it, expect } from 'vitest';
import { parseCorrections } from './correct';

describe('parseCorrections', () => {
  it('parses clean JSON array', () => {
    const out = parseCorrections('[{"old":"a","new":"b","reason":"r"}]');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ old: 'a', new: 'b', reason: 'r', status: 'pending' });
    expect(typeof out[0].id).toBe('string');
  });

  it('strips ```json fences', () => {
    const wrapped = '```json\n[{"old":"a","new":"b"}]\n```';
    const out = parseCorrections(wrapped);
    expect(out).toHaveLength(1);
  });

  it('strips bare ``` fences', () => {
    const wrapped = '```\n[{"old":"a","new":"b"}]\n```';
    expect(parseCorrections(wrapped)).toHaveLength(1);
  });

  it('returns [] on empty array', () => {
    expect(parseCorrections('[]')).toEqual([]);
  });

  it('returns [] on garbage', () => {
    expect(parseCorrections('hello world')).toEqual([]);
    expect(parseCorrections('{not json')).toEqual([]);
    expect(parseCorrections('null')).toEqual([]);
    expect(parseCorrections('{"object": "not array"}')).toEqual([]);
  });

  it('drops entries missing old or new', () => {
    const raw = JSON.stringify([
      { old: 'a', new: 'b' },
      { old: 'a' },
      { new: 'b' },
      {},
      { old: 'c', new: 'd', reason: 'rr' },
    ]);
    const out = parseCorrections(raw);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.old)).toEqual(['a', 'c']);
  });

  it('defaults missing reason to empty string', () => {
    const out = parseCorrections('[{"old":"a","new":"b"}]');
    expect(out[0].reason).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/correct.test.ts
```

- [ ] **Step 3: Write `src/ai/correct.ts`**

```ts
import { generateText, type LanguageModel } from 'ai';
import type { Correction } from '../lib/types';

export function parseCorrections(raw: string): Correction[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Correction[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.old !== 'string' || typeof obj.new !== 'string') continue;
    out.push({
      id: cryptoRandomId(),
      old: obj.old,
      new: obj.new,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      status: 'pending',
    });
  }
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function correctPage(
  model: LanguageModel,
  imageDataUrl: string,
  filledPrompt: string,
  signal?: AbortSignal,
): Promise<Correction[]> {
  const res = await generateText({
    model,
    abortSignal: signal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: imageDataUrl },
          { type: 'text', text: filledPrompt },
        ],
      },
    ],
  });
  return parseCorrections(res.text ?? '');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/ai/correct.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/correct.ts src/ai/correct.test.ts
git commit -m "feat: correction client + tolerant JSON parser"
```

---

### Task 15: Orchestrator (parallel batch runner)

**Files:**
- Create: `/root/llm_ocr_web/src/runner/orchestrator.ts`
- Create: `/root/llm_ocr_web/src/runner/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/runner/orchestrator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runBatch } from './orchestrator';

describe('runBatch', () => {
  it('respects concurrency cap', async () => {
    let active = 0, peak = 0;
    const work = vi.fn(async (n: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { ok: true as const, value: `p${n}` };
    });
    await runBatch({
      items: [0, 1, 2, 3, 4, 5, 6, 7],
      concurrency: 3,
      work,
      onProgress: () => {},
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(work).toHaveBeenCalledTimes(8);
  });

  it('reports progress for each item', async () => {
    const events: any[] = [];
    await runBatch({
      items: [0, 1, 2],
      concurrency: 2,
      work: async (n) => ({ ok: true as const, value: n * 10 }),
      onProgress: (e) => events.push(e),
    });
    expect(events.map((e) => e.item).sort()).toEqual([0, 1, 2]);
    expect(events.every((e) => e.ok && e.value !== undefined)).toBe(true);
  });

  it('reports failures without aborting other items', async () => {
    const events: any[] = [];
    await runBatch({
      items: [0, 1, 2],
      concurrency: 2,
      work: async (n) => n === 1 ? { ok: false as const, error: 'boom' } : { ok: true as const, value: n },
      onProgress: (e) => events.push(e),
    });
    expect(events).toHaveLength(3);
    const failed = events.find((e) => !e.ok);
    expect(failed.error).toBe('boom');
  });

  it('honors abort signal', async () => {
    const ctrl = new AbortController();
    const events: any[] = [];
    const promise = runBatch({
      items: [0, 1, 2, 3, 4, 5],
      concurrency: 1,
      work: async (n, sig) => {
        await new Promise((r, j) => {
          const t = setTimeout(() => r(undefined), 20);
          sig?.addEventListener('abort', () => { clearTimeout(t); j(new Error('abort')); });
        });
        return { ok: true as const, value: n };
      },
      onProgress: (e) => events.push(e),
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 5);
    await promise;
    // Some items should remain unprocessed
    expect(events.length).toBeLessThan(6);
  });

  it('retries transient failures up to maxRetries', async () => {
    let attempts = 0;
    const events: any[] = [];
    await runBatch({
      items: [0],
      concurrency: 1,
      maxRetries: 3,
      retryDelayMs: 1,
      work: async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return { ok: true as const, value: 'done' };
      },
      onProgress: (e) => events.push(e),
    });
    expect(attempts).toBe(3);
    expect(events[0].ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/runner/orchestrator.test.ts
```

- [ ] **Step 3: Write `src/runner/orchestrator.ts`**

```ts
export type WorkResult<V> = { ok: true; value: V } | { ok: false; error: string };

export interface ProgressEvent<I, V> {
  item: I;
  ok: boolean;
  value?: V;
  error?: string;
}

export interface RunBatchOpts<I, V> {
  items: I[];
  concurrency: number;
  work: (item: I, signal?: AbortSignal) => Promise<WorkResult<V>>;
  onProgress: (event: ProgressEvent<I, V>) => void;
  signal?: AbortSignal;
  maxRetries?: number;       // default 3
  retryDelayMs?: number;     // base delay; multiplied by attempt number
}

export async function runBatch<I, V>(opts: RunBatchOpts<I, V>): Promise<void> {
  const { items, concurrency, work, onProgress, signal } = opts;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 5000;

  const queue = [...items.map((item, idx) => ({ item, idx }))];
  let next = 0;

  async function workerLoop(): Promise<void> {
    while (next < queue.length) {
      if (signal?.aborted) return;
      const slot = next++;
      if (slot >= queue.length) return;
      const { item } = queue[slot];

      let attempt = 0;
      while (true) {
        attempt++;
        if (signal?.aborted) return;
        try {
          const result = await work(item, signal);
          if (result.ok) {
            onProgress({ item, ok: true, value: result.value });
          } else {
            onProgress({ item, ok: false, error: result.error });
          }
          break;
        } catch (err) {
          if (signal?.aborted) return;
          if (attempt >= maxRetries) {
            const msg = err instanceof Error ? err.message : String(err);
            onProgress({ item, ok: false, error: msg });
            break;
          }
          await delay(baseDelay * attempt, signal);
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, Math.min(concurrency, items.length)); i++) {
    workers.push(workerLoop());
  }
  await Promise.all(workers);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/runner/orchestrator.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runner/orchestrator.ts src/runner/orchestrator.test.ts
git commit -m "feat: orchestrator with concurrency, retries, abort"
```

---

# Phase 5 — Diff, markdown, DOCX

### Task 16: Diff helper

**Files:**
- Create: `/root/llm_ocr_web/src/lib/diff.ts`
- Create: `/root/llm_ocr_web/src/lib/diff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/diff.test.ts
import { describe, it, expect } from 'vitest';
import { charDiff } from './diff';

describe('charDiff', () => {
  it('marks unchanged segments', () => {
    const out = charDiff('hello', 'hello');
    expect(out).toEqual([{ kind: 'eq', text: 'hello' }]);
  });

  it('marks single-char swap (Hebrew letter swap)', () => {
    const out = charDiff('דברי', 'רברי');
    expect(out[0]).toEqual({ kind: 'del', text: 'ד' });
    expect(out[1]).toEqual({ kind: 'add', text: 'ר' });
    expect(out[2]).toEqual({ kind: 'eq', text: 'ברי' });
  });

  it('handles whole-word replacement', () => {
    const out = charDiff('hello world', 'hello there');
    const joined = out.map((p) => `${p.kind}:${p.text}`).join('|');
    expect(joined).toContain('eq:hello ');
    expect(joined).toContain('del:');
    expect(joined).toContain('add:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/lib/diff.test.ts
```

- [ ] **Step 3: Write `src/lib/diff.ts`**

```ts
import { diffChars } from 'diff';

export type DiffPart = { kind: 'eq' | 'add' | 'del'; text: string };

export function charDiff(oldText: string, newText: string): DiffPart[] {
  const parts = diffChars(oldText, newText);
  return parts.map((p) => ({
    kind: p.added ? 'add' : p.removed ? 'del' : 'eq',
    text: p.value,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/lib/diff.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.ts src/lib/diff.test.ts
git commit -m "feat: char-level diff helper"
```

---

### Task 17: Markdown joiner

**Files:**
- Create: `/root/llm_ocr_web/src/docx/markdown.ts`
- Create: `/root/llm_ocr_web/src/docx/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/docx/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { joinPages } from './markdown';
import type { PageResult } from '../lib/types';

const ok = (n: number, t: string): PageResult => ({ pageNum: n, text: t, status: 'ok' });

describe('joinPages', () => {
  it('joins ok pages with blank-line separators in pageNum order', () => {
    const out = joinPages([ok(1, 'B'), ok(0, 'A'), ok(2, 'C')]);
    expect(out).toBe('A\n\nB\n\nC');
  });

  it('skips pages with empty/whitespace text', () => {
    const out = joinPages([ok(0, 'A'), ok(1, '   '), ok(2, 'C')]);
    expect(out).toBe('A\n\nC');
  });

  it('skips error pages', () => {
    const out = joinPages([ok(0, 'A'), { pageNum: 1, text: 'X', status: 'error', error: 'boom' }, ok(2, 'C')]);
    expect(out).toBe('A\n\nC');
  });

  it('preserves bold and headings verbatim', () => {
    const out = joinPages([ok(0, '## פרק א\n\n**שלום** עליכם')]);
    expect(out).toBe('## פרק א\n\n**שלום** עליכם');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/llm_ocr_web && npx vitest run src/docx/markdown.test.ts
```

- [ ] **Step 3: Write `src/docx/markdown.ts`**

```ts
import type { PageResult } from '../lib/types';

export function joinPages(pages: PageResult[]): string {
  const sorted = [...pages].sort((a, b) => a.pageNum - b.pageNum);
  return sorted
    .filter((p) => p.status !== 'error')
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/llm_ocr_web && npx vitest run src/docx/markdown.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/docx/markdown.ts src/docx/markdown.test.ts
git commit -m "feat: page-text join into markdown"
```

---

### Task 18: Markdown → DOCX exporter

**Files:**
- Create: `/root/llm_ocr_web/src/docx/export.ts`

The `docx` library is the source of truth here. We don't unit-test DOCX byte output (out of scope); the manual smoke test in Task 31 covers it end-to-end.

- [ ] **Step 1: Write `src/docx/export.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { marked, type Token, type Tokens } from 'marked';

export async function mdToDocxBlob(md: string): Promise<Blob> {
  const tokens = marked.lexer(md);
  const children: Paragraph[] = [];

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const heading = tok as Tokens.Heading;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          heading: headingLevelFor(heading.depth),
          children: inlineRuns(heading.tokens ?? [{ type: 'text', text: heading.text, raw: heading.text } as Token]),
        }),
      );
    } else if (tok.type === 'paragraph') {
      const para = tok as Tokens.Paragraph;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          children: inlineRuns(para.tokens ?? []),
        }),
      );
    } else if (tok.type === 'space') {
      // marked emits 'space' tokens for blank lines; ignore
    } else if ('text' in tok && typeof (tok as any).text === 'string') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          children: [new TextRun({ text: (tok as any).text as string })],
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

function headingLevelFor(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (depth) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    case 4: return HeadingLevel.HEADING_4;
    case 5: return HeadingLevel.HEADING_5;
    default: return HeadingLevel.HEADING_6;
  }
}

function inlineRuns(tokens: Token[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const t of tokens) {
    runs.push(...runsForToken(t, false));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '' }));
  return runs;
}

function runsForToken(t: Token, bold: boolean): TextRun[] {
  if (t.type === 'text') {
    return [new TextRun({ text: (t as Tokens.Text).text, bold: bold || undefined })];
  }
  if (t.type === 'strong') {
    const inner = (t as Tokens.Strong).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, true));
  }
  if (t.type === 'em') {
    const inner = (t as Tokens.Em).tokens ?? [];
    return inner.flatMap((x) => runsForToken(x, bold)).map((r) => {
      r.options.italics = true;
      return r;
    });
  }
  if (t.type === 'codespan') {
    return [new TextRun({ text: (t as Tokens.Codespan).text, bold: bold || undefined })];
  }
  if (t.type === 'br') {
    return [new TextRun({ text: '', break: 1 })];
  }
  if ('raw' in t && typeof (t as any).raw === 'string') {
    return [new TextRun({ text: (t as any).raw as string, bold: bold || undefined })];
  }
  return [];
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/docx/export.ts
git commit -m "feat: markdown to docx conversion with RTL paragraphs"
```

---

# Phase 6 — Contexts and UI primitives

### Task 19: Settings context

**Files:**
- Create: `/root/llm_ocr_web/src/store/SettingsContext.tsx`

- [ ] **Step 1: Write `src/store/SettingsContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  updatePrompts: (patch: Partial<Settings['prompts']>) => void;
  updateApiKeys: (patch: Partial<Settings['apiKeys']>) => void;
  reset: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const ctx: Ctx = useMemo(() => ({
    settings,
    update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    updatePrompts: (patch) => setSettings((s) => ({ ...s, prompts: { ...s.prompts, ...patch } })),
    updateApiKeys: (patch) => setSettings((s) => ({ ...s, apiKeys: { ...s.apiKeys, ...patch } })),
    reset: () => setSettings({ ...DEFAULT_SETTINGS }),
  }), [settings]);

  return <SettingsCtx.Provider value={ctx}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/store/SettingsContext.tsx
git commit -m "feat: settings context with localStorage round-trip"
```

---

### Task 20: Project context

**Files:**
- Create: `/root/llm_ocr_web/src/store/ProjectContext.tsx`

- [ ] **Step 1: Write `src/store/ProjectContext.tsx`**

```tsx
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageResult, Status } from '../lib/types';
import type { LoadedDoc } from '../pdf/render';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  pages: PageResult[];
  currentPageNum: number;
  setProject: (args: { doc: LoadedDoc; fileHash: string; fileName: string; restored: PageResult[] }) => void;
  resetProject: () => void;
  setPage: (page: PageResult) => void;
  setPageStatus: (pageNum: number, status: Status, extra?: Partial<PageResult>) => void;
  setCurrentPageNum: (n: number) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPageNum, setCurrentPageNum] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _docRef = useRef<LoadedDoc | null>(null); // not strictly necessary; loadedDoc state is enough

  const ctx: Ctx = useMemo(() => ({
    loadedDoc,
    fileHash,
    fileName,
    pages,
    currentPageNum,
    setProject: ({ doc, fileHash, fileName, restored }) => {
      setLoadedDoc(doc);
      setFileHash(fileHash);
      setFileName(fileName);
      const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
        const found = restored.find((r) => r.pageNum === i);
        return found ?? { pageNum: i, text: '', status: 'pending' as Status };
      });
      setPages(init);
      setCurrentPageNum(0);
    },
    resetProject: () => {
      setLoadedDoc(null); setFileHash(''); setFileName(''); setPages([]); setCurrentPageNum(0);
    },
    setPage: (p) => setPages((arr) => arr.map((x) => (x.pageNum === p.pageNum ? p : x))),
    setPageStatus: (n, status, extra) =>
      setPages((arr) => arr.map((x) => (x.pageNum === n ? { ...x, status, ...extra } : x))),
    setCurrentPageNum,
  }), [loadedDoc, fileHash, fileName, pages, currentPageNum]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/store/ProjectContext.tsx
git commit -m "feat: project context for current OCR session state"
```

---

### Task 21: lib/utils + UI primitives copy

**Files:**
- Create: `/root/llm_ocr_web/src/lib/utils.ts`
- Create: `/root/llm_ocr_web/src/components/ui/button.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/input.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/textarea.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/label.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/tabs.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/select.tsx`
- Create: `/root/llm_ocr_web/src/components/ui/slider.tsx`

- [ ] **Step 1: Write `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
```

- [ ] **Step 2: Copy each UI primitive from pdf_proofread**

For each file in `/root/pdf_proofread/src/components/ui/`, copy verbatim into `/root/llm_ocr_web/src/components/ui/`. Adjust internal imports of `@/lib/utils` (those resolve in both projects via the alias).

```bash
cp /root/pdf_proofread/src/components/ui/button.tsx   /root/llm_ocr_web/src/components/ui/
cp /root/pdf_proofread/src/components/ui/input.tsx    /root/llm_ocr_web/src/components/ui/
cp /root/pdf_proofread/src/components/ui/textarea.tsx /root/llm_ocr_web/src/components/ui/
cp /root/pdf_proofread/src/components/ui/label.tsx    /root/llm_ocr_web/src/components/ui/
cp /root/pdf_proofread/src/components/ui/tabs.tsx     /root/llm_ocr_web/src/components/ui/
cp /root/pdf_proofread/src/components/ui/select.tsx   /root/llm_ocr_web/src/components/ui/   2>/dev/null || true
cp /root/pdf_proofread/src/components/ui/slider.tsx   /root/llm_ocr_web/src/components/ui/   2>/dev/null || true
```

If `select.tsx` or `slider.tsx` don't exist in pdf_proofread, write minimal versions:

`src/components/ui/select.tsx`:
```tsx
import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
```

`src/components/ui/slider.tsx`:
```tsx
import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Slider = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn('w-full', className)}
      {...props}
    />
  ),
);
Slider.displayName = 'Slider';
```

- [ ] **Step 3: Type-check**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

Expected: no errors. Fix any import-path mismatches that surface (the pdf_proofread copies may import `@/lib/utils` — keep that, the alias is defined).

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils.ts src/components/ui/
git commit -m "feat: UI primitives (button, input, textarea, label, tabs, select, slider)"
```

---

# Phase 7 — Components

### Task 22: ErrorBoundary

**Files:**
- Create: `/root/llm_ocr_web/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Write `src/components/ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: unknown) {
    console.error('App crashed:', error, info);
  }

  reload = () => { this.setState({ error: null }); window.location.reload(); };

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <pre className="bg-gray-100 p-3 text-xs overflow-auto rounded">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.reload}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat: top-level error boundary"
```

---

### Task 23: FileDrop

**Files:**
- Create: `/root/llm_ocr_web/src/components/FileDrop.tsx`

- [ ] **Step 1: Write `src/components/FileDrop.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { openPdf, imagesAsDoc, combine, readFileBytes, type LoadedDoc } from '../pdf/render';
import { sha256 } from '../pdf/hash';
import { loadAllPageResults } from '../store/persistence';
import { cn } from '../lib/utils';

export function FileDrop() {
  const { setProject, loadedDoc, fileName } = useProject();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    try {
      const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));

      let doc: LoadedDoc;
      let combinedBytes: Uint8Array[] = [];
      let displayName = files.map((f) => f.name).join(' + ');

      if (pdfFiles.length === 1 && imageFiles.length === 0) {
        const bytes = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(bytes);
        doc = await openPdf(bytes);
        displayName = pdfFiles[0].name;
      } else if (pdfFiles.length === 0 && imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.map(async (f) => {
          const bytes = await readFileBytes(f);
          combinedBytes.push(bytes);
          return { bytes, mediaType: f.type || 'image/png' };
        }));
        doc = imagesAsDoc(imgs);
      } else if (pdfFiles.length === 1 && imageFiles.length > 0) {
        const pdfBytes = await readFileBytes(pdfFiles[0]);
        combinedBytes.push(pdfBytes);
        const pdfDoc = await openPdf(pdfBytes);

        const extraImages = await Promise.all(imageFiles.map(async (f) => {
          const bytes = await readFileBytes(f);
          combinedBytes.push(bytes);
          return { bytes, mediaType: f.type || 'image/png' };
        }));
        const imgDoc = imagesAsDoc(extraImages);

        doc = combine(pdfDoc, imgDoc);
      } else {
        throw new Error('Drop one PDF, one or more images, or a PDF plus images.');
      }

      const concat = concatBytes(combinedBytes);
      const fileHash = await sha256(concat);
      const restored = await loadAllPageResults(fileHash);
      setProject({ doc, fileHash, fileName: displayName, restored });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setProject]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
        )}
      >
        <p className="text-gray-700">Drop a PDF or images here</p>
        <p className="text-xs text-gray-500 mt-1">PDF, PNG, JPG, WEBP — multi-file OK</p>
        <label className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded cursor-pointer">
          Choose files
          <input
            type="file"
            multiple
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {loadedDoc && (
          <p className="mt-3 text-sm text-gray-800">
            Loaded: <strong>{fileName}</strong> ({loadedDoc.pageCount} pages)
          </p>
        )}
      </div>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}

function concatBytes(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

```

The `LoadedDoc` is also reused as the unused-import typeguard; remove `LoadedDoc` from the imports of this file if TypeScript flags it, since the value is inferred — keep the named import only if used in a type annotation.

- [ ] **Step 2: Type-check**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileDrop.tsx
git commit -m "feat: file drop for PDF or multiple images"
```

---

### Task 24: PromptEditor + SettingsPanel

**Files:**
- Create: `/root/llm_ocr_web/src/components/PromptEditor.tsx`
- Create: `/root/llm_ocr_web/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Write `src/components/PromptEditor.tsx`**

```tsx
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholderHint?: string;
  rows?: number;
}

export function PromptEditor({ label, value, onChange, placeholderHint, rows = 6 }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {placeholderHint && (
          <span className="text-xs text-gray-500">Use <code>{placeholderHint}</code> for current page text</span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/SettingsPanel.tsx`**

```tsx
import { useSettings } from '../store/SettingsContext';
import { modelsForRoute } from '../ai/providers';
import type { Route, Model, ApiKeys } from '../lib/types';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Slider } from './ui/slider';
import { PromptEditor } from './PromptEditor';

const ROUTE_LABEL: Record<Route, string> = {
  anthropic: 'Anthropic (direct)',
  google: 'Google (direct)',
  openai: 'OpenAI (direct)',
  gateway: 'Vercel AI Gateway',
};

const KEY_FIELD: Record<Route, keyof ApiKeys> = {
  anthropic: 'anthropic',
  google: 'google',
  openai: 'openai',
  gateway: 'gateway',
};

export function SettingsPanel() {
  const { settings, update, updateApiKeys, updatePrompts, reset } = useSettings();
  const models = modelsForRoute(settings.route);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Provider</Label>
          <Select
            value={settings.route}
            onChange={(e) => {
              const newRoute = e.target.value as Route;
              const validModels = modelsForRoute(newRoute);
              const nextModel = validModels.includes(settings.model) ? settings.model : (validModels[0] as Model);
              update({ route: newRoute, model: nextModel });
            }}
          >
            {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
              <option key={r} value={r}>{ROUTE_LABEL[r]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Model</Label>
          <Select
            value={settings.model}
            onChange={(e) => update({ model: e.target.value as Model })}
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <Label>API Key — {ROUTE_LABEL[settings.route]}</Label>
        <Input
          type="password"
          value={settings.apiKeys[KEY_FIELD[settings.route]]}
          onChange={(e) => updateApiKeys({ [KEY_FIELD[settings.route]]: e.target.value })}
          placeholder="paste your key here"
        />
        <p className="text-xs text-gray-500 mt-1">
          Stored in your browser's localStorage only. Never sent to a server.
        </p>
      </div>

      <div>
        <Label>Batch Size — {settings.batchSize} pages in parallel</Label>
        <Slider
          min={1} max={50} step={1}
          value={settings.batchSize}
          onChange={(e) => update({ batchSize: Number(e.target.value) })}
        />
      </div>

      <PromptEditor
        label="OCR Prompt"
        value={settings.prompts.ocr}
        onChange={(v) => updatePrompts({ ocr: v })}
        rows={5}
      />
      <PromptEditor
        label="Fix: General"
        value={settings.prompts.general}
        onChange={(v) => updatePrompts({ general: v })}
        placeholderHint="{text}"
      />
      <PromptEditor
        label="Fix: Headers"
        value={settings.prompts.headers}
        onChange={(v) => updatePrompts({ headers: v })}
        placeholderHint="{text}"
      />
      <PromptEditor
        label="Fix: Punctuation"
        value={settings.prompts.punctuation}
        onChange={(v) => updatePrompts({ punctuation: v })}
        placeholderHint="{text}"
      />
      <PromptEditor
        label="Fix: Custom"
        value={settings.prompts.custom}
        onChange={(v) => updatePrompts({ custom: v })}
        placeholderHint="{text}"
      />

      <button
        onClick={reset}
        className="text-sm text-red-600 underline"
      >Reset all settings to defaults</button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PromptEditor.tsx src/components/SettingsPanel.tsx
git commit -m "feat: settings panel with provider/model/keys/prompts"
```

---

### Task 25: PageList

**Files:**
- Create: `/root/llm_ocr_web/src/components/PageList.tsx`

- [ ] **Step 1: Write `src/components/PageList.tsx`**

```tsx
import { useProject } from '../store/ProjectContext';
import type { Status } from '../lib/types';
import { cn } from '../lib/utils';

const STATUS_BG: Record<Status, string> = {
  pending: 'bg-gray-200 text-gray-700',
  running: 'bg-blue-200 text-blue-900 animate-pulse',
  ok:      'bg-green-200 text-green-900',
  error:   'bg-red-200 text-red-900',
  edited:  'bg-amber-200 text-amber-900',
};

export function PageList() {
  const { pages, currentPageNum, setCurrentPageNum } = useProject();
  if (pages.length === 0) return null;
  return (
    <div className="border rounded p-2 max-h-96 overflow-auto">
      <div className="grid grid-cols-10 gap-1">
        {pages.map((p) => (
          <button
            key={p.pageNum}
            onClick={() => setCurrentPageNum(p.pageNum)}
            title={p.error ?? p.status}
            className={cn(
              'text-xs rounded px-1 py-0.5 font-mono',
              STATUS_BG[p.status],
              currentPageNum === p.pageNum && 'ring-2 ring-blue-500',
            )}
          >
            {p.pageNum + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PageList.tsx
git commit -m "feat: page list with status chips"
```

---

### Task 26: BatchRunner

**Files:**
- Create: `/root/llm_ocr_web/src/components/BatchRunner.tsx`

- [ ] **Step 1: Write `src/components/BatchRunner.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { createModel } from '../ai/providers';
import { ocrPage } from '../ai/ocr';
import { renderPageToPng } from '../pdf/render';
import { savePageResult } from '../store/persistence';
import { runBatch } from '../runner/orchestrator';
import { appendRun } from '../store/runHistory';
import { estimateCost } from '../ai/pricing';
import { Button } from './ui/button';

export function BatchRunner() {
  const { settings } = useSettings();
  const { loadedDoc, fileHash, fileName, pages, setPageStatus, setPage } = useProject();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const eligible = pages.filter((p) => p.status !== 'ok').map((p) => p.pageNum);
  const failed = pages.filter((p) => p.status === 'error').map((p) => p.pageNum);

  const append = (m: string) => setLog((l) => [...l, m]);

  const start = async (pageNums: number[]) => {
    if (!loadedDoc || pageNums.length === 0) return;
    let model;
    try {
      model = createModel(settings);
    } catch (e) {
      append(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    setRunning(true);
    abortRef.current = new AbortController();
    const startedAt = Date.now();
    let okCount = 0, failCount = 0;
    let totalIn = 0, totalOut = 0;
    const processed = new Set<number>();

    for (const n of pageNums) setPageStatus(n, 'running');

    await runBatch({
      items: pageNums,
      concurrency: settings.batchSize,
      signal: abortRef.current.signal,
      work: async (n, sig) => {
        try {
          const img = await renderPageToPng(loadedDoc, n);
          const r = await ocrPage(model, img.dataUrl, settings.prompts.ocr, sig);
          return { ok: true as const, value: r };
        } catch (e) {
          return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
        }
      },
      onProgress: (e) => {
        processed.add(e.item);
        if (e.ok && e.value) {
          okCount++;
          totalIn += e.value.tokensIn ?? 0;
          totalOut += e.value.tokensOut ?? 0;
          const result = { pageNum: e.item, text: e.value.text, status: 'ok' as const, tokensIn: e.value.tokensIn, tokensOut: e.value.tokensOut };
          setPage(result);
          savePageResult(fileHash, result);
          append(`Page ${e.item + 1} OK (${e.value.text.length} chars)`);
        } else {
          failCount++;
          const result = { pageNum: e.item, text: '', status: 'error' as const, error: e.error };
          setPage(result);
          savePageResult(fileHash, result);
          append(`Page ${e.item + 1} FAILED: ${e.error}`);
        }
      },
    });

    // Pages that never started (aborted before assignment) → revert from 'running' to 'pending'
    for (const n of pageNums) {
      if (!processed.has(n)) setPageStatus(n, 'pending');
    }

    appendRun({
      id: crypto.randomUUID(),
      ts: startedAt,
      fileName,
      pagesOk: okCount,
      pagesFailed: failCount,
      route: settings.route,
      model: settings.model,
      costUsd: estimateCost(settings.model, { tokensIn: totalIn, tokensOut: totalOut }),
    });

    setRunning(false);
    abortRef.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => start(eligible)} disabled={running || eligible.length === 0}>
          Start ({eligible.length} pending)
        </Button>
        <Button variant="outline" onClick={() => abortRef.current?.abort()} disabled={!running}>
          Stop
        </Button>
        <Button variant="outline" onClick={() => start(failed)} disabled={running || failed.length === 0}>
          Retry Failed ({failed.length})
        </Button>
      </div>
      <button className="text-xs text-blue-600 underline" onClick={() => setShowLog((s) => !s)}>
        {showLog ? 'Hide' : 'Show'} log ({log.length})
      </button>
      {showLog && (
        <pre className="bg-gray-50 border text-xs p-2 max-h-48 overflow-auto whitespace-pre-wrap">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BatchRunner.tsx
git commit -m "feat: batch runner UI driving orchestrator + persistence"
```

---

### Task 27: PageImage + OcrTextarea

**Files:**
- Create: `/root/llm_ocr_web/src/components/PageImage.tsx`
- Create: `/root/llm_ocr_web/src/components/OcrTextarea.tsx`

- [ ] **Step 1: Write `src/components/PageImage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { renderPageToPng } from '../pdf/render';

export function PageImage() {
  const { loadedDoc, currentPageNum } = useProject();
  const [src, setSrc] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(''); setErr(null);
    if (!loadedDoc) return;
    renderPageToPng(loadedDoc, currentPageNum)
      .then((r) => { if (!cancelled) setSrc(r.dataUrl); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [loadedDoc, currentPageNum]);

  if (err) return <div className="text-red-600 text-sm p-2">{err}</div>;
  if (!src) return <div className="text-gray-500 text-sm p-2">Rendering page…</div>;
  return (
    <div className="border rounded overflow-auto h-[70vh] bg-gray-50">
      <img src={src} alt={`page ${currentPageNum + 1}`} className="max-w-full" />
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/OcrTextarea.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { savePageResult } from '../store/persistence';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';

export function OcrTextarea() {
  const { pages, currentPageNum, fileHash, setPage } = useProject();
  const page = pages.find((p) => p.pageNum === currentPageNum);
  const [draft, setDraft] = useState<string>(page?.text ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(page?.text ?? '');
    setDirty(false);
  }, [currentPageNum, page?.text]);

  const save = () => {
    if (!page) return;
    const updated = { ...page, text: draft, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <Textarea
        dir="rtl"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) save(); }}
        className="flex-1 text-right font-serif text-base leading-relaxed"
        placeholder={page?.status === 'pending' ? '(not yet OCR’d)' : ''}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-500">
          Page {currentPageNum + 1} — {draft.length} chars — {page?.status ?? '—'}
        </span>
        <Button onClick={save} disabled={!dirty}>Save Text</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PageImage.tsx src/components/OcrTextarea.tsx
git commit -m "feat: page image and RTL OCR textarea"
```

---

### Task 28: DiffCard

**Files:**
- Create: `/root/llm_ocr_web/src/components/DiffCard.tsx`

- [ ] **Step 1: Write `src/components/DiffCard.tsx`**

```tsx
import type { Correction } from '../lib/types';
import { charDiff } from '../lib/diff';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Props {
  correction: Correction;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function DiffCard({ correction, onAccept, onReject }: Props) {
  const parts = charDiff(correction.old, correction.new);

  const cardBg =
    correction.status === 'accepted' ? 'bg-green-50 border-green-300' :
    correction.status === 'rejected' ? 'bg-gray-100 opacity-60 border-gray-300' :
    'bg-white border-gray-300';

  return (
    <div className={cn('border rounded p-2 text-sm space-y-1', cardBg)}>
      <div dir="rtl" className="font-serif">
        {parts.map((p, i) => (
          <span key={i} className={
            p.kind === 'add' ? 'bg-green-200 underline' :
            p.kind === 'del' ? 'bg-red-200 line-through' :
            ''
          }>{p.text}</span>
        ))}
      </div>
      {correction.reason && <div className="text-xs text-gray-600">{correction.reason}</div>}
      {correction.status === 'pending' && (
        <div className="flex gap-1">
          <Button onClick={() => onAccept(correction.id)} className="h-7 text-xs">Accept</Button>
          <Button variant="outline" onClick={() => onReject(correction.id)} className="h-7 text-xs">Reject</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DiffCard.tsx
git commit -m "feat: diff card with inline char-level highlight"
```

---

### Task 29: FixPanel

**Files:**
- Create: `/root/llm_ocr_web/src/components/FixPanel.tsx`

- [ ] **Step 1: Write `src/components/FixPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { createModel } from '../ai/providers';
import { correctPage } from '../ai/correct';
import { renderPageToPng } from '../pdf/render';
import { substitute } from '../runner/prompt';
import { savePageResult } from '../store/persistence';
import type { Correction, FixMode } from '../lib/types';
import { DiffCard } from './DiffCard';
import { Button } from './ui/button';

const MODES: FixMode[] = ['general', 'headers', 'punctuation', 'custom'];
const MODE_LABEL: Record<FixMode, string> = {
  general: 'General Fix',
  headers: 'Fix Headers',
  punctuation: 'Fix Punctuation',
  custom: 'Custom',
};

export function FixPanel() {
  const { settings } = useSettings();
  const { loadedDoc, fileHash, currentPageNum, pages, setPage } = useProject();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { setCorrections([]); setStatus(''); }, [currentPageNum]);

  const page = pages.find((p) => p.pageNum === currentPageNum);

  const runFix = async (mode: FixMode) => {
    if (!loadedDoc || !page) return;
    if (!page.text.trim()) { setStatus('No text on this page yet — OCR it first.'); return; }
    if (mode === 'custom' && !settings.prompts.custom.trim()) {
      setStatus('Custom prompt is empty — set it in the Setup tab.'); return;
    }
    setRunning(true); setStatus(`Running ${MODE_LABEL[mode]}…`);
    try {
      const model = createModel(settings);
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      const filled = substitute(settings.prompts[mode], { text: page.text });
      const result = await correctPage(model, img.dataUrl, filled);
      setCorrections(result);
      setStatus(result.length === 0 ? 'No corrections found.' : `Found ${result.length} correction(s).`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const accept = (id: string) => {
    if (!page) return;
    const idx = corrections.findIndex((c) => c.id === id);
    if (idx < 0 || corrections[idx].status !== 'pending') return;
    const c = corrections[idx];
    const cur = page.text;
    if (!cur.includes(c.old)) {
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'rejected', reason: `${x.reason} (no longer matches)` } : x)));
      return;
    }
    const updatedText = cur.replace(c.old, c.new);
    const updated = { ...page, text: updatedText, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'accepted' } : x)));
  };

  const reject = (id: string) => {
    setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'rejected' } : x)));
  };

  const acceptAll = () => {
    if (!page) return;
    let text = page.text;
    const next = corrections.map((c) => {
      if (c.status !== 'pending') return c;
      if (!text.includes(c.old)) return { ...c, status: 'rejected' as const, reason: `${c.reason} (no longer matches)` };
      text = text.replace(c.old, c.new);
      return { ...c, status: 'accepted' as const };
    });
    const updated = { ...page, text, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections(next);
  };

  const rejectAll = () => {
    setCorrections((arr) => arr.map((c) => (c.status === 'pending' ? { ...c, status: 'rejected' } : c)));
  };

  const hasPending = corrections.some((c) => c.status === 'pending');

  return (
    <div className="flex flex-col h-[70vh] space-y-2 overflow-auto">
      <h3 className="font-bold">AI Correction</h3>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => (
          <Button key={m} onClick={() => runFix(m)} disabled={running} variant={m === 'general' ? 'default' : 'outline'} className="text-xs">
            {MODE_LABEL[m]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-gray-600">{status}</p>
      {hasPending && (
        <div className="flex gap-2">
          <Button onClick={acceptAll} className="text-xs h-7">Accept All</Button>
          <Button variant="outline" onClick={rejectAll} className="text-xs h-7">Reject All</Button>
        </div>
      )}
      <div className="space-y-2 flex-1 overflow-auto">
        {corrections.map((c) => (
          <DiffCard key={c.id} correction={c} onAccept={accept} onReject={reject} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FixPanel.tsx
git commit -m "feat: AI fix panel with accept/reject diff cards"
```

---

### Task 30: EditorView

**Files:**
- Create: `/root/llm_ocr_web/src/components/EditorView.tsx`

- [ ] **Step 1: Write `src/components/EditorView.tsx`**

```tsx
import { useProject } from '../store/ProjectContext';
import { PageImage } from './PageImage';
import { OcrTextarea } from './OcrTextarea';
import { FixPanel } from './FixPanel';
import { Button } from './ui/button';

export function EditorView() {
  const { loadedDoc, currentPageNum, setCurrentPageNum } = useProject();
  if (!loadedDoc) return <p className="text-gray-500">Load a file first.</p>;

  const last = loadedDoc.pageCount - 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={currentPageNum <= 0} onClick={() => setCurrentPageNum(currentPageNum - 1)}>←</Button>
        <span className="text-sm">Page {currentPageNum + 1} / {loadedDoc.pageCount}</span>
        <Button variant="outline" disabled={currentPageNum >= last} onClick={() => setCurrentPageNum(currentPageNum + 1)}>→</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <PageImage />
        <OcrTextarea />
        <FixPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/EditorView.tsx
git commit -m "feat: 3-column editor view"
```

---

### Task 31: ExportPanel + CostSummary + RunHistory display

**Files:**
- Create: `/root/llm_ocr_web/src/components/ExportPanel.tsx`
- Create: `/root/llm_ocr_web/src/components/CostSummary.tsx`
- Create: `/root/llm_ocr_web/src/components/RunHistory.tsx`

- [ ] **Step 1: Write `src/components/ExportPanel.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { joinPages } from '../docx/markdown';
import { mdToDocxBlob, downloadBlob } from '../docx/export';
import { Button } from './ui/button';

export function ExportPanel() {
  const { pages, fileName } = useProject();
  const md = useMemo(() => joinPages(pages), [pages]);
  const [busy, setBusy] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    try {
      const blob = await mdToDocxBlob(md);
      const stem = fileName.replace(/\.[^.]+$/, '') || 'ocr';
      downloadBlob(blob, `${stem}_ocr.docx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={onDownload} disabled={!md || busy}>
        {busy ? 'Building DOCX…' : 'Download .docx'}
      </Button>
      <div>
        <h3 className="font-bold mb-1">Markdown preview</h3>
        <pre dir="rtl" className="border rounded p-2 max-h-[60vh] overflow-auto whitespace-pre-wrap font-serif text-sm bg-gray-50">
          {md || '(no OCR’d pages yet)'}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/CostSummary.tsx`**

```tsx
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { estimateCost } from '../ai/pricing';

export function CostSummary() {
  const { pages } = useProject();
  const { settings } = useSettings();
  const totalIn = pages.reduce((n, p) => n + (p.tokensIn ?? 0), 0);
  const totalOut = pages.reduce((n, p) => n + (p.tokensOut ?? 0), 0);
  let cost = 0;
  try { cost = estimateCost(settings.model, { tokensIn: totalIn, tokensOut: totalOut }); }
  catch { cost = 0; }
  return (
    <div className="text-xs text-gray-600 border rounded p-2 inline-block">
      Estimated: {totalIn.toLocaleString()} in / {totalOut.toLocaleString()} out tokens
      {' — '}<strong>${cost.toFixed(4)}</strong>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/RunHistory.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { loadRuns } from '../store/runHistory';
import type { RunRecord } from '../lib/types';

export function RunHistory() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => { setRuns(loadRuns()); }, []);
  if (runs.length === 0) return <p className="text-sm text-gray-500">No runs yet.</p>;
  return (
    <table className="text-sm w-full">
      <thead className="text-left text-xs text-gray-600">
        <tr><th>When</th><th>File</th><th>Model</th><th>OK / Fail</th><th>Cost</th></tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-t">
            <td>{new Date(r.ts).toLocaleString()}</td>
            <td className="truncate max-w-[180px]">{r.fileName}</td>
            <td>{r.model}</td>
            <td>{r.pagesOk}/{r.pagesFailed}</td>
            <td>{r.costUsd ? `$${r.costUsd.toFixed(4)}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ExportPanel.tsx src/components/CostSummary.tsx src/components/RunHistory.tsx
git commit -m "feat: export, cost summary, run history components"
```

---

# Phase 8 — Wire-up and verification

### Task 32: App shell with tabs

**Files:**
- Modify: `/root/llm_ocr_web/src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsProvider } from './store/SettingsContext';
import { ProjectProvider } from './store/ProjectContext';
import { SettingsPanel } from './components/SettingsPanel';
import { FileDrop } from './components/FileDrop';
import { PageList } from './components/PageList';
import { BatchRunner } from './components/BatchRunner';
import { EditorView } from './components/EditorView';
import { ExportPanel } from './components/ExportPanel';
import { CostSummary } from './components/CostSummary';
import { RunHistory } from './components/RunHistory';

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ProjectProvider>
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            <header className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">LLM OCR — Jewish Texts</h1>
              <CostSummary />
            </header>
            <Tabs defaultValue="ocr">
              <TabsList>
                <TabsTrigger value="setup">Setup</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="export">Export</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="setup"><SettingsPanel /></TabsContent>
              <TabsContent value="ocr">
                <div className="space-y-4">
                  <FileDrop />
                  <BatchRunner />
                  <PageList />
                </div>
              </TabsContent>
              <TabsContent value="editor"><EditorView /></TabsContent>
              <TabsContent value="export"><ExportPanel /></TabsContent>
              <TabsContent value="history"><RunHistory /></TabsContent>
            </Tabs>
          </div>
        </ProjectProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /root/llm_ocr_web && npx tsc --noEmit
```

Expected: no errors. If any tab-shadcn primitive uses different prop names (e.g., the copied `tabs.tsx`), adjust the imports/JSX accordingly.

- [ ] **Step 3: Build**

```bash
cd /root/llm_ocr_web && npm run build
```

Expected: clean build, `dist/` populated.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up app shell with tabs"
```

---

### Task 33: Run all tests and dev server smoke test

**Files:** none

- [ ] **Step 1: Run the entire test suite**

```bash
cd /root/llm_ocr_web && npm test
```

Expected: all suites green. Module count: 9 test files, ~30+ tests total.

- [ ] **Step 2: Start the dev server**

```bash
cd /root/llm_ocr_web && npm run dev
```

Expected: Vite prints a local URL.

- [ ] **Step 3: Manual smoke test (do this in a real browser; the agent should report what it cannot verify)**

Open the URL printed by `npm run dev`. Check:
- Setup tab loads, fields are populated with defaults.
- Drop a small PDF on the OCR tab → page count appears, page chips render in PageList.
- Without an API key set, click Start → see "API key is required" in the log; nothing crashes.
- Switch to Editor tab → image renders for page 1, textarea is empty (no OCR yet).
- Set a real API key on Setup tab → start a batch of 1–2 pages → OCR succeeds → status flips to green → switch to Editor → text shows up RTL next to image.
- On Editor tab → click "General Fix" → diff cards render (or "No corrections found"). Accept one → page text updates and persists.
- Reload the browser → re-drop the same PDF → previously OCR'd pages restored from IndexedDB (status chips green immediately).
- On Export tab → preview shows joined markdown → click Download → DOCX downloads, opens in Word with RTL paragraphs and bold preserved.

If any item fails, file the bug as a follow-up task; do not modify the plan retroactively. Report findings.

- [ ] **Step 4: Commit any small follow-up fixes if needed**

For each follow-up, separate commit. Do not bundle.

```bash
# example
git add <file>
git commit -m "fix: <short description>"
```

---

### Task 34: README

**Files:**
- Create: `/root/llm_ocr_web/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# llm_ocr_web

Static, browser-based app that OCRs Hebrew/Jewish texts using vision LLMs
(Anthropic, Google, OpenAI, Vercel AI Gateway), provides a side-by-side
image + text editor with LLM-driven proofread suggestions as accept/reject
diff cards, and exports the result as DOCX.

Inspired by `~/llm_ocr/main.py` (Flet desktop) and `~/pdf_proofread`
(static PDF proofreader). Pure client-side; no backend.

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README"
```

---

## Self-review checklist

The following spec sections map to plan tasks. Use this list to verify nothing was dropped:

- Spec § Stack → Task 1 (deps), Task 2 (Tailwind), Task 21 (UI primitives).
- Spec § Providers → Task 6 (`providers.ts`), Task 24 (SettingsPanel route/model dropdowns).
- Spec § Architecture overview → Tasks 19/20 (contexts), 32 (shell + tabs).
- Spec § Tabs (Setup/OCR/Editor/Export) → Tasks 24/26+25/30/31 + 32.
- Spec § Module layout → Tasks 4–18, 19–31.
- Spec § Key types → Task 4.
- Spec § Data flow §1 Load → Task 23 (FileDrop), Task 10 (persistence rehydrate).
- Spec § Data flow §2 OCR batch → Task 15 (orchestrator), Task 26 (BatchRunner).
- Spec § Data flow §3 Edit + AI proofread → Tasks 12/14/16/27/28/29.
- Spec § Data flow §4 Export → Tasks 17/18/31.
- Spec § Persistence → Tasks 5/10/11.
- Spec § Error handling → Tasks 14 (parser tolerance), 15 (retry/abort), 22 (boundary), 26 (no-key surface).
- Spec § Testing → Tasks 5–17 each include test files; Task 33 runs the suite.
- Spec § Build & deploy → Tasks 1, 3, 32, 34.

## Execution Handoff

Plan complete and saved to `/root/llm_ocr_web/docs/superpowers/plans/2026-05-10-llm-ocr-web.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
