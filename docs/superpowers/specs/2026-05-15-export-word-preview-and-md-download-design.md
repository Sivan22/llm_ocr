# Export panel: Word preview + Markdown download

## Goal

In the Export tab, replace the markdown-only preview with a tabbed preview that defaults to a Word-rendered view of the actual generated `.docx`, and add a `.md` download button alongside the existing `.docx` download.

## Motivation

Users export results as `.docx`, but the current preview shows raw markdown — not what they'll see when they open the file. Showing the rendered `.docx` gives an accurate WYSIWYG preview. A `.md` download is also useful for users who want to post-process the OCR output in plain text without round-tripping through Word.

## Scope

In scope:
- `src/components/ExportPanel.tsx`: layout changes, tabs, two download buttons, async Word rendering.
- `src/i18n/translations.ts`: new keys for the markdown download button, tab labels, and rendering state.
- New dependency: `docx-preview`.

Out of scope:
- Changes to `src/docx/export.ts` (`mdToDocxBlob`, `downloadBlob`) — reused as-is for both downloads and preview.
- Changes to `src/docx/markdown.ts` (`joinPages`).
- Any change to how OCR text is generated or stored.

## Design

### Dependency

Add `docx-preview` to `dependencies` in `package.json`. It renders a `.docx` Blob/ArrayBuffer into HTML inside a container element. RTL, headings, bold/italic, and the document section setup produced by `docx` are all supported.

### Component layout (`ExportPanel.tsx`)

```
[ Download .docx ] [ Download .md ]

[ Word | Markdown ]       <- Radix Tabs (existing ui/tabs.tsx)
+--------------------------------+
|                                |
|  Word: rendered .docx          |
|  Markdown: existing <pre> text |
|                                |
+--------------------------------+
```

- Two `Button`s in a flex row at the top, both disabled when `!md || busy`.
- `Tabs` with two `TabsTrigger`s: `Word` (default) and `Markdown`.
- `Word` tab content: a `div` with `ref={containerRef}`, `dir="rtl"`, `max-h-[60vh]`, `overflow-auto`, `border rounded p-2 bg-white`. While rendering, it shows the `export.rendering` placeholder text. On error, it shows a fallback message (does not throw).
- `Markdown` tab content: the existing `<pre>` block, unchanged styling.

### Word rendering flow

- `useMemo`: `md` from `joinPages(pages, pageOrder)`.
- `useEffect` keyed on `[md, activeTab]`:
  - When `activeTab === 'word'` and `md` is non-empty, regenerate. Otherwise skip.
  - Debounce by ~200ms (simple `setTimeout` cleared on re-entry) so quick edits to upstream pages don't thrash.
  - Set `rendering = true`, call `mdToDocxBlob(md)`, then `renderAsync(blob, containerRef.current)`. Set `rendering = false` on completion. Catch errors → set an `error` state, log to console.
  - Cleanup: on effect re-entry, clear the timeout and ignore any in-flight result (use an `isStale` flag).

### Markdown download

- `onDownloadMd`: build `new Blob([md], { type: 'text/markdown;charset=utf-8' })` and call `downloadBlob(blob, ${stem}_ocr.md)`. The same `fileName` stem logic as the `.docx` download is reused.
- No async work, so no busy state needed for this button alone — but both buttons share the same `disabled={!md || busy}` for consistency.

### i18n

Add to both `en` and `he` blocks in `src/i18n/translations.ts`:

| Key | English | Hebrew |
|-----|---------|--------|
| `export.download_md` | `Download .md` | `הורד .md` |
| `export.preview_word` | `Word` | `Word` |
| `export.preview_markdown` | `Markdown` | `Markdown` |
| `export.rendering` | `Rendering preview…` | `מציג תצוגה מקדימה…` |
| `export.preview_error` | `Couldn't render preview. The .docx download still works.` | `לא ניתן להציג תצוגה מקדימה. הורדת ה-.docx עדיין פועלת.` |

Remove `export.preview` (the `Markdown preview` heading) — the tabs replace it. `export.building`, `export.download`, and `export.empty` remain unchanged.

## Error handling

- DOCX preview failures: catch in the effect, store an error string, show it inside the Word tab container. Do not block the `.docx` download (the same blob path is used, but a render-only failure shouldn't bar the user from downloading the file).
- The `.md` download cannot meaningfully fail (no async work, no parsing) — no extra handling.

## Testing

Manual (this panel has no existing unit tests):
- Open Export tab on a project with several OCR'd pages. Verify Word preview renders headings, paragraphs, bold/italic, and Hebrew RTL correctly.
- Switch to Markdown tab — verify the raw markdown still appears.
- Click `Download .docx` — verify file opens in Word/LibreOffice and matches the preview.
- Click `Download .md` — verify file extension, content matches preview, opens cleanly in a text editor.
- With zero OCR'd pages: both buttons disabled, Markdown tab shows the empty placeholder, Word tab shows the empty placeholder (no render attempt).
- Edit corrections upstream so `md` changes — Word preview re-renders after ~200ms.

## Risks

- **Bundle size**: `docx-preview` + its `jszip` transitive dep adds ~80–120kb gzipped. Acceptable since `.docx` is the primary export format.
- **Re-render cost**: large documents could be slow to re-render on every `md` change. Mitigated by debouncing and only rendering when the Word tab is active.
- **Style fidelity**: `docx-preview` doesn't render *everything* a Word client does (footnotes, complex tables), but the current `mdToDocxBlob` only emits paragraphs, headings, and inline runs — all well supported.
