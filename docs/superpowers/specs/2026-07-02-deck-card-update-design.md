# Deck & Card Update — Design

**Date:** 2026-07-02
**Branch:** `6_AddUsersAndAuth`
**Status:** Approved for planning

## Goal

Let a deck's owner review and update their deck and its cards:

- Backend: add `PATCH` endpoints for `Deck` and `Card`.
- Frontend: add pages to review and update a single deck and a single card.
- Update is available **only to the user who owns the deck**; everyone who can see the deck can review it.

## Scope notes / findings

- **No database migration is required.** Every field to be edited already exists.
  - `Deck`: `Name`, `Description?`, `Emoji`, `ColorIndex`, `CardBackImageUrl?`, `IsPublic`, `UserId?`.
  - `Card`: `Title` (required), `Description` (required), `ImageUrl` (required), `DeckId`.
- **The Card `title` field already exists** end-to-end (model, `CardDto`, `AddCardRequest`, the create form, the `Card` TS interface). No new field is added; we only ensure title is shown and editable on the new card pages.
- Editable fields = all fields used at the create stage:
  - Deck: `Name`, `Description`, `Emoji`, `ColorIndex`, `CardBackImage` (image replacement), **`IsPublic`**.
  - Card: `Title`, `Description`, `Image` (image replacement).
- **Owner actions are consolidated onto the create/edit pages:**
  - The **public/private choice** moves to the create page and the deck edit page. The deck tile keeps only the 🌐/🔒 **badge** (no toggle button).
  - **Delete deck** moves from the deck tile to the deck edit page.
  - **Delete card** moves from the deck-detail card grid to the card edit page.
- **`IsPublic` is folded into the create request and the deck `PATCH`.** This makes the existing `PATCH /api/decks/{id}/visibility` endpoint, `DeckService.ToggleVisibilityAsync`, `ToggleVisibilityRequest`, and the frontend `DeckService.toggleVisibility` **dead code — they are removed.**

## Existing patterns this design follows

- **Ownership:** current user id is `HttpContext.Items["UserId"]` (set by `JwtMiddleware`); owner check is `deck.UserId == userId`. Card ownership is resolved via the card's deck.
- **Create endpoints** use `[FromForm]` (multipart) because they upload images; a private helper saves files to `wwwroot/images` with GUID filenames.
- **Not-found vs. unauthorized are intentionally conflated** (both return `NotFound`) so deck existence isn't leaked.
- **Cache:** `DeckService` invalidates `AllDecksKey` and `DeckKey(deckId)` on mutation.
- **Frontend:** Angular signals, reactive forms, `@if`/`@for` control flow, `takeUntilDestroyed`, `isOwner` boolean gates owner-only UI, `authGuard` protects logged-in-only routes.

## Backend design

### Create deck: add `IsPublic`

- Add `bool? IsPublic` to `CreateDeckRequest` and thread it through `DeckService.CreateAsync(...)` (default `false` when omitted, preserving current behavior).

### `PATCH /api/decks/{id}` (DecksController)

- Chosen approach: **multipart PATCH mirroring create** (consistent with existing `[FromForm]` endpoints; reuses the image-save helper; one endpoint per entity).
- Request DTO `UpdateDeckRequest` (`[FromForm]`): `string? Name`, `string? Description`, `string? Emoji`, `int? ColorIndex`, `IFormFile? CardBackImage`, `bool? IsPublic`.
- Controller: `401` if unauthenticated; delegate to `DeckService.UpdateAsync(...)`; return updated `DeckDetail` on success, `404` if not found / not owner.
- `DeckService.UpdateAsync(int deckId, UpdateDeckRequest req, int userId)`:
  - Load deck; if `null` or `deck.UserId != userId` → return `null`.
  - Apply `Name` (if non-empty — `Name` is required so never cleared), `Emoji`, `ColorIndex`, `IsPublic` when provided.
  - Set `Description` to the submitted value (empty string → stored as `null`), since the edit form always sends the full current state.
  - If `CardBackImage` is a non-empty file, save it via the existing image helper and set `CardBackImageUrl`.
  - `SaveChangesAsync`; invalidate `AllDecksKey` and `DeckKey(deckId)`; return the updated `DeckDetail`.

### Removed: visibility-only endpoint

- Delete `PATCH /api/decks/{id}/visibility`, `DeckService.ToggleVisibilityAsync`, and `ToggleVisibilityRequest` — superseded by `IsPublic` on create + update.

### `PATCH /api/cards/{id}` (CardsController)

- Request DTO `UpdateCardRequest` (`[FromForm]`): `string? Title`, `string? Description`, `IFormFile? Image`.
- Controller: `401` if unauthenticated; delegate to `CardService.UpdateAsync(...)`; return updated `CardDto` on success, `404` if not found / not owner.
- `CardService.UpdateAsync(int cardId, UpdateCardRequest req, int userId)`:
  - Load card including its `Deck`; if `null` or `card.Deck.UserId != userId` → return `null`.
  - Apply `Title` (if non-empty — required), `Description` (if non-empty — required) when provided.
  - If `Image` is a non-empty file, save via the image helper and set `ImageUrl`.
  - `SaveChangesAsync`; invalidate the parent deck's cache keys (`AllDecksKey`, `DeckKey(card.DeckId)`); return the updated `CardDto`.
- The image-save logic is currently private to `DeckService`; extract a small shared helper (or a static utility) so `CardService` can reuse it rather than duplicating file handling.

No new migration. Update `proxy.conf.js` is **not** needed — `/api` and `/images` are already proxied.

## Frontend design

### Routes (added to `app-routing-module.ts`)

| Route | Component | Access |
|-------|-----------|--------|
| `/decks/:id` (existing) | `DeckDetailComponent` | anyone who can see the deck; owner gets an **Edit deck** button |
| `/decks/:id/edit` (new) | `DeckEditComponent` (lazy) | logged-in (`authGuard`) + owner-only (component redirect) |
| `/decks/:id/cards/:cardId` (new) | `CardDetailComponent` (lazy) | anyone who can see the deck; owner gets an **Edit card** button |
| `/decks/:id/cards/:cardId/edit` (new) | `CardEditComponent` (lazy) | logged-in (`authGuard`) + owner-only (component redirect) |

### Pages

- **Deck list / tile** (`DeckListComponent`): **remove the owner controls** (visibility toggle + delete) from the tile, keeping only the 🌐/🔒 badge. Remove the now-unused `deleteDeck` and `toggleVisibility` methods from the component.
- **Deck review** = existing `/decks/:id` detail page. Add an owner-only **Edit deck** button (visible when `deck.isOwner`) navigating to `/decks/:id/edit`. Make each card tile in the grid navigate to `/decks/:id/cards/:cardId`. **Remove the per-card delete button** from this grid (moves to the card edit page).
- **Create deck** (`CreateDeckComponent`): add a **public/private choice** to the form (default private). Include `isPublic` in the submitted payload.
- **`DeckEditComponent`** (owner-only): loads the deck via `DeckService.getDeck(id)`; if `!isOwner`, redirect to `/decks/:id`. Reactive form pre-filled with `emoji`, `colorIndex`, `name`, `description`, **and the public/private choice**; optional card-back image swap that shows the current back and previews a new one. Includes a **Delete deck** button (confirm → `DeckService.deleteDeck(id)` → navigate to `/decks`). Submit → `DeckService.updateDeck(id, payload)` → navigate back to `/decks/:id`.
- **`CardDetailComponent`** (review): loads the deck via `DeckService.getDeck(deckId)`, finds the card by `cardId` (404-state if missing). Shows the card image, **title**, and description. If `deck.isOwner`, shows an **Edit card** button → `/decks/:id/cards/:cardId/edit`. Also a back link to the deck.
- **`CardEditComponent`** (owner-only): loads deck + card the same way; if `!isOwner`, redirect to the card detail page. Reactive form pre-filled with `title`, `description`; optional image swap showing the current image. Includes a **Delete card** button (confirm → `CardService.deleteCard(cardId)` → navigate to `/decks/:id`). Submit → `CardService.updateCard(cardId, payload)` → navigate to `/decks/:id/cards/:cardId`.

### Owner-only enforcement

Edit routes use the existing `authGuard` (must be logged in). Owner enforcement happens in the component after the deck loads: if `isOwner` is false, redirect to the corresponding detail page. This mirrors how `isOwner` already gates owner UI elsewhere and avoids a data-loading route guard.

### Services & models

- Add `isPublic: boolean` to `CreateDeckPayload`; include it in `DeckService.createDeck`'s `FormData`.
- `DeckService.updateDeck(id: number, payload: CreateDeckPayload): Observable<Deck>` — `PATCH /api/decks/:id` as `FormData` (mirrors `createDeck`, including `isPublic`).
- **Remove `DeckService.toggleVisibility`** (backend endpoint is gone).
- `CardService.updateCard(id: number, payload: { title: string; description: string; image?: File }): Observable<Card>` — `PATCH /api/cards/:id` as `FormData`.
- No new GET endpoint: card pages reuse `DeckService.getDeck(deckId)` and pick the card by id, which also yields `isOwner`.

### Form-reuse decision

**Separate edit components** (`DeckEditComponent`, `CardEditComponent`) that reuse the create forms' styling/markup, pre-filled and PATCHing. Chosen over refactoring the create components into a dual-mode form to keep the working create flow untouched (lowest risk). Accepts some markup/CSS duplication.

## Error handling

- Backend: `401` unauthenticated; `404` for not-found or not-owner (no existence leak); `400` for invalid input (e.g., empty required field, bad image) consistent with create.
- Frontend: forms show an inline `error` signal on failed PATCH (same pattern as create); required-field validation via reactive-form validators (`Name`/`Title` required + max length, matching create).
- Card detail/edit render a not-found state if the `cardId` isn't in the deck.

## Testing

- Frontend (Jasmine + Karma, existing convention): add creation/smoke specs for `DeckEditComponent`, `CardDetailComponent`, `CardEditComponent`, and spec coverage for the new `DeckService.updateDeck` / `CardService.updateCard` methods (HttpTestingController verifying `PATCH` URL + `FormData`). Update existing `DeckListComponent` / `DeckService` specs that reference the removed `toggleVisibility`/tile-delete behavior. Keep the existing suite green.
- Backend has no test project; none added (consistent with current repo).
- Manual verification: as owner, edit a deck and a card (including image swap) and confirm changes persist and appear; as a non-owner viewing a public deck, confirm no edit buttons and that navigating directly to an edit URL redirects to the detail page.

## Out of scope

- Adding cards (create already exists; unchanged).
- Any new database fields or migration.
- Refactoring the create components into a dual-mode form (create page is only extended with the public/private choice).
