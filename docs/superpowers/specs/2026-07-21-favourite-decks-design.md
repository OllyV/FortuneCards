# Favourite Decks — Design

**Date:** 2026-07-21
**Branch:** 14_FavouriteDecks

## Goal

Let a signed-in user mark public decks they don't own as *favourites*. Favourited
decks appear alongside the user's own decks in "My Decks" and in the table
deck-selector. A star toggle control lives on each deck tile (`deck-list`) and in
the deck hero (`deck-detail`).

## Scope & rules

- The favourite control appears **only when logged in** and **only on decks the
  user does not own** (owned decks are already in My Decks).
- A user can favourite **only a public deck they don't own**. Favouriting is a
  no-op for owned or private decks.
- Favourited decks are shown **mixed together** with owned decks (no separate
  section). A favourited deck naturally shows a *filled* star because the user
  doesn't own it, so it remains recognizable.
- Edge case (accepted): if a favourited deck is later made private, it silently
  drops out of the user's lists (it is no longer visible to them at all). The
  favourite row stays harmlessly and re-appears if the deck becomes public again.

## Data model

New join entity `FortuneCards.Server/Models/FavoriteDeck.cs`:

```csharp
public class FavoriteDeck
{
    public int UserId { get; set; }
    public int DeckId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User? User { get; set; }
    public Deck? Deck { get; set; }
}
```

- Composite primary key `(UserId, DeckId)` — a user favourites a deck at most once.
- Both FKs `OnDelete: Cascade` — deleting a user or deck removes its favourite rows.
- Navigation collections: `User.FavoriteDecks`, `Deck.FavoritedBy`.
- `DbSet<FavoriteDeck> FavoriteDecks` on `FortuneCardsDbContext`; configured in
  `OnModelCreating`.
- New EF migration `AddFavoriteDecks`, applied via the `dotnet ef` CLI
  (VS Package Manager Console fails in this repo due to the esproj ProjectReference).

## Backend API

### DTOs (`IDeckService.cs`)

Add `bool IsFavorite` as the final field of both `DeckSummary` and `DeckDetail`.

### Service (`DeckService.cs`)

- `GetAllAsync(userId)` / `GetByIdAsync(id, userId)`: populate `IsFavorite`. For a
  logged-in user, load their favourited deck IDs into a `HashSet<int>` and flag
  each deck. For anonymous users (`userId == null`) `IsFavorite` is always `false`,
  so the existing anonymous `MemoryCache` entries remain valid and are untouched.
- Which decks are returned is **unchanged** — favourited decks are public, so they
  already appear in `GetAllAsync`'s result set (`IsPublic || UserId == userId`).
  Only the flag is added.
- New methods:
  - `Task<bool> AddFavoriteAsync(int deckId, int userId)` — inserts a favourite row
    only if the deck exists, is public, and is not owned by the user; a duplicate is
    ignored (still returns success). Returns `false` if the deck isn't favouritable.
  - `Task<bool> RemoveFavoriteAsync(int deckId, int userId)` — deletes the row if
    present; returns `true` when removed (idempotent — removing a non-existent
    favourite returns `false`/`NotFound`).
- No anonymous-cache invalidation is required — favourites never affect anonymous
  data.

### Controller (`DecksController.cs`)

- `PUT  /api/decks/{id}/favorite` → `AddFavoriteAsync`. `Unauthorized` if not logged
  in; `NotFound` if the deck isn't favouritable; `NoContent` on success.
- `DELETE /api/decks/{id}/favorite` → `RemoveFavoriteAsync`. `Unauthorized` if not
  logged in; `NotFound` if no favourite row; `NoContent` on success.

## Frontend

### Model (`models/deck.ts`)

Add `isFavorite: boolean` to the `Deck` interface.

### Service (`services/deck.service.ts`)

- `addFavorite(id: number): Observable<void>` → `PUT ${base}/${id}/favorite`.
- `removeFavorite(id: number): Observable<void>` → `DELETE ${base}/${id}/favorite`.

### `deck-list` (grid tiles)

- Star button in each tile's top-right corner, shown only when
  `!deck.isOwner && auth.currentUser()`. Filled when `isFavorite`, outline otherwise.
- Click toggles: optimistically flip `isFavorite` in the `decks` signal, call the
  service, revert on error. `stopPropagation()` so the click doesn't trigger the
  tile's navigation (`RouterLink`).
- `visibleDecks` "mine" filter changes from `d.isOwner` to `d.isOwner || d.isFavorite`.

### `deck-detail` (hero)

- Same star control in the hero, same visibility rule (`!isOwner && logged in`), same
  optimistic toggle updating the `deck` signal.

### `deck-selector` (table select)

- `visibleDecks` for authorized users changes from `d.isOwner` to
  `d.isOwner || d.isFavorite`, so favourites become pickable at the table. No toggle
  control here — this view only needs to *include* favourites.

## Testing

- **Backend:** verified with `dotnet build` (no backend test project exists).
- **Frontend (Vitest, `ng test --watch=false`):**
  - `deck.service.spec` — `addFavorite`/`removeFavorite` issue the right verb/URL.
  - `deck-list.component.spec` — star visibility rule; toggle calls service and flips
    state; "mine" filter includes favourited non-owned decks.
  - `deck-detail.component.spec` — hero star visibility and toggle.
  - `deck-selector.component.spec` — favourited decks are included for authorized users.
