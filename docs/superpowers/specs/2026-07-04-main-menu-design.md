# Global Main Menu — Design

**Branch:** `10_MainMenu`
**Date:** 2026-07-04

## Goal

Add a dropdown navigation menu in the top-left corner, available from every page of
the app. The menu provides the primary navigation between the user's own decks, the
public deck catalog, and the user's profile.

## Menu items and visibility

| Item         | Destination     | Visible when      |
|--------------|-----------------|-------------------|
| My decks     | `/decks/mine`   | logged in only    |
| Search decks | `/decks/search` | always            |
| My profile   | `/profile`      | logged in only    |

Logged-out users see only "Search decks" in the dropdown.

Login/Logout is **not** part of the dropdown. The existing right-side auth controls
(Sign in with Google / avatar + Logout) stay exactly where they are.

## Component: MainMenuComponent

- Standalone component, selector `main-menu`, in `components/main-menu/`.
- Renders a menu button (☰) that toggles a dropdown panel.
- Open/close state held in a `signal`. Clicking an item navigates and closes the
  panel; clicking the backdrop closes it without navigating.
- Injects `AuthService` (for visibility rules) and `Router` (for navigation).
- Placed as the leftmost element **inside `NavigationBar`**, before the projected
  title (`<ng-content />`). Because `<navigation-bar>` is already embedded on all
  pages, the menu appears everywhere with no per-page edits.

## Routing

Add to `app-routing-module.ts`:

- `decks/mine` → `DeckListComponent`, `data: { mode: 'mine' }`, `canActivate: [authGuard]`.
- `decks/search` → `DeckListComponent`, `data: { mode: 'search' }`.
- `''` (root) and `decks` → new functional `landingRedirectGuard` returning a
  `UrlTree`: logged in → `/decks/mine`, otherwise → `/decks/search` (smart landing).

Ordering: `decks/mine` and `decks/search` must be declared **before** `decks/:id`
so they are not captured as an `:id`. All existing `decks/:id/...` routes are
unchanged.

Update `authGuard`'s unauthenticated fallback from `/decks` to `/decks/search`.

## DeckListComponent (reused for both views)

The component is reused for "My decks" and "Search decks". It reads `mode` from the
route data reactively (via `ActivatedRoute.data`), because Angular reuses the same
component instance when switching between the two routes.

One data load from the existing `GET /api/decks`; filtering is client-side:

- **mine** — keep `deck.isOwner`; title "My Decks ✨"; show the "+ New Deck" add tile
  (logged in only, as today).
- **search** — keep `deck.isPublic`; add a `searchTerm` signal bound to a text input
  that filters by deck name/description (case-insensitive, client-side); title
  "Search Decks 🔍"; no add tile.

Mode-specific empty states:

- mine, no decks → "You have no decks yet — create one."
- search, no matches → "No public decks found."

## Backend

No changes. `GET /api/decks` already returns:

- anonymous → all public decks;
- logged in → all public decks **plus** the user's own,

each `DeckSummary` carrying `isOwner` and `isPublic`. Both views filter this response
client-side, so no new endpoint or query parameter is needed.

## Testing

- New `main-menu.spec.ts` — item visibility per auth state, navigation on click,
  toggle/close behavior.
- Update `deck-list.component.spec.ts` — cover both modes (title, filtering by
  `isOwner`/`isPublic`, add-tile presence, search filtering).
- Update `navigation-bar.spec.ts` — now renders `main-menu`; ensure it imports the
  standalone `MainMenuComponent`.
- Verify with `ng test --watch=false`. Backend is unaffected; run `dotnet build`
  as a sanity check.
