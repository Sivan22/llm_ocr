# Inline Diff Editor + Restore — Design

Date: 2026-05-12

## Goal

Make AI correction review feel like an IDE diff view:

1. The page-text editor shows the *minimal* (char-level) diff of pending corrections inline, while remaining editable.
2. The correction card shows the *full* original text → corrected text on one line (no charDiff inside the card).
3. Accepted or rejected corrections can be restored back to pending; restoring an accepted correction reverts the text change.

## Scope

Touches three files plus one new component and supporting helpers:

- `src/components/OcrTextarea.tsx` → replaced/augmented by a new `InlineDiffEditor` that handles both the no-corrections and with-corrections cases.
- `src/components/DiffCard.tsx` → reworked layout; new `onRestore` callback.
- `src/components/FixPanel.tsx` → owns corrections list today, must add `restore` / `restoreAll` handlers and pass them down.
- `src/store/ProjectContext.tsx` → corrections state is lifted here (new `corrections` + `setCorrections`), so `InlineDiffEditor` can read them without prop drilling.
- `src/lib/diff.ts` → no change; already exposes `charDiff`.
- New: `src/lib/inlineDiff.ts` → pure helper that, given page text and corrections list, returns a render plan (list of segments). Easy to unit-test.

Non-goals:

- Replacing the underlying editor library with a real CodeMirror/Lexical integration.
- Solving the multiple-occurrence ambiguity in `String.replace(c.old, c.new)` — kept identical to current accept logic.
- Animation, undo stack beyond per-correction Restore, multi-page diff view.

## Components

### `InlineDiffEditor` (replaces `OcrTextarea`)

Props (read from `useProject` context as today + new `corrections` prop):

```ts
interface Props {
  corrections: Correction[]; // pending + accepted + rejected for current page
}
```

Behavior:

- If `corrections.length === 0`, render a plain RTL `<Textarea>` exactly as today (same save-on-blur, same dirty tracking).
- Otherwise, render a contenteditable `<div dir="rtl">` containing flat inline spans (no nesting) produced by `planInlineDiff(page.text, corrections)`.

`planInlineDiff` returns an ordered list of segments:

```ts
type Segment =
  | { kind: 'plain'; text: string }                    // editable, normal style
  | { kind: 'eq'; text: string; cid: string }          // editable, normal style, inside a pending correction's c.old
  | { kind: 'del'; text: string; cid: string }         // editable text, red strikethrough — actual chars of c.old
  | { kind: 'ins'; text: string; cid: string }         // contenteditable=false preview pill, green — chars to be added
  | { kind: 'applied'; text: string; cid: string };    // editable, subtle green underline — c.new of an accepted correction
```

Build rules:

1. For each pending correction, find the first occurrence of `c.old` in `page.text`. If not found, skip (will be marked "no longer matches" on accept attempt). Sort matches by start offset; if two corrections overlap, the earlier-starting one wins and the later one is dropped from the render plan (still appears as a card; the editor just won't preview it).
2. For each pending correction's `c.old` span, compute `charDiff(c.old, c.new)` and emit a sequence of `eq` / `del` / `ins` segments interleaved at the right offset. `del` segments contain real chars from `page.text`; `ins` segments do not exist in `page.text`.
3. For each accepted correction, locate `c.new` in `page.text` and emit an `applied` segment (subtle styling).
4. Everything else is `plain`.
5. Rejected corrections are not rendered specially — they appear as plain text.

Rendering:

- Wrapper: `<div contenteditable suppressContentEditableWarning dir="rtl" className="…">`.
- Each segment maps to a `<span>` with classes per kind. `ins` and `applied` spans get `contenteditable="false"` and `data-ins="true"` / `data-applied="true"` for extraction.
- Spans carry `data-cid` so click handlers can highlight the corresponding card (nice-to-have, can be deferred — see Phase 2).

Extraction (`extractEditorText(rootEl): string`):

- Walk child nodes in document order.
- Text node → append `node.textContent`.
- Span node → if `data-ins="true"`, skip; otherwise recurse / take `textContent`.
- Result is the new page text, which goes into the same save path as today (`setPage` + `savePageResult`).

Edit semantics:

- Editor is fully editable. After every `input` event we extract the new text and update local state (debounced save on blur, same as today).
- Typing inside a `del` span mutates the underlying text — that correction will then fail to match on accept, which we already handle (`(no longer matches)` reason).
- Typing inside an `ins` span — these are `contenteditable=false`, so the browser prevents the caret from entering. Acceptable.

Caret/RTL quirks: documented and accepted. We don't try to mimic full IDE caret behavior across non-editable spans.

### `DiffCard`

New visual:

```
─── Card ───────────────────────────────
[old text, red bg]  ⇒  [new text, green bg]
Reason: …
[Accept] [Reject]               ← pending
[Restore]                       ← accepted or rejected
[Restore (cannot match)]        ← accepted but c.new not in page text
```

- Old and new wrap together on one line; on overflow they wrap naturally (RTL container, `flex-wrap` not needed — inline flow).
- The card no longer calls `charDiff`; that's moved to the editor.
- A small status pill ("Accepted" / "Rejected") can show next to the buttons row when not pending.

Props change:

```ts
interface Props {
  correction: Correction;
  pageText: string;        // for "can restore?" check (accepted state)
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;
}
```

The "can restore?" check (accepted state): `pageText.includes(c.new)`. If false, the Restore button is disabled with a tooltip / inline note "Text changed — cannot restore."

### `FixPanel`

Add:

- `restore(id)`:
  - Find correction. If status is `rejected` → set status to `pending`. Done.
  - If status is `accepted` → if `page.text.includes(c.new)`, replace first occurrence with `c.old`, save page, set status to `pending`. Else, do nothing (button is disabled in that state).
- `restoreAll()`: iterate over corrections; for each non-pending one, apply the same `restore(id)` logic in sequence. Order doesn't matter for correctness (we use `String.replace`, not offsets), but skipped ones (accepted with `c.new` missing) stay accepted.
- `hasResolved = corrections.some(c => c.status !== 'pending')` → drives a `Restore All` button next to the existing `Accept All` / `Reject All`.
- Pass the corrections array down to `InlineDiffEditor`. The cleanest path: lift corrections state out of `FixPanel` into `ProjectContext`, OR move `InlineDiffEditor` into a child of `FixPanel` / parent that has both.

Decision: keep corrections state in `FixPanel`, and lift to `EditorView` only what's needed by passing corrections via a small piece of shared context or via prop drilling. Simplest: convert `FixPanel`'s `corrections` into `ProjectContext` state so `OcrTextarea`/`InlineDiffEditor` can read it without prop drilling. This is a minor refactor of `ProjectContext` (one new field + setter).

## Data model

No changes to `Correction` shape — `status: 'pending' | 'accepted' | 'rejected'` already covers what we need; Restore just transitions back to `'pending'`.

## Testing

- `src/lib/inlineDiff.test.ts` (new):
  - Empty corrections → single `plain` segment.
  - Single pending correction at start / middle / end of text.
  - Two non-overlapping pending corrections in order.
  - Pending correction with `c.old` not in text → skipped.
  - Accepted correction with `c.new` in text → `applied` segment.
  - charDiff inside a correction produces `eq`/`del`/`ins` in the right places.
- `extractEditorText` round-trip: build segments → render to a JSDOM tree → extract → equals original page text. (Pure function over a DOM-like input; lightweight.)
- Restore logic: a `FixPanel` unit test (or restore helper extracted) covering:
  - Restore rejected → pending, no text change.
  - Restore accepted with `c.new` present → text reverted, status pending.
  - Restore accepted with `c.new` missing → no change.

UI smoke-test in browser:

- One pending correction → see strikethrough on changed chars in editor, green inline preview, reason in card, full old⇒new on one line.
- Accept → editor span flips to subtle green underline, card shows Restore.
- Click Restore → editor reverts, card pending again.
- Reject → editor span returns to plain text, card shows Restore.
- Restore rejected → card pending again.
- Edit page text in editor → underlying `page.text` updates and saves on blur.

## Rollout

Single PR. No flag — the editor automatically falls back to plain textarea when no corrections exist, so the common pre-OCR / no-AI-fix path is unchanged.
