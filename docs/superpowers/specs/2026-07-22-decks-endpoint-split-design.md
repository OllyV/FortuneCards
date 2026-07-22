# Design: Split Decks Endpoints (Public Search + Mine)

**Date:** 2026-07-22
**Branch:** 15_SplitGetDecksEndpoints
**Status:** Approved design, pending implementation plan

## Problem

`GET /api/decks` returns one combined list (public decks + the current user's owned
decks + per-user favourite/owner flags). Three frontend consumers — the deck-list
page (in both "mine" and "search" modes), the profile page, and the table
deck-selector — download this whole list and slice it client-side.

We want to add **page-based pagination to the public Decks Search** but **not** to
My Decks. The two lists have fundamentally different shapes (one paginated and
user-agnostic, one small and per-user), so a single combined endpoint fights that.
Splitting the endpoint is a prerequisite for pagination.

Caching was the original motivation for this investigation but is **explicitly out of
scope**: once the public list is server-searched and paginated, a cache key fragments
across every `(search, page, pageSize)` combination, so the hit rate collapses. My
Decks is per-user and cheap. We revisit caching only if profiling later shows the
public query is a hotspot.

## Goals

- Two dedicated endpoints: a paginated, user-agnostic public list and a per-user
  "mine" list.
- Server-side text search (name/description) on the public list — required, because a
  paginated list cannot be filtered in the browser.
- Page-based (offset) pagination UI on **both** the Decks Search page and the table
  deck-selector modal.
- Keep the public list user-agnostic; overlay per-user favourite/owner state on the
  client.

## Non-goals

- Caching the public list (dropped — see above).
- Cursor/infinite-scroll pagination (chose offset for numbered pages + total count).
- Changing the authorized deck-selector's behaviour (it still shows owned+favourites).
- Backend unit tests (no backend test project exists in this repo).

## Chosen approach

**Approach A — two endpoints, derive the client overlay from `mine`.**

- `GET /api/decks/public` → paginated, user-agnostic list.
- `GET /api/decks/mine` → owned + favourited decks for the current user, not paginated.
- On the search surface, a logged-in user also fetches `mine` (cheap — a user has few
  decks) and derives owned-ID / favourite-ID `Set`s from it to overlay the star and
  owner badge onto public results.

Rejected alternatives:
- **B (dedicated `/relations` endpoint returning `{ownedIds, favoriteIds}`):** a third
  endpoint duplicating what `mine` already implies; negligible payload saving at this
  scale.
- **C (public endpoint stamps per-user flags):** simplest client but re-couples the
  public list to per-user state, defeating the user-agnostic split.

## Backend design

### DTOs

- Add a generic paged wrapper:
  ```csharp
  public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);
  ```
- **Reuse the existing `DeckSummary`** for public items. The public query sets
  `IsOwner = false` and `IsFavorite = false` (honest: "no user relationship known");
  the client overlays the truth. This avoids introducing a second summary type and
  re-typing every consumer.

### Service (`IDeckService` / `DeckService`)

Replace `GetAllAsync(int? userId)` with:

- `Task<PagedResult<DeckSummary>> GetPublicAsync(string? search, int page, int pageSize)`
  - Filter `d.IsPublic`.
  - Optional search: case-insensitive contains on `Name` or `Description`
    (`d.Name.Contains(search) || (d.Description != null && d.Description.Contains(search))`;
    SQL Server default collation is case-insensitive, so this maps to `LIKE`).
  - Deterministic order: `ORDER BY CreatedAt DESC, Id DESC` (stable across pages).
  - `TotalCount` from a `Count()` over the filtered set (before paging).
  - `Skip((page - 1) * pageSize).Take(pageSize)`.
  - Clamp `page >= 1` and `pageSize` into `[1, 100]` server-side.
  - Projects `DeckSummary` with `IsOwner = false`, `IsFavorite = false`.
- `Task<IEnumerable<DeckSummary>> GetMineAsync(int userId)`
  - Filter `d.UserId == userId || d.FavoritedBy.Any(f => f.UserId == userId)`.
  - Same ordering.
  - Projects `IsOwner = d.UserId == userId`,
    `IsFavorite = d.FavoritedBy.Any(f => f.UserId == userId)`.

### Caching cleanup

- Remove the unused `AllDecksKey` constant and the `_cache.Remove(AllDecksKey)` calls in
  `CreateAsync`, `DeleteAsync`, `AddCardAsync`, `UpdateAsync`.
- Leave the per-id `GetByIdAsync` cache (`DeckKey(id)`) and its `_cache.Remove(DeckKey(id))`
  invalidations untouched — separate concern, still valid.

### Controller (`DecksController`)

- `GET /api/decks/public?search=&page=&pageSize=` → `GetPublicAsync(...)`. Anonymous
  allowed. `search` optional; `page`/`pageSize` optional with sensible defaults
  (`page = 1`, `pageSize = 20`).
- `GET /api/decks/mine` → requires `CurrentUserId`; return `401 Unauthorized` when not
  logged in; otherwise `GetMineAsync(userId)`.
- **Remove** the old `GET /api/decks` (`GetDecks`). No consumers remain after the
  frontend refactor. `CreatedAtAction(nameof(GetDeck), ...)` in `CreateDeck`/`AddCard`
  is unaffected (it references `GetDeck`, not `GetDecks`).

## Frontend design

### Model + service

- Add `PagedResult<T>` interface to the models:
  ```ts
  export interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number; }
  ```
- `DeckService`: replace `getDecks()` with
  - `getPublicDecks(search: string, page: number, pageSize: number): Observable<PagedResult<Deck>>`
    → `GET /api/decks/public` with query params.
  - `getMyDecks(): Observable<Deck[]>` → `GET /api/decks/mine`.

### Shared pagination component

- New standalone `app-pagination` component.
  - Inputs: `page`, `pageSize`, `totalCount`.
  - Output: `pageChange` (emits the requested page number).
  - Renders prev/next + page indicator ("showing X–Y of N" / numbered pages).
  - Used by both the search page and the deck-selector so the logic lives once.

### Consumers

- **deck-list, `mine` mode:** call `getMyDecks()`, render results directly (server
  already returns owned+favourites). No client-side filtering, no pager.
- **deck-list, `search` mode:** call `getPublicDecks(term, page, pageSize)`; debounce
  the search input and reset to page 1 on new term; render `app-pagination` from
  `totalCount`. When logged in, also call `getMyDecks()` once, build `ownedIds` and
  `favoriteIds` `Set`s, and overlay `isOwner`/`isFavorite` onto each page's items.
- **deck-selector, authorized:** `getMyDecks()` — unchanged behaviour (owned+favourites,
  no pager).
- **deck-selector, anonymous:** `getPublicDecks(...)` with the shared `app-pagination`.
- **profile:** `getMyDecks()` then `filter(d => d.isOwner)` (owned only, as today).

### Data flow summary

| Surface | Requests | Notes |
|---|---|---|
| Search page, logged in | `getPublicDecks(page)` + `getMyDecks()` | overlay owner/favourite, then render page + pager |
| Search page, anonymous | `getPublicDecks(page)` | render page + pager |
| Mine page | `getMyDecks()` | render directly |
| Profile | `getMyDecks()` | filter `isOwner` |
| Selector, authorized | `getMyDecks()` | no pager |
| Selector, anonymous | `getPublicDecks(page)` | render page + pager |

## Edge cases

- Empty/absent `search` → returns all public decks, paged.
- Out-of-range `page` → server returns empty `items` with correct `totalCount`; client
  clamps the pager to the valid range.
- `pageSize` clamped to `[1, 100]` server-side to bound query cost.
- Deterministic ordering (`CreatedAt DESC, Id DESC`) so rows don't shift between pages.
- Own public decks appear in public search results; the star is hidden for them
  (`@if (auth.isLoggedIn() && !deck.isOwner)`), which the client overlay drives via the
  `ownedIds` set.
- `GET /api/decks/mine` unauthenticated → `401`; the client only calls it when logged in.

## Testing

- **Frontend (Vitest, single-bundle compile):**
  - `deck.service.spec` — new `getPublicDecks` / `getMyDecks` request shapes.
  - `deck-list.spec` — mine vs search modes, server-side search + paging, overlay of
    owner/favourite state when logged in.
  - `deck-selector.spec` — authorized (mine) vs anonymous (paged public).
  - `profile.spec` — owned-only filter over `getMyDecks()`.
  - New `pagination.spec` for `app-pagination`.
  - Run `ng test --watch=false` for a single verifying run.
- **Backend:** no test project — verify with `dotnet build`. The search/pagination
  logic is not unit-tested server-side (existing repo constraint); note this as a known
  gap.

## Rollout / migration notes

- No database schema change; no EF migration required.
- Dev proxy already forwards all `/api/*` paths, so the new sub-routes need no
  `proxy.conf.js` change.
- Breaking API change (`GET /api/decks` removed), but the client is updated in the same
  change and there are no other known consumers.
