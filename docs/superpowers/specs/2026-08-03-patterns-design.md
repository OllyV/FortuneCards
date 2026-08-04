# Patterns Feature — Design

Date: 2026-08-03

## Overview

Add a **Pattern** domain concept to FortuneCards. A Pattern is a reusable, named
layout of numbered positioning slots ("pattern cards") that a user builds once and
can later load onto the real reading Table. Patterns mirror the existing
Deck/Card architecture (entity → DbContext → service → controller on the backend;
model → service → standalone signal components on the frontend).

A **Pattern** owns a list of **PatternCards**. Each PatternCard is simultaneously a
"question" (text + auto-assigned order) and a positioning slot on a table (x, y,
rotation). The two are the **same entity** — the question list edits
text/order/add/remove/reorder, and the table edits x/y/rotation.

## Data Model

### Pattern
| Field | Type | Notes |
|---|---|---|
| Id | int | identity |
| Name | string (required, ≤200) | |
| Description | string? (≤1000) | nulled when blank |
| Emoji | string (≤10), default `🔮` | |
| ColorIndex | int, default 0 | index into the shared 16-gradient palette |
| IsPublic | bool, default false | |
| UserId | int? | owner; `User?` nav |
| CardSizePercent | int, default 15 | card width as % of table width |
| TableHeightPercent | int, default 0 | table height as % of table width |
| CreatedAt | DateTime | UTC |
| Cards | ICollection\<PatternCard\> | |

### PatternCard
| Field | Type | Notes |
|---|---|---|
| Id | int | identity |
| Text | string (required, ≤1000) | the question text |
| Order | int | 1…N, contiguous, auto-renumbered |
| X | double | top-left X, % of table width |
| Y | double | top-left Y, % of table width |
| Rotation | double | degrees, clockwise |
| PatternId | int | FK; `Pattern` nav |

### FavoritePattern (join entity)
Mirrors `FavoriteDeck`. Composite key `(UserId, PatternId)`, plus `CreatedAt` and
`User?`/`Pattern?` navs. Both FKs cascade-delete.

Coordinate model matches the existing `TableItemBase` (positions as % of table
width; rotation in degrees). No images are involved.

## Backend

Files under `FortuneCards.Server/`, all mirroring the Deck/Card patterns.

### Entities
- `Models/Pattern.cs`, `Models/PatternCard.cs`, `Models/FavoritePattern.cs`.
- `Models/User.cs`: add `ICollection<Pattern> Patterns` and
  `ICollection<FavoritePattern> FavoritePatterns` for symmetry with `Decks`/`FavoriteDecks`.
- `Models/Pattern.cs`: `ICollection<FavoritePattern> FavoritedBy`.

### DbContext (`Data/FortuneCardsDbContext.cs`)
- `DbSet<Pattern> Patterns`, `DbSet<PatternCard> PatternCards`,
  `DbSet<FavoritePattern> FavoritePatterns`.
- Fluent config: max lengths + `HasDefaultValue` for Emoji/ColorIndex/IsPublic/
  CardSizePercent/TableHeightPercent; FK `Pattern → User` `WithMany(u => u.Patterns)`
  `OnDelete SetNull`; FK `PatternCard → Pattern` `WithMany(p => p.Cards)`
  `OnDelete Cascade`; `FavoritePattern` composite key `(UserId, PatternId)` with two
  cascade FKs (mirrors `FavoriteDeck`).

### DTOs (records in `Services/IPatternService.cs`)
```csharp
public record PatternSummary(int Id, string Name, string? Description, DateTime CreatedAt,
    int CardCount, string Emoji, int ColorIndex, bool IsPublic, bool IsOwner, bool IsFavorite);

public record PatternCardDto(int Id, string Text, int Order, double X, double Y, double Rotation);

public record PatternDetail(int Id, string Name, string? Description, DateTime CreatedAt,
    IEnumerable<PatternCardDto> Cards, string Emoji, int ColorIndex, bool IsPublic, bool IsOwner,
    bool IsFavorite, int CardSizePercent, int TableHeightPercent);
```
Reuse the existing `PagedResult<T>`. Request input for cards:
`PatternCardInput(string Text, int Order, double X, double Y, double Rotation)`.

### Service (`Services/IPatternService.cs` + `PatternService.cs`)
Inject `FortuneCardsDbContext`. Ownership enforced in the service
(`p.UserId != userId` → not found); read auth via
`.Where(p => p.Id == id && (p.IsPublic || p.UserId == userId))`.

```csharp
Task<PagedResult<PatternSummary>> GetPublicAsync(string? search, int page, int pageSize);
Task<IEnumerable<PatternSummary>> GetMineAsync(int userId);
Task<PatternDetail?> GetByIdAsync(int id, int? userId = null);
Task<PatternSummary> CreateAsync(string name, string? description, string emoji,
    int colorIndex, bool isPublic, int userId);
Task<PatternDetail?> UpdateAsync(int id, string? name, string? description, string? emoji,
    int? colorIndex, bool? isPublic, int? cardSizePercent, int? tableHeightPercent, int userId);
Task<bool> DeleteAsync(int id, int userId);
Task<PatternDetail?> ReplaceCardsAsync(int patternId, IEnumerable<PatternCardInput> cards, int userId);
Task<bool> AddFavoriteAsync(int patternId, int userId);
Task<bool> RemoveFavoriteAsync(int patternId, int userId);
```
`ReplaceCardsAsync` deletes the pattern's existing PatternCards and inserts the
supplied set (whole-set replace).

`IsOwner`/`IsFavorite` are per-user and must be computed **after** cache retrieval
against the requesting `userId`, exactly as `DeckService` does — the cached public
list / detail holds base data, and the per-user flags are layered on per request so
one user's favorites never leak into another's cached view.

**Caching** mirrors `PublicDeckCache`: a `PublicPatternCache` helper for versioned
public pages, plus per-id (`patterns:{id}`) and per-user mine (`patterns:mine:{userId}`)
entries. `PatternService` injects `IMemoryCache`; every write (`Create`/`Update`/
`Delete`/`ReplaceCards`/favorite toggles) calls `PublicPatternCache.Bump(_cache)` and
`_cache.Remove(...)` for the affected keys. Durations from config
`PatternCache:PatternDurationMinutes` (15) and `PatternCache:PublicDurationMinutes` (5).

### Controller (`Controllers/PatternsController.cs`, `[Route("api/patterns")]`)
Uses the `CurrentUserId` helper pattern. **JSON `[FromBody]`** request classes
declared in-file (no images, unlike Deck's `[FromForm]`).
- `GET /public` — `[FromQuery] string? search, int page = 1, int pageSize = 20`, anonymous.
- `GET /mine` — auth.
- `GET /{id:int}` — passes `CurrentUserId` (public patterns readable anonymously).
- `POST /` — `CreatePatternRequest`.
- `PATCH /{id}` — `UpdatePatternRequest` (nullable fields incl. cardSize/tableHeight).
- `DELETE /{id}`.
- `PUT /{id}/cards` — `ReplacePatternCardsRequest { List<PatternCardInput> Cards }`.
- `PUT /{id}/favorite` / `DELETE /{id}/favorite` — auth (mirrors Decks).

Not-found and not-owner both return `404` (no existence leak), matching Decks.

### Wiring
- `Program.cs`: `builder.Services.AddScoped<IPatternService, PatternService>();`
- Migration: `dotnet ef migrations add AddPatterns` (design-time factory handles the
  connection).

## Frontend

Files under `fortunecards.client/src/app/`.

### Model + Service
- `models/pattern.ts`: `Pattern`, `PatternCard`, `CreatePatternPayload`,
  `UpdatePatternPayload`; reuse `PagedResult<T>`.
- `services/pattern.service.ts` (`base = '/api/patterns'`, plain JSON):
  `getPublicPatterns(search, page, pageSize)`, `getMyPatterns()`, `getPattern(id)`,
  `createPattern(payload)` (POST), `updatePattern(id, payload)` (PATCH),
  `deletePattern(id)` (DELETE), `saveCards(id, cards)` (PUT `/{id}/cards`),
  `addFavorite(id)` (PUT `/{id}/favorite`), `removeFavorite(id)` (DELETE `/{id}/favorite`).
- `Pattern` model includes `isFavorite: boolean`.

### Pages (`app/components/Pattern/`)

**PatternListComponent** — one component, two modes via `route.data.mode`
(mirrors `deck-list`):
- `patterns/mine` → mode `mine` (authGuard) = **MyPatterns**: user's patterns, each
  with links to edit metadata and to add cards, plus delete; "New pattern" button.
- `patterns/search` → mode `search` = **Browse patterns**: debounced search +
  pagination over public patterns (`getPublicPatterns`, `PaginationComponent`).

Both modes show a **favorite toggle** (⭐) per pattern, wired to
`addFavorite`/`removeFavorite` with the `isFavorite` overlay updated optimistically,
mirroring the favorites handling in `deck-list`.

**CreatePatternComponent** — `patterns/new`. Reactive form mirroring `create-deck`:
emoji input over a gradient preview, 16-swatch color picker (`utils/deck-colors`),
name, description, `IsPublic` toggle buttons. On submit → `createPattern` → navigate
to `patterns/:id/cards`.

**UpdatePatternComponent** — `patterns/:id/edit` (authGuard). Mirrors `deck-edit`:
load via `getPattern`, `patchValue`, guard on `isOwner`, PATCH metadata, Delete button.

**AddPatternCardsComponent** — `patterns/:id/cards` (authGuard). Holds one shared
`cards = signal<PatternCard[]>([])`, edited two ways side by side:
- **Question list**: add / remove / reorder (up-down buttons) / edit text. `order`
  auto-renumbers contiguously 1…N on every mutation.
- **AddPatternTable** (child, below).
- **Save** button → `forkJoin(updatePattern(id, {cardSizePercent, tableHeightPercent}),
  saveCards(id, cards))`.

### AddPatternTable + pattern-position-card

**AddPatternTableComponent** — a trimmed `TableComponent`:
- `#table` div measured via `ResizeObserver` → `tableWidthPx` signal.
- `cardSizePercent` signal + a **range control** (min 5, max 50).
- `tableHeightPercent` signal + **+/− length controls** (step = cardSizePercent,
  floored at the lowest card's bottom + clearance).
- Renders `pattern-position-card` children from the shared `cards` list.
- Two-way binds `cardSizePercent`/`tableHeightPercent` and emits `cardMove {id,x,y}`
  and `cardRotate {id,rotation}` to the parent, which owns clamping (mirrors
  `TableComponent.movePatternCard`/`rotatePatternCard`, minus the `locked` guard).

**PatternPositionCardComponent** — a lean child reusing the drag + rotate pointer math
from `table-pattern-card` (pixel geometry from x/y % × `tableWidthPx`; drag emits
percent deltas; a `.rotate-handle` shown when selected computes rotation via `atan2`).
**Drops** lock, flip, fortune-telling `active`/`dimmed`, pick mode, and the auto-fit
font machinery. Displays the `order` number.

### Routes (`app.routes.ts`, specific-first)
```
patterns/new          → CreatePatternComponent
patterns/mine         → PatternListComponent { mode: 'mine' }   (authGuard)
patterns/search       → PatternListComponent { mode: 'search' }
patterns/:id/edit     → UpdatePatternComponent                  (authGuard)
patterns/:id/cards    → AddPatternCardsComponent                (authGuard)
```

### Navigation
Add **"My patterns"** and **"Browse patterns"** links to
`components/Navigation/main-menu/main-menu.html`.

### Load a saved pattern onto the Table
- Add **"Load pattern"** to the existing Pattern ▾ dropdown in
  `TableFortuneTelling/table/table.component`.
- Opens a new **`pattern-selector`** component (mirrors `deck-selector`) listing
  **mine + public** patterns.
- On pick: `getPattern(id)`, map `PatternCard[]` → `TablePatternCard[]`
  (`locked: false`, assign incrementing `z`), **replace** `patternCards()`, and set
  `cardSizePercent` + `tableHeightPercent` from the pattern.

## Testing

Frontend (Vitest; standalone components registered via `imports:`):
- `pattern.service` — request URLs/methods/bodies for each call.
- `create-pattern` — form validity + submit navigation.
- `add-pattern-cards` — add/remove/reorder and auto-renumber (1…N contiguous).
- `pattern-position-card` — move/rotate emit correct payloads.
- `pattern-selector` — lists mine + public, emits selection.
- `pattern-list` — favorite toggle calls the service and updates the overlay.

Backend verified via `dotnet build` (no backend test project) and by running the
`AddPatterns` migration.

## Out of Scope (YAGNI)
- Pattern-card images.
- Editing a pattern's cards directly from the Table (load is read-only onto the table).
