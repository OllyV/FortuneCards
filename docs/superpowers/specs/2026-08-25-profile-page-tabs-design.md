# Profile Page Redesign — Tabbed Shell

**Date:** 2026-08-25
**Branch:** `71_ProfilePageRedesign`
**Status:** Approved design

## Goal

Restructure the profile page into a **route-based tabbed shell** with four tabs — Decks, Patterns,
Comments, Account settings — replacing today's single scrolling page (header + decks grid + comments
list) and the standalone `/profile/settings` page.

## Background / Current State

- `/profile` → `ProfileComponent` (lazy, `authGuard`): renders `<navigation-bar>`, a header (avatar,
  nickname/name, email, an "Account settings →" link), a **My Decks** grid (via
  `DeckService.getMyDecks()` filtered to `isOwner`, using `getDeckGradientStyle`), and a **My
  Comments** list (via `CommentService.listMine(1, 20)`).
- `/profile/settings` → `AccountSettingsComponent` (lazy, `authGuard`): renders its own
  `<navigation-bar>` + back button, and a nickname/photo form (`PATCH /api/auth/profile`) plus
  delete-account (`DELETE /api/auth/account`).
- `PatternService.getMyPatterns()` (`GET /api/patterns/mine`) exists and returns `Pattern[]`
  (owned + favorited, each with `isOwner`) — mirrors decks. Patterns are **not** on the profile today.
- Deck/pattern cards share the gradient utility `getDeckGradientStyle(colorIndex)`.
- Routes: `/decks/new`, `/decks/:id`, `/patterns/new`, `/patterns/:id`.

## Scope

In scope:
- A profile **shell** (`ProfileComponent`) with a persistent header + tab bar + `<router-outlet>`.
- Four child routes, each a small focused component loading its own data on visit.
- Fold `AccountSettingsComponent` in as the Settings tab (drop its own nav bar + back button).
- Add-tile ("+") on both the Decks and Patterns grids.
- i18n for the four tab labels.

Out of scope: any backend change; changing the settings form's behavior; favorites management;
pagination of comments (keeps the current first-20 `listMine`).

## Design

### Routing (`app.routes.ts`)

Replace the two separate `/profile` and `/profile/settings` routes with a parent + children. The
parent `authGuard` covers all children (a child can't render without activating the parent).

```
{
  path: 'profile',
  loadComponent: () => ProfileComponent,          // the shell
  canActivate: [authGuard],
  children: [
    { path: '', pathMatch: 'full', redirectTo: 'decks' },
    { path: 'decks',    loadComponent: () => ProfileDecksComponent },
    { path: 'patterns', loadComponent: () => ProfilePatternsComponent },
    { path: 'comments', loadComponent: () => ProfileCommentsComponent },
    { path: 'settings', loadComponent: () => AccountSettingsComponent },
  ],
}
```

Deep-links to `/profile/settings` still resolve (now inside the shell); `/profile` redirects to
`/profile/decks`.

### 1. `ProfileComponent` — the shell

`pages/profile/profile.component.{ts,html,css}`. Renders:
- `<navigation-bar>` with the existing back button (← to `/decks`).
- **Header** (persistent): avatar (`user.avatarUrl` img, else first letter of `nickname ||
  displayName`), `nickname || displayName`, and email — from `auth.currentUser()`. The old
  "Account settings →" link is removed (Settings is a tab).
- **Tab bar**: four `<a routerLink="decks|patterns|comments|settings" routerLinkActive="active">`
  links with the tab labels; `routerLinkActive` drives the active style. Horizontally scrollable on
  narrow screens (`overflow-x: auto`, no wrap).
- `<router-outlet>` for the active tab.

Imports `RouterOutlet`, `RouterLink`, `RouterLinkActive`, `NavigationBar`, `TranslocoDirective`.
Holds no data-fetching beyond `auth.currentUser()`.

### 2. `ProfileDecksComponent`

`pages/profile/tabs/profile-decks.component.{ts,html,css}`. Moves today's decks section out of the
profile: on init `DeckService.getMyDecks()` → `signal` filtered to `isOwner`; renders the deck-card
grid (gradient bg, emoji, name, public/private badge) with click → `/decks/:id`, plus an **add-tile
("+")** → `/decks/new` and a "New deck" button. Loading / error states as today.

### 3. `ProfilePatternsComponent`

`pages/profile/tabs/profile-patterns.component.{ts,html,css}`. Mirrors decks for patterns: on init
`PatternService.getMyPatterns()` → filtered to `isOwner`; renders a matching card grid (same
`getDeckGradientStyle(colorIndex)`, pattern `emoji` (default 🔮), `name`, public/private badge),
click → `/patterns/:id`, an **add-tile ("+")** → `/patterns/new`, and a "New pattern" button.
Loading / empty / error states.

### 4. `ProfileCommentsComponent`

`pages/profile/tabs/profile-comments.component.{ts,html,css}`. Moves today's My Comments list out:
on init `CommentService.listMine(1, 20)` → `signal`; renders each item as a link to `targetRoute`
showing `targetLabel` + (`body` or `[deleted]`). Empty state when none.

### 5. `AccountSettingsComponent` (refactor)

Keep all logic (nickname/photo/save, delete-account, blob-preview handling). Remove its own
`<navigation-bar>` and back button from the template (the shell provides them). Everything else
unchanged; the component now renders as the `/profile/settings` child.

### Tab bar look

Brand-styled (Nunito): a row of pill/underline tabs; the active tab uses coral (accent underline or
filled pill), inactive are muted. Reuses design tokens; consistent with the app's pill language.

### i18n

Add short tab labels under a `profile.tabs` namespace to all 7 locale files (English real copy,
others copy English per the deferred-translation convention): `decks` = "Decks", `patterns` =
"Patterns", `comments` = "Comments", `settings` = "Settings". Reuse existing keys inside the tab
panels (`pages.myDecksTitle`, `pages.newDeckButton`, `comments.myComments`, etc.); add
`pages.myPatternsTitle` / `pages.newPatternButton` if not already present.

### Error handling

Per-tab: a load failure shows an inline error message in that tab only (other tabs unaffected).
Unauthenticated users never reach the shell (`authGuard`).

## Testing (Vitest)

- **Shell** (`profile.component.spec.ts`, rewritten): renders the header (name/email/avatar) and the
  four tab links with correct `routerLink`s and a `<router-outlet>`; `/profile` redirects to
  `/profile/decks` (router test).
- **ProfileDecks**: `getMyDecks` result filtered to `isOwner` renders cards + the add-tile; error
  state on failure.
- **ProfilePatterns**: `getMyPatterns` filtered to `isOwner` renders cards + add-tile; empty state.
- **ProfileComments**: `listMine` renders items linking to `targetRoute`; empty state.
- **AccountSettings**: existing save/photo/delete tests unchanged; remove any assertion tied to the
  now-absent nav bar; confirm the form still renders.

## Files touched (anticipated)

- `fortunecards.client/src/app/app.routes.ts` (parent + children; drop standalone settings route)
- `fortunecards.client/src/app/pages/profile/profile.component.{ts,html,css,spec.ts}` (→ shell)
- `fortunecards.client/src/app/pages/profile/tabs/profile-decks.component.{ts,html,css,spec.ts}` (new)
- `.../tabs/profile-patterns.component.{ts,html,css,spec.ts}` (new)
- `.../tabs/profile-comments.component.{ts,html,css,spec.ts}` (new)
- `fortunecards.client/src/app/pages/account-settings/account-settings.component.{html,spec.ts}`
  (drop nav bar/back; adjust spec)
- `fortunecards.client/public/i18n/*.json` (tab labels; pattern title/button keys if missing)
