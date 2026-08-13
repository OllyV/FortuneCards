# Multi-language UI Support (i18n) — Design

**Date:** 2026-08-11
**Status:** Approved
**Scope:** Frontend-only (Angular). UI chrome translation now; user-generated content translation deferred to a later increment.

## Goal

Let users read the FortuneCards UI in their own language and switch languages at runtime. Support 7 languages at launch:

- **English (`en`)** — base language and fallback
- Ukrainian (`uk`), Russian (`ru`), Spanish (`es`), German (`de`), French (`fr`), Portuguese (`pt`)

## Non-goals (YAGNI)

- **User-generated content** (deck / card / pattern names and meanings) — this is the "content later" increment. Translation keys are namespaced so content translation slots in cleanly without reworking the UI layer.
- **Pre-bootstrap `#app-splash`** in `index.html` — static HTML shown before Angular boots; stays English.
- **Date/number locale formatting** — the app has little of it; out of scope unless requested later.
- **Backend / DB changes** — none. No per-account language persistence; preference lives in `localStorage`.

## Approach

Use **`@jsverse/transloco`**, a runtime translation library. Chosen over Angular's built-in `@angular/localize` because the built-in path is build-time (one compiled bundle per locale served at separate URLs), which fights the runtime "switch instantly + remember in localStorage" requirement. Transloco fits the standalone + signals architecture and keeps translations as plain JSON that is easy to hand to translators.

## Components

### 1. Transloco setup

- Add dependency `@jsverse/transloco`.
- Translation files: one JSON per language under `src/assets/i18n/` — `en.json`, `uk.json`, `ru.json`, `es.json`, `de.json`, `fr.json`, `pt.json`.
- Ensure `src/assets/**` is included in the build `assets` array (`angular.json`) so the JSON ships.
- Configure in `main.ts` via `provideTransloco({ config: { availableLangs: [...], defaultLang: 'en', fallbackLang: 'en', reRenderOnLangChange: true, prodMode: <env> }, loader: TranslocoHttpLoader })`.
- `TranslocoHttpLoader` fetches `assets/i18n/${lang}.json` via `HttpClient` (already provided in `main.ts`).

### 2. `LanguageService` (signal-based, wraps Transloco)

**What it does:** owns language selection, detection, and persistence.

- `available`: readonly list of `{ code, nativeName }` for the 7 locales (e.g. `uk → Українська`, `es → Español`).
- `current`: signal reflecting the active language code.
- `init()`: called at startup. Resolves the initial language from, in order: `localStorage['fc.lang']` → best match of `navigator.language` (normalize region, e.g. `uk-UA` → `uk`) against `available` → `en`. Sets it as the active Transloco lang.
- `setLanguage(code)`: sets the active Transloco lang, writes `localStorage['fc.lang']`, and sets `document.documentElement.lang = code` for accessibility.
- Subscribes to Transloco `langChanges$` to keep `<html lang>` and the `current` signal in sync.

**Depends on:** `TranslocoService`, `localStorage`, `navigator`, `document`.

**Startup wiring:** an `APP_INITIALIZER`-style provider (or `provideAppInitializer`) calls `LanguageService.init()` before first render, mirroring the existing monitoring initializer pattern in `main.ts`.

### 3. `LanguageSwitcher` (standalone component)

- Rendered inside the existing **main-menu** hamburger panel.
- Lists the 7 languages by native name; highlights the active one; clicking calls `LanguageService.setLanguage(code)` and closes/updates the menu.
- Accessible: proper `role`/`aria-*`, keyboard-selectable, current selection marked with `aria-current`.

### 4. String extraction

Sweep all user-facing English text and replace with translation keys:

- **Templates** (~35 standalone components across `Deck/`, `Cards/`, `Pattern/`, `TableFortuneTelling/`, `Navigation/`, `shared/`, `pages/`): use the structural directive `*transloco="let t"` and read `t('group.key')`; use the `| transloco` pipe for attribute/`aria-label` bindings.
- **TypeScript**: user-facing strings built in code (error messages, dialog/confirm text) go through `TranslocoService.translate('...')`.

**Key convention:** nested JSON grouped by feature —
`nav.*`, `deck.*`, `card.*`, `pattern.*`, `table.*`, `pages.*`, `common.*` (shared: Save / Cancel / Delete / Loading / …), `errors.*`.

`en.json` is authored verbatim from the extracted originals. The other 6 files are machine-translated drafts, refined by the user later.

### 5. Testing

The existing 249 specs assert on rendered English text, so they must keep seeing English:

- Add a shared helper `src/testing/transloco-testing.ts` exporting a `TranslocoTestingModule` configured with the **real `en.json`** and `preloadLangs: true` so translations resolve synchronously.
- Add this module to the `imports` of specs whose components now use Transloco. Assertions on English strings remain unchanged.
- New unit tests:
  - `LanguageService`: browser-language detection + normalization, localStorage persistence, fallback to `en`, `<html lang>` update.
  - `LanguageSwitcher`: renders all languages, marks the active one, switches on click.

Run `ng test --watch=false` — the whole spec bundle must stay green.

## Data flow

1. App boots → `LanguageService.init()` picks a language (localStorage → browser → `en`) and sets it on Transloco.
2. Transloco HTTP loader fetches `assets/i18n/<lang>.json`; fallback `en` covers any missing key.
3. Templates render via `*transloco`/pipe; `<html lang>` is set.
4. User opens the hamburger menu → `LanguageSwitcher` → `setLanguage(code)` → Transloco re-renders (`reRenderOnLangChange`), localStorage + `<html lang>` updated.

## Rollout / verification

- `ng test --watch=false` green (existing + new specs).
- `ng build` succeeds with i18n JSON emitted to the build output.
- Manual smoke: switch each language in the menu, confirm instant re-render and that a reload preserves the choice.

## Future extension: user-content translation

Because keys are feature-namespaced and the mechanism is runtime, the later increment can add per-entity translated fields (DB + DTO + editor UI) and a content-resolution layer that picks the viewer's language with English fallback — without touching this UI-translation layer.
