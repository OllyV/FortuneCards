# App-Shell Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a branded splash inside `<app-root>` so the first cold-start paint is not a blank screen; Angular replaces it automatically on bootstrap.

**Architecture:** Static splash markup inside `<app-root>` plus an inline `<style>` in `<head>` of `index.html`. Paints before the JS/CSS bundle loads; removed for free when Angular renders into the host. No change to `main.ts`, auth, or bootstrap timing.

**Tech Stack:** Static HTML + inline CSS (no framework, no JS).

## Global Constraints

- Only `fortunecards.client/src/index.html` changes. No component, route, `main.ts`, or auth changes.
- All splash CSS is inline in `index.html`'s `<head>` and scoped under `#app-splash` so it cannot leak into the app or depend on the (later-loading) bundle CSS variables.
- Colors: cream background `#faf8ff`, purple accent `#7b4397`; font `'Nunito'` with a system-font fallback.
- The reassurance line fades in after ~4s via pure-CSS `animation-delay` (no JS).
- `@media (prefers-reduced-motion: reduce)`: spinner does not spin; reassurance line is shown statically.
- `index.html` is static and not unit-testable under Vitest — verification is `ng build` + a real browser check.

---

### Task 1: Add the app-shell splash to `index.html`

**Files:**
- Modify: `fortunecards.client/src/index.html`

**Interfaces:**
- Consumes: nothing.
- Produces: a `#app-splash` element inside `<app-root>` that Angular replaces on bootstrap.

- [ ] **Step 1: Add the inline splash styles to `<head>`**

In `fortunecards.client/src/index.html`, add this `<style>` block immediately before the closing `</head>` tag (after the existing font `<link>`):

```html
  <style>
    #app-splash {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      background: #faf8ff;
      color: #7b4397;
      font-family: 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;
      z-index: 9999;
    }
    #app-splash .splash-logo { font-size: 28px; font-weight: 800; }
    #app-splash .splash-spinner {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 4px solid rgba(123, 67, 151, 0.2);
      border-top-color: #7b4397;
      animation: app-splash-spin 0.9s linear infinite;
    }
    #app-splash .splash-hint {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: rgba(123, 67, 151, 0.75);
      opacity: 0;
      animation: app-splash-fade-in 0.4s ease 4s forwards;
    }
    @keyframes app-splash-spin { to { transform: rotate(360deg); } }
    @keyframes app-splash-fade-in { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      #app-splash .splash-spinner { animation: none; }
      #app-splash .splash-hint { animation: none; opacity: 1; }
    }
  </style>
```

- [ ] **Step 2: Add the splash markup inside `<app-root>`**

Replace the empty `<app-root></app-root>` in the `<body>` with:

```html
  <app-root>
    <div id="app-splash">
      <div class="splash-logo">🎴 FortuneCards</div>
      <div class="splash-spinner" aria-hidden="true"></div>
      <p class="splash-hint">Waking things up — this can take a few seconds</p>
    </div>
  </app-root>
```

- [ ] **Step 3: Verify the production build compiles and preserves the splash**

Run: `cd fortunecards.client && ng build`
Expected: build succeeds. Then confirm the built file still contains the splash:
Run: `grep -c "app-splash" dist/fortunecards.client/browser/index.html` (path may be `dist/fortunecards.client/index.html` depending on the builder — check whichever exists)
Expected: a non-zero count (the splash markup + styles survived the build).

- [ ] **Step 4: Verify the full test suite still passes (no regressions)**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: all tests pass (unchanged count — this task adds none), output pristine.

- [ ] **Step 5: Browser check**

Start the dev server and load the app in a browser; confirm the splash paints on load and is replaced by the app on bootstrap. (Optionally observe the ~4s reassurance line by throttling, and verify reduced-motion via the OS/browser setting.) A screenshot of the splash is sufficient evidence.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/index.html
git commit -m "61: Add app-shell splash for cold-start bootstrap"
```

---

## Notes for the implementer

- Do not add or remove anything outside `index.html`.
- Angular clears the `<app-root>` host's initial content when it bootstraps the root component, so the `#app-splash` node is removed automatically — do not add JS to remove it.
