# App-Shell Splash — Design

## Goal

Show a branded splash during app bootstrap so the **first cold-start paint** is no longer a
blank screen. On a cold start the `APP_INITIALIZER` auth GET (`AuthService.loadCurrentUser`)
retries transient failures for up to ~15s, blocking Angular bootstrap; until it resolves the
`<app-root>` host is empty and the user sees nothing.

## Context

- `index.html` contains an empty `<app-root></app-root>`; Angular renders into it only after
  all `APP_INITIALIZER`s resolve.
- This is the deferred "finding 2" follow-up from the Resilient Loading feature (#60); it
  branches from `60_LoadingRetry` as `61_AppShellSplash`.

## Approach

Place splash markup **inside** `<app-root>` in `index.html`, with its CSS in an inline
`<style>` block in `<head>`. The browser paints it immediately — before the JS/CSS bundle
loads — and when Angular bootstraps it **replaces the host element's content**, so the splash
disappears on first render with no cleanup code and no change to `main.ts`, auth, or bootstrap
timing. It naturally covers the entire blank window: bundle download/parse **and** the
`APP_INITIALIZER` (auth retry) wait.

## Content

Centered, on-brand (the app uses Nunito + a cream/purple palette):

- `🎴 FortuneCards` wordmark.
- A CSS spinner beneath it.
- A reassurance line — "Waking things up — this can take a few seconds" — that starts hidden
  and fades in after ~4s via a pure-CSS `animation-delay` (no JS). Warm loads never show it;
  a cold start does.

## Styling

- Inline CSS only (the bundle's CSS variables load later, so the splash can't use them):
  cream background (`#faf8ff`-ish), purple accent (`#7b4397`), `Nunito` with a
  system-font fallback so text shows before the web font loads.
- Scoped under a single `#app-splash` id so the rules can't leak into the app.
- `@media (prefers-reduced-motion: reduce)`: spinner does not spin; the reassurance line is
  shown statically (consistent with the skeleton components).

## Out of scope

- No change to `main.ts`, `AuthService`, or `APP_INITIALIZER` timing (not making auth
  non-blocking — a deliberately different approach we are not taking).
- No fade-out transition (Angular hard-replaces the host content on bootstrap, which cannot be
  transitioned); the splash simply vanishes on first render.
- No changes to any component or route.

## Testing

`index.html` is static and not unit-testable under Vitest. Verification:
- `ng build` succeeds and the built `dist/.../index.html` still contains the splash markup.
- Real browser check: run the dev server, load the app, and confirm the splash paints and is
  replaced on bootstrap (screenshot).
- No automated spec is added (a test reading `index.html` from disk adds little and the
  frontend test env is jsdom, not Node fs); the build + browser check are the gate.
