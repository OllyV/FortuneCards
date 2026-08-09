# Resilient Loading — Retry Interceptor + Skeletons — Design

## Goal

Make the app survive backend **cold starts** (Aiven Postgres + Azure App Service
waking from idle) and present a polished loading experience. Today the first request
after idle fails once and each page shows plain "Failed to load…" text with no retry
and no loading animation.

Three parts:
1. A global HTTP **retry interceptor** that transparently retries transient GET
   failures with exponential backoff.
2. **Skeleton** loading placeholders on the main browse/detail pages.
3. A shared **error state** with a "Try again" button, and a fix so detail pages
   reset their loading/error state on an in-place `:id` change.

## Context

- `provideHttpClient()` in `main.ts` currently has **no interceptors**.
- Every list/detail component hand-rolls `loading`/`error` signals and renders plain
  text (`.state-loading` / `.state-error`).
- There is no existing retry, interceptor, spinner, or skeleton in the codebase.
- Cold start typically surfaces as a network error (`status 0`) or a gateway status
  (`502/503/504`) on the first request; once warm, subsequent requests succeed.

## Branch

`60_LoadingRetry`, branched from `59_PatternDetail` (not `main`), because it modifies
`pattern-detail` (which only exists on that branch) alongside the deck pages. It carries
#59's commits forward; merging #59 later brings this with it.

## Part 1 — Retry interceptor

New functional interceptor `retryInterceptor` (`services/http/retry.interceptor.ts`),
registered via `provideHttpClient(withInterceptors([retryInterceptor]))`.

Behavior:
- **GET only.** Non-GET requests pass through untouched (never auto-retry POST/PUT/DELETE
  — avoids duplicated favorites / saves / deletes).
- Retries only **transient** errors: `HttpErrorResponse.status === 0` (network/unreachable)
  or status in `{408, 502, 503, 504}`. Any other status (real `4xx`, `500`) is rethrown
  immediately — no retry, no delay.
- **4 retries** with exponential backoff **1s, 2s, 4s, 8s** (total ~15s), implemented
  with rxjs `retry({ count: 4, delay })` where `delay` returns `timer(RETRY_DELAYS_MS[n])`
  for transient errors and rethrows otherwise.
- Backoff values live in an exported constant `RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]`
  so tests can reference them.
- Cancelled requests (e.g. a `switchMap` superseding an in-flight search) tear the stream
  down without an error notification, so they are never retried.

This alone fixes the cold-start failures everywhere — list pages, detail pages, and the
startup `GET /api/config` + auth GETs — with no per-component change required for retry.

## Part 2 — Skeleton loading UI

Shared standalone components under `components/shared/skeleton/`:

- **`SkeletonComponent`** (`app-skeleton`) — a primitive shimmer box. Inputs: `width`
  (default `'100%'`), `height` (default `'1rem'`), `radius` (default `'8px'`). CSS
  `@keyframes` gradient sweep, respects `prefers-reduced-motion` (static when reduced).
- **`SkeletonCardGridComponent`** (`app-skeleton-card-grid`) — renders `count` (default 8)
  shimmer tiles in the same responsive grid used by the card grids. Consumed by
  `deck-list` and `pattern-list`.
- **`SkeletonDetailComponent`** (`app-skeleton-detail`) — a hero-height shimmer bar, a few
  line placeholders, and one large block (stands in for the card grid / question list +
  table). Consumed by `deck-detail` and `pattern-detail`.

Each of the four pages renders its skeleton while `loading()` is true, in place of the
old plain-text loading state.

## Part 3 — Shared error state + detail reset

- **`ErrorStateComponent`** (`components/shared/error-state/`, selector `app-error-state`)
  — input `message: string`, output `retry: void`; renders the message and a "Try again"
  button that emits `retry`. Replaces the `.state-error` text on the four pages.
- **Wiring:** list pages already expose a load method (`deck-list.loadDecks()`,
  `pattern-list.load()`); wire `(retry)` to it. Detail pages extract their fetch into a
  `load(id: number)` method plus a `retry()` that re-runs with the current route id, and
  wire `(retry)` to `retry()`.
- **Detail reset (Part 1 of the original request):** in both `pattern-detail` and
  `deck-detail`, set `loading = true` and `error = null` at the top of the `route.params`
  subscription callback, so an in-place `:id` change re-shows the skeleton and clears any
  stale error. (Extracting `load(id)` makes this natural.)

## Affected files

- Create: `services/http/retry.interceptor.ts` (+ spec)
- Modify: `main.ts` (register the interceptor)
- Create: `components/shared/skeleton/skeleton.component.*` (+ spec)
- Create: `components/shared/skeleton/skeleton-card-grid.component.*` (+ spec)
- Create: `components/shared/skeleton/skeleton-detail.component.*` (+ spec)
- Create: `components/shared/error-state/error-state.component.*` (+ spec)
- Modify: `deck-list` (skeleton grid + error-state, wire retry)
- Modify: `pattern-list` (skeleton grid + error-state, wire retry)
- Modify: `deck-detail` (skeleton detail + error-state, `load(id)`/`retry()`, params reset)
- Modify: `pattern-detail` (skeleton detail + error-state, `load(id)`/`retry()`, params reset)

## Testing

- **Interceptor:** using `HttpTestingController` + vitest fake timers —
  (a) a `503` then a `200` on retry resolves successfully after advancing the backoff timer;
  (b) a `400`/`404` is surfaced immediately with no retry;
  (c) a POST returning `503` is not retried;
  (d) transient failures exhaust after 4 retries and surface the error.
- **Shared components:** `SkeletonComponent` renders a shimmer box; `SkeletonCardGrid`
  renders `count` tiles; `SkeletonDetail` renders its blocks; `ErrorStateComponent`
  renders the message and emits `retry` on button click.
- **Pages:** each of the four shows its skeleton while `loading()` and the
  `ErrorStateComponent` on error; clicking "Try again" re-invokes the load. Detail specs
  additionally assert `loading`/`error` reset when `route.params` re-emits a new id.

## Out of scope

- Skeletons on secondary pages (card-detail, drawn-card, profile, create/edit forms) —
  they keep their current text loading/error state; can be extended later.
- No backend changes.
- No global loading bar / toast system; error handling stays per-page.
- No change to the retry policy for non-GET requests.
