# Inline Diff Editor + Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a minimal char-level inline diff inside the page-text editor, show the full original ⇒ corrected text on one line in the correction card, and allow Restore from accepted/rejected back to pending (reverting the text edit when restoring an accept).

**Architecture:** A new pure helper `planInlineDiff(pageText, corrections)` returns a flat segment plan (eq / del / ins / applied / plain). A new `InlineDiffEditor` component renders that plan into a contenteditable `<div>` (or falls back to the existing `<Textarea>` when no corrections exist), with `ins` and `applied` spans marked `contenteditable=false`. A second pure helper `extractEditorText(root)` walks the DOM and reconstructs the page text by skipping `ins` previews. Corrections state is lifted from `FixPanel` to `ProjectContext` so the editor can read pending corrections without prop drilling. `DiffCard` is reworked to show the full old⇒new line plus per-status Restore. `FixPanel` gains `restore` / `restoreAll`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest (jsdom), Tailwind. Existing `diff` library for char diff.

**Spec:** `docs/superpowers/specs/2026-05-12-inline-diff-editor-design.md`

---

## Task 1: `planInlineDiff` pure helper

**Files:**
- Create: `src/lib/inlineDiff.ts`
- Test: `src/lib/inlineDiff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/inlineDiff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planInlineDiff } from './inlineDiff';
import type { Correction } from './types';

const mkC = (over: Partial<Correction> & Pick<Correction, 'id' | 'old' | 'new'>): Correction => ({
  reason: '',
  status: 'pending',
  ...over,
});

describe('planInlineDiff', () => {
  it('returns a single plain segment when there are no corrections', () => {
    const out = planInlineDiff('hello world', []);
    expect(out).toEqual([{ kind: 'plain', text: 'hello world' }]);
  });

  it('emits empty array for empty text', () => {
    const out = planInlineDiff('', []);
    expect(out).toEqual([]);
  });

  it('renders a pending correction in the middle of the text with charDiff inside', () => {
    const text = 'before אבג after';
    const c = mkC({ id: 'c1', old: 'אבג', new: 'אבד' });
    const out = planInlineDiff(text, [c]);
    expect(out[0]).toEqual({ kind: 'plain', text: 'before ' });
    // diff between אבג and אבד → eq "אב", del "ג", ins "ד"
    expect(out[1]).toEqual({ kind: 'eq', text: 'אב', cid: 'c1' });
    expect(out[2]).toEqual({ kind: 'del', text: 'ג', cid: 'c1' });
    expect(out[3]).toEqual({ kind: 'ins', text: 'ד', cid: 'c1' });
    expect(out[4]).toEqual({ kind: 'plain', text: ' after' });
  });

  it('skips a pending correction whose old text is not present', () => {
    const c = mkC({ id: 'c1', old: 'zzz', new: 'aaa' });
    const out = planInlineDiff('hello world', [c]);
    expect(out).toEqual([{ kind: 'plain', text: 'hello world' }]);
  });

  it('orders multiple corrections by position and drops overlaps', () => {
    const text = 'aaa BBB ccc DDD eee';
    const c1 = mkC({ id: 'c1', old: 'DDD', new: 'XXX' });   // appears later
    const c2 = mkC({ id: 'c2', old: 'BBB', new: 'YYY' });   // appears earlier
    const c3 = mkC({ id: 'c3', old: 'BB ccc', new: 'ZZ' }); // overlaps with c2 → dropped
    const out = planInlineDiff(text, [c1, c2, c3]);
    const cids = out.filter((s): s is Extract<typeof s, { cid: string }> => 'cid' in s).map((s) => s.cid);
    expect(cids).toContain('c1');
    expect(cids).toContain('c2');
    expect(cids).not.toContain('c3');
    // Order in output: c2 before c1
    const firstC1 = out.findIndex((s) => 'cid' in s && s.cid === 'c1');
    const firstC2 = out.findIndex((s) => 'cid' in s && s.cid === 'c2');
    expect(firstC2).toBeLessThan(firstC1);
  });

  it('renders an accepted correction as an applied segment around c.new', () => {
    const text = 'foo NEW bar';
    const c = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'accepted' });
    const out = planInlineDiff(text, [c]);
    expect(out).toEqual([
      { kind: 'plain', text: 'foo ' },
      { kind: 'applied', text: 'NEW', cid: 'c1' },
      { kind: 'plain', text: ' bar' },
    ]);
  });

  it('ignores rejected corrections (renders surrounding text as plain)', () => {
    const text = 'foo OLD bar';
    const c = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'rejected' });
    const out = planInlineDiff(text, [c]);
    expect(out).toEqual([{ kind: 'plain', text: 'foo OLD bar' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/inlineDiff.test.ts`
Expected: FAIL — module `./inlineDiff` not found.

- [ ] **Step 3: Implement `planInlineDiff`**

Create `src/lib/inlineDiff.ts`:

```ts
import type { Correction } from './types';
import { charDiff } from './diff';

export type InlineSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'eq'; text: string; cid: string }
  | { kind: 'del'; text: string; cid: string }
  | { kind: 'ins'; text: string; cid: string }
  | { kind: 'applied'; text: string; cid: string };

interface Hit {
  cid: string;
  start: number;
  end: number; // exclusive
  kind: 'pending' | 'applied';
  oldText: string;
  newText: string;
}

export function planInlineDiff(pageText: string, corrections: Correction[]): InlineSegment[] {
  if (pageText.length === 0) return [];

  const hits: Hit[] = [];
  for (const c of corrections) {
    if (c.status === 'pending') {
      const start = pageText.indexOf(c.old);
      if (start < 0) continue;
      hits.push({ cid: c.id, start, end: start + c.old.length, kind: 'pending', oldText: c.old, newText: c.new });
    } else if (c.status === 'accepted') {
      const start = pageText.indexOf(c.new);
      if (start < 0) continue;
      hits.push({ cid: c.id, start, end: start + c.new.length, kind: 'applied', oldText: c.old, newText: c.new });
    }
    // 'rejected' → ignored
  }

  hits.sort((a, b) => a.start - b.start);

  // Drop overlaps: keep the earlier-starting one, drop later overlappers.
  const kept: Hit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start < lastEnd) continue;
    kept.push(h);
    lastEnd = h.end;
  }

  const out: InlineSegment[] = [];
  let cursor = 0;
  for (const h of kept) {
    if (h.start > cursor) {
      out.push({ kind: 'plain', text: pageText.slice(cursor, h.start) });
    }
    if (h.kind === 'applied') {
      out.push({ kind: 'applied', text: h.newText, cid: h.cid });
    } else {
      for (const part of charDiff(h.oldText, h.newText)) {
        if (part.kind === 'eq') out.push({ kind: 'eq', text: part.text, cid: h.cid });
        else if (part.kind === 'del') out.push({ kind: 'del', text: part.text, cid: h.cid });
        else out.push({ kind: 'ins', text: part.text, cid: h.cid });
      }
    }
    cursor = h.end;
  }
  if (cursor < pageText.length) {
    out.push({ kind: 'plain', text: pageText.slice(cursor) });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/inlineDiff.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inlineDiff.ts src/lib/inlineDiff.test.ts
git commit -m "feat: planInlineDiff pure helper for inline correction rendering"
```

---

## Task 2: `extractEditorText` pure helper (DOM round-trip)

**Files:**
- Modify: `src/lib/inlineDiff.ts` (add `extractEditorText` export)
- Modify: `src/lib/inlineDiff.test.ts` (add round-trip tests)

- [ ] **Step 1: Write the failing round-trip test**

Append to `src/lib/inlineDiff.test.ts`:

```ts
import { extractEditorText } from './inlineDiff';

function renderToDom(segments: ReturnType<typeof planInlineDiff>): HTMLElement {
  const root = document.createElement('div');
  for (const s of segments) {
    if (s.kind === 'plain') {
      root.appendChild(document.createTextNode(s.text));
      continue;
    }
    const span = document.createElement('span');
    span.dataset.kind = s.kind;
    if ('cid' in s) span.dataset.cid = s.cid;
    if (s.kind === 'ins' || s.kind === 'applied') span.setAttribute('contenteditable', 'false');
    if (s.kind === 'ins') span.dataset.ins = 'true';
    span.textContent = s.text;
    root.appendChild(span);
  }
  return root;
}

describe('extractEditorText', () => {
  it('returns plain text for an empty editor', () => {
    const root = document.createElement('div');
    expect(extractEditorText(root)).toBe('');
  });

  it('round-trips: planInlineDiff -> render -> extract === pageText', () => {
    const text = 'before אבג after';
    const c: Correction = mkC({ id: 'c1', old: 'אבג', new: 'אבד' });
    const segs = planInlineDiff(text, [c]);
    const root = renderToDom(segs);
    expect(extractEditorText(root)).toBe(text);
  });

  it('round-trips with an accepted correction (applied span is part of underlying text)', () => {
    const text = 'foo NEW bar';
    const c: Correction = mkC({ id: 'c1', old: 'OLD', new: 'NEW', status: 'accepted' });
    const segs = planInlineDiff(text, [c]);
    const root = renderToDom(segs);
    expect(extractEditorText(root)).toBe(text);
  });

  it('reflects edits inside plain regions', () => {
    const segs = planInlineDiff('hello world', []);
    const root = renderToDom(segs);
    // simulate user editing the text node
    (root.firstChild as Text).textContent = 'hello brave world';
    expect(extractEditorText(root)).toBe('hello brave world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/inlineDiff.test.ts`
Expected: FAIL — `extractEditorText` is not exported.

- [ ] **Step 3: Implement `extractEditorText`**

Append to `src/lib/inlineDiff.ts`:

```ts
export function extractEditorText(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.dataset.ins === 'true') return; // skip preview span
      for (const child of Array.from(el.childNodes)) walk(child);
    }
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/inlineDiff.test.ts`
Expected: PASS — all tests including the four new round-trip ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inlineDiff.ts src/lib/inlineDiff.test.ts
git commit -m "feat: extractEditorText reconstructs page text from contenteditable DOM"
```

---

## Task 3: Lift corrections state into `ProjectContext`

**Files:**
- Modify: `src/store/ProjectContext.tsx`

- [ ] **Step 1: Add corrections fields to the context type**

Edit `src/store/ProjectContext.tsx`. Replace the existing `Ctx` interface with:

```tsx
import type { PageResult, Status, Correction } from '../lib/types';

interface Ctx {
  loadedDoc: LoadedDoc | null;
  fileHash: string;
  fileName: string;
  pages: PageResult[];
  currentPageNum: number;
  selectedPages: Set<number>;
  corrections: Correction[];
  setProject: (args: { doc: LoadedDoc; fileHash: string; fileName: string; restored: PageResult[] }) => void;
  resetProject: () => void;
  setPage: (page: PageResult) => void;
  setPageStatus: (pageNum: number, status: Status, extra?: Partial<PageResult>) => void;
  setCurrentPageNum: (n: number) => void;
  togglePageSelected: (n: number) => void;
  clearSelection: () => void;
  setCorrections: (next: Correction[] | ((prev: Correction[]) => Correction[])) => void;
}
```

- [ ] **Step 2: Add corrections state, reset it on project / page change**

In `ProjectProvider`, add the state and wire it through. Replace the body of `ProjectProvider` with:

```tsx
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPageNum, setCurrentPageNumRaw] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());
  const [corrections, setCorrections] = useState<Correction[]>([]);

  const setCurrentPageNum = (n: number) => {
    setCurrentPageNumRaw(n);
    setCorrections([]);
  };

  const ctx: Ctx = useMemo(() => ({
    loadedDoc,
    fileHash,
    fileName,
    pages,
    currentPageNum,
    selectedPages,
    corrections,
    setProject: ({ doc, fileHash, fileName, restored }) => {
      setLoadedDoc(doc);
      setFileHash(fileHash);
      setFileName(fileName);
      const init: PageResult[] = Array.from({ length: doc.pageCount }, (_, i) => {
        const found = restored.find((r) => r.pageNum === i);
        return found ?? { pageNum: i, text: '', status: 'pending' as Status };
      });
      setPages(init);
      setCurrentPageNumRaw(0);
      setSelectedPages(new Set());
      setCorrections([]);
    },
    resetProject: () => {
      setLoadedDoc(null);
      setFileHash('');
      setFileName('');
      setPages([]);
      setCurrentPageNumRaw(0);
      setSelectedPages(new Set());
      setCorrections([]);
    },
    setPage: (p) => setPages((arr) => arr.map((x) => (x.pageNum === p.pageNum ? p : x))),
    setPageStatus: (n, status, extra) =>
      setPages((arr) => arr.map((x) => (x.pageNum === n ? { ...x, status, ...extra } : x))),
    setCurrentPageNum,
    togglePageSelected: (n) => setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    }),
    clearSelection: () => setSelectedPages(new Set()),
    setCorrections,
  }), [loadedDoc, fileHash, fileName, pages, currentPageNum, selectedPages, corrections]);

  return <ProjectCtx.Provider value={ctx}>{children}</ProjectCtx.Provider>;
}
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — no test references the new field yet; the type just compiles.

- [ ] **Step 4: Commit**

```bash
git add src/store/ProjectContext.tsx
git commit -m "refactor: lift corrections state into ProjectContext"
```

---

## Task 4: New `InlineDiffEditor` component

**Files:**
- Create: `src/components/InlineDiffEditor.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/InlineDiffEditor.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { savePageResult } from '../store/persistence';
import { planInlineDiff, extractEditorText, type InlineSegment } from '../lib/inlineDiff';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const SEG_CLASS: Record<InlineSegment['kind'], string> = {
  plain: '',
  eq: '',
  del: 'bg-red-100 line-through decoration-red-500',
  ins: 'bg-green-100 text-green-800 px-0.5 mx-0.5 rounded',
  applied: 'underline decoration-green-500 decoration-2 underline-offset-2',
};

export function InlineDiffEditor() {
  const { pages, currentPageNum, fileHash, setPage, corrections } = useProject();
  const page = pages.find((p) => p.pageNum === currentPageNum);
  const pageText = page?.text ?? '';

  const [dirty, setDirty] = useState(false);
  const [plainDraft, setPlainDraft] = useState(pageText);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastPaintedSig = useRef<string>('');

  useEffect(() => {
    setPlainDraft(pageText);
    setDirty(false);
  }, [currentPageNum, pageText]);

  const hasRelevantCorrections = corrections.some(
    (c) => c.status === 'pending' || c.status === 'accepted',
  );

  const sigOf = (text: string, cs: typeof corrections) =>
    text + '|' + cs.map((c) => `${c.id}:${c.status}`).join(',');

  // Paint the contenteditable DOM whenever the (pageText, corrections) pair
  // changes since the last paint. While the user is typing, pageText in the
  // context does NOT change (we only save on blur), so this effect does not
  // fire on every keystroke and the caret is preserved.
  useLayoutEffect(() => {
    if (!hasRelevantCorrections || !editorRef.current) return;
    const sig = sigOf(pageText, corrections);
    if (lastPaintedSig.current === sig) return;
    const root = editorRef.current;
    root.innerHTML = '';
    const segments = planInlineDiff(pageText, corrections);
    for (const s of segments) {
      if (s.kind === 'plain') {
        root.appendChild(document.createTextNode(s.text));
        continue;
      }
      const span = document.createElement('span');
      span.dataset.kind = s.kind;
      span.dataset.cid = s.cid;
      span.className = SEG_CLASS[s.kind];
      if (s.kind === 'ins' || s.kind === 'applied') {
        span.setAttribute('contenteditable', 'false');
      }
      if (s.kind === 'ins') span.dataset.ins = 'true';
      span.textContent = s.text;
      root.appendChild(span);
    }
    lastPaintedSig.current = sig;
  }, [pageText, corrections, hasRelevantCorrections]);

  const onInput = () => {
    if (!editorRef.current) return;
    const next = extractEditorText(editorRef.current);
    // Mark the current DOM as "already painted" against the typed text so that
    // when the next save lands and pageText becomes `next`, the layout effect
    // sees a matching signature and skips re-painting (which would wipe caret).
    lastPaintedSig.current = sigOf(next, corrections);
    setPlainDraft(next);
    setDirty(true);
  };

  const save = () => {
    if (!page) return;
    const updated = { ...page, text: plainDraft, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setDirty(false);
  };

  if (!hasRelevantCorrections) {
    // Plain textarea path — preserves the existing UX exactly.
    return (
      <div className="flex flex-col h-[70vh]">
        <Textarea
          dir="rtl"
          value={plainDraft}
          onChange={(e) => { setPlainDraft(e.target.value); setDirty(true); }}
          onBlur={() => { if (dirty) save(); }}
          className="flex-1 text-right font-serif text-base leading-relaxed"
          placeholder={page?.status === 'pending' ? "(not yet OCR'd)" : ''}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">
            Page {currentPageNum + 1} — {plainDraft.length} chars — {page?.status ?? '—'}
          </span>
          <Button onClick={save} disabled={!dirty}>Save Text</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div
        ref={editorRef}
        dir="rtl"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={() => { if (dirty) save(); }}
        className={cn(
          'flex-1 text-right font-serif text-base leading-relaxed',
          'border rounded-md px-3 py-2 overflow-auto',
          'focus:outline-none focus:ring-2 focus:ring-blue-400',
          'whitespace-pre-wrap break-words',
        )}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-500">
          Page {currentPageNum + 1} — {plainDraft.length} chars — {page?.status ?? '—'} — diff view
        </span>
        <Button onClick={save} disabled={!dirty}>Save Text</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/InlineDiffEditor.tsx
git commit -m "feat: InlineDiffEditor renders inline correction diffs in contenteditable"
```

---

## Task 5: Swap `OcrTextarea` for `InlineDiffEditor` in `EditorView`

**Files:**
- Modify: `src/components/EditorView.tsx`
- Delete: `src/components/OcrTextarea.tsx` (replaced)

- [ ] **Step 1: Update `EditorView` to use the new editor**

Edit `src/components/EditorView.tsx`. Replace the file contents with:

```tsx
import { useProject } from '../store/ProjectContext';
import { PageImage } from './PageImage';
import { InlineDiffEditor } from './InlineDiffEditor';
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
        <InlineDiffEditor />
        <FixPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the obsolete `OcrTextarea.tsx`**

```bash
git rm src/components/OcrTextarea.tsx
```

- [ ] **Step 3: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no test imports `OcrTextarea`.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditorView.tsx
git commit -m "refactor: EditorView uses InlineDiffEditor; remove OcrTextarea"
```

---

## Task 6: `FixPanel` — use lifted corrections + Restore handlers

**Files:**
- Modify: `src/components/FixPanel.tsx`

- [ ] **Step 1: Replace `FixPanel` body to read corrections from context and add restore actions**

Edit `src/components/FixPanel.tsx`. Replace the file contents with:

```tsx
import { useEffect, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { createModel } from '../ai/providers';
import { correctPage } from '../ai/correct';
import { renderPageToPng } from '../pdf/render';
import { substitute } from '../runner/prompt';
import { savePageResult } from '../store/persistence';
import type { FixMode } from '../lib/types';
import { DiffCard } from './DiffCard';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const MODES: FixMode[] = ['general', 'headers', 'punctuation', 'custom'];
const MODE_LABEL: Record<FixMode, string> = {
  general: 'General',
  headers: 'Headers',
  punctuation: 'Punctuation',
  custom: 'Custom',
};

export function FixPanel() {
  const { settings } = useSettings();
  const {
    loadedDoc, fileHash, currentPageNum, pages, setPage,
    corrections, setCorrections,
  } = useProject();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [prompt, setPrompt] = useState<string>(() => settings.prompts.general);

  useEffect(() => {
    setStatus('');
  }, [currentPageNum]);

  const page = pages.find((p) => p.pageNum === currentPageNum);

  const loadTemplate = (mode: FixMode) => {
    setPrompt(settings.prompts[mode]);
    setStatus(`Loaded "${MODE_LABEL[mode]}" template.`);
  };

  const run = async () => {
    if (!loadedDoc || !page) return;
    if (!page.text.trim()) {
      setStatus('No text on this page yet — OCR it first.');
      return;
    }
    if (!prompt.trim()) {
      setStatus('Prompt is empty.');
      return;
    }
    setRunning(true);
    setStatus('Running…');
    try {
      const model = createModel(settings);
      const img = await renderPageToPng(loadedDoc, currentPageNum);
      const filled = substitute(prompt, { text: page.text });
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

  const restore = (id: string) => {
    if (!page) return;
    const c = corrections.find((x) => x.id === id);
    if (!c) return;
    if (c.status === 'rejected') {
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)));
      return;
    }
    if (c.status === 'accepted') {
      if (!page.text.includes(c.new)) return; // can't restore — text changed
      const updatedText = page.text.replace(c.new, c.old);
      const updated = { ...page, text: updatedText, status: 'edited' as const };
      setPage(updated);
      savePageResult(fileHash, updated);
      setCorrections((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)));
    }
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

  const restoreAll = () => {
    if (!page) return;
    let text = page.text;
    const next = corrections.map((c) => {
      if (c.status === 'rejected') return { ...c, status: 'pending' as const };
      if (c.status === 'accepted') {
        if (!text.includes(c.new)) return c; // skip — can't restore
        text = text.replace(c.new, c.old);
        return { ...c, status: 'pending' as const };
      }
      return c;
    });
    const updated = { ...page, text, status: 'edited' as const };
    setPage(updated);
    savePageResult(fileHash, updated);
    setCorrections(next);
  };

  const hasPending = corrections.some((c) => c.status === 'pending');
  const hasResolved = corrections.some((c) => c.status !== 'pending');
  const currentPageText = page?.text ?? '';

  return (
    <div className="flex flex-col h-[70vh] space-y-2 overflow-auto">
      <h3 className="font-bold">AI Correction</h3>
      <div>
        <div className="text-xs text-gray-500 mb-1">Load template:</div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <Button
              key={m}
              onClick={() => loadTemplate(m)}
              variant="outline"
              className="text-xs h-7 px-2"
              disabled={running || (m === 'custom' && !settings.prompts.custom.trim())}
            >
              {MODE_LABEL[m]}
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        placeholder="Write your correction prompt here. Use {text} for the current page text."
      />
      <Button onClick={run} disabled={running || !prompt.trim()} className="text-xs">
        {running ? 'Running…' : 'Run'}
      </Button>
      <p className="text-xs text-gray-600">{status}</p>
      <div className="flex flex-wrap gap-2">
        {hasPending && (
          <>
            <Button onClick={acceptAll} className="text-xs h-7">Accept All</Button>
            <Button variant="outline" onClick={rejectAll} className="text-xs h-7">Reject All</Button>
          </>
        )}
        {hasResolved && (
          <Button variant="outline" onClick={restoreAll} className="text-xs h-7">Restore All</Button>
        )}
      </div>
      <div className="space-y-2 flex-1 overflow-auto">
        {corrections.map((c) => (
          <DiffCard
            key={c.id}
            correction={c}
            pageText={currentPageText}
            onAccept={accept}
            onReject={reject}
            onRestore={restore}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `DiffCard` doesn't yet accept `pageText` or `onRestore` (fixed in Task 7). That's expected; proceed.

- [ ] **Step 3: No commit yet — Task 7 must land first to keep the tree compiling**

Skip commit; go directly to Task 7.

---

## Task 7: `DiffCard` — one-line full old⇒new + Restore

**Files:**
- Modify: `src/components/DiffCard.tsx`

- [ ] **Step 1: Replace `DiffCard` contents**

Edit `src/components/DiffCard.tsx`. Replace the file contents with:

```tsx
import type { Correction } from '../lib/types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Props {
  correction: Correction;
  pageText: string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;
}

export function DiffCard({ correction, pageText, onAccept, onReject, onRestore }: Props) {
  const cardBg =
    correction.status === 'accepted' ? 'bg-green-50 border-green-300' :
    correction.status === 'rejected' ? 'bg-gray-100 opacity-60 border-gray-300' :
    'bg-white border-gray-300';

  const canRestoreAccepted =
    correction.status !== 'accepted' || pageText.includes(correction.new);

  return (
    <div className={cn('border rounded p-2 text-sm space-y-1', cardBg)}>
      <div dir="rtl" className="font-serif leading-relaxed">
        <span className="bg-red-100 line-through decoration-red-500 px-1 rounded">
          {correction.old}
        </span>
        <span className="mx-1 text-gray-500">⇐</span>
        <span className="bg-green-100 text-green-800 px-1 rounded">
          {correction.new}
        </span>
      </div>
      {correction.reason && <div className="text-xs text-gray-600">{correction.reason}</div>}
      {correction.status === 'pending' && (
        <div className="flex gap-1">
          <Button onClick={() => onAccept(correction.id)} className="h-7 text-xs">Accept</Button>
          <Button variant="outline" onClick={() => onReject(correction.id)} className="h-7 text-xs">Reject</Button>
        </div>
      )}
      {correction.status === 'accepted' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-700">Accepted</span>
          <Button
            variant="outline"
            onClick={() => onRestore(correction.id)}
            className="h-7 text-xs"
            disabled={!canRestoreAccepted}
            title={canRestoreAccepted ? undefined : 'Text changed — cannot restore'}
          >
            Restore
          </Button>
          {!canRestoreAccepted && (
            <span className="text-xs text-gray-500">text changed</span>
          )}
        </div>
      )}
      {correction.status === 'rejected' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Rejected</span>
          <Button
            variant="outline"
            onClick={() => onRestore(correction.id)}
            className="h-7 text-xs"
          >
            Restore
          </Button>
        </div>
      )}
    </div>
  );
}
```

Note: the arrow points `⇐` because the surrounding container is RTL — visually it reads "old ⇒ new" in the right-to-left flow.

- [ ] **Step 2: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — typecheck clean, all tests green.

- [ ] **Step 3: Build to confirm no Vite/Tailwind issues**

Run: `npm run build`
Expected: PASS — `tsc && vite build` completes.

- [ ] **Step 4: Commit Tasks 6 + 7 together**

```bash
git add src/components/FixPanel.tsx src/components/DiffCard.tsx
git commit -m "feat: restore action + full old⇒new card layout"
```

---

## Task 8: Manual browser smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite prints a local URL (e.g. `http://localhost:5173/llm_ocr/`).

- [ ] **Step 2: Walk through the feature in a browser**

In the browser at the printed URL, verify:

- Load a small PDF, OCR a page (or paste text into a fresh OCR result).
- Run an AI correction so at least one correction is returned.
- Editor view (middle column):
  - Each pending correction shows minimal char-level inline highlight: red strikethrough on changed chars of the old text, green pill with the inserted chars right next to them.
  - Typing in the surrounding plain text updates the underlying page text (check the char count in the footer).
- Card (right column):
  - Each card shows the full old text (red) ⇐/⇒ full new text (green) on one wrapping line.
  - No charDiff styling inside the card text itself.
- Accept one correction:
  - Card flips to green with "Accepted" + Restore button.
  - Editor shows that correction as `applied` style (subtle green underline) on the new text.
- Click Restore on the accepted correction:
  - Editor reverts to the pending diff view for that correction.
  - Card returns to pending state with Accept/Reject.
- Reject a different correction:
  - Card greys out, "Rejected" + Restore button.
  - Editor stops highlighting that correction.
- Click Restore on the rejected correction → card pending again, editor highlights again.
- Accept All / Reject All / Restore All buttons work as labeled.
- Edit text in the editor near an accepted correction so the new text no longer matches, then click Restore on its card → button is disabled with the "text changed" note. No crash.

- [ ] **Step 3: Stop the dev server and record the result in the PR/commit message**

If any of the above fails, debug — don't claim completion. If all pass, the feature is done.

---

## Self-review notes

- Spec coverage: every requirement in `docs/superpowers/specs/2026-05-12-inline-diff-editor-design.md` maps to a task — `planInlineDiff` (1), `extractEditorText` (2), corrections context lift (3), editor component (4 + 5), restore logic (6), card layout (7), smoke test (8).
- No placeholders, no "implement later", every code step includes the full code.
- Type continuity: `InlineSegment`, `Correction`, `corrections`/`setCorrections` signatures match across all tasks. `DiffCard` props are extended in Task 7 to match Task 6's call site (so Task 6's typecheck is intentionally deferred until 7 lands; this is called out in 6's Step 3).
