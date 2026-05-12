# i18n (en/he) with Language Toggle — Design

## Goal

Make the entire UI translatable between English and Hebrew, with a single toggle button in the page header. Hebrew flips the layout to RTL.

## Decisions (confirmed with user)

1. **Library:** Custom lightweight Context — no new dependency. Fits the existing `SettingsContext` / `ProjectContext` pattern.
2. **RTL:** When `lang === 'he'`, set `dir="rtl"` on the document; otherwise `ltr`. Editor textareas that are *always* RTL (Hebrew OCR text, diff cards) keep their inline `dir="rtl"` regardless.
3. **Switcher:** One header button that displays the *other* language's name (click to flip). Persisted in localStorage.

## Architecture

```
src/i18n/
  I18nContext.tsx   — provider, useI18n() hook, t() function, lang state, RTL effect
  translations.ts   — { en: {...}, he: {...} } flat key dictionaries
```

### `useI18n()` API

```ts
const { lang, setLang, t } = useI18n();
t('app.title')                          // "LLM OCR — Jewish Texts"
t('batch.startAll', { n: 12 })          // "Start all pending (12)"
```

`t(key, vars?)` looks up `translations[lang][key]`, falls back to `translations.en[key]`, then to the key itself. `{name}` placeholders in the string are replaced from `vars`.

### Persistence

Language is stored in `localStorage` under `llm-ocr.lang` (matches the namespace used by `settings.ts`). Default is browser language if it starts with `he`, otherwise `en`.

### RTL effect

`I18nProvider` runs a `useEffect` that sets `document.documentElement.dir` and `document.documentElement.lang` whenever `lang` changes.

## Component changes

All user-facing strings in the following files are replaced with `t()` calls:

- `App.tsx` — header title, tab labels
- `SettingsPanel.tsx` — provider/model labels, batch size, API-key field, reset
- `BatchRunner.tsx` — start/stop/retry buttons, range inputs, selection text, log toggle
- `FileDrop.tsx` — drop hint, choose-files button, loaded summary
- `PageList.tsx` — selection hint
- `EditorView.tsx` — page navigation, "Load a file first"
- `FixPanel.tsx` — heading, template labels, run/accept/reject, statuses
- `ExportPanel.tsx` — download button, markdown preview heading, empty state
- `RunHistory.tsx` — table headers, empty state
- `CostSummary.tsx` — "Estimated: ... in / out tokens"
- `ErrorBoundary.tsx` — error heading, reload button
- `OcrTextarea.tsx` — placeholder, status line, save button
- `PageImage.tsx` — "Rendering page…"
- `PromptEditor.tsx` — placeholder hint

The `ROUTE_LABEL` and `MODE_LABEL` constants become helper functions that read from translations.

The page-status badge labels (`pending/running/ok/error/edited`) used in `title` tooltips also get translated.

## Switcher component

`src/components/LanguageToggle.tsx` — a button in the header that calls `setLang(lang === 'en' ? 'he' : 'en')` and shows the opposite language name (`עברית` when in en, `English` when in he).

## Out of scope

- Locale-aware number/date formatting beyond what `toLocaleString()` already does.
- Translating prompt template defaults (these are content sent to the model, not UI).
- Translating run-history file names or model IDs.

## Testing

- Add a small test for `t()`: lookup, fallback, placeholder substitution.
- Manual: toggle the button, confirm all labels flip, confirm `<html dir>` flips, confirm choice persists across reload.
