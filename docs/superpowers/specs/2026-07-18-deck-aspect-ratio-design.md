# Per-Deck Aspect Ratio — Design

**Date:** 2026-07-18
**Branch:** 13_Aspect_Ratio_Cards

## Goal

Let each deck define its own card aspect ratio (instead of the hardcoded `2/3`).
The ratio is chosen in the create-deck and deck-edit forms, persisted on the
`Deck` table, and applied wherever a deck's cards are rendered.

## Decisions

- **Input method:** custom width + height, two numeric inputs (not presets).
- **Storage:** two integers — `AspectWidth`, `AspectHeight`. Preserves intent
  (`2:3` vs `4:6`) and maps directly to CSS `aspect-ratio: W / H`.
- **Default:** `3:5` used as the single default everywhere — create-deck form,
  DB column default, and code fallbacks. Existing decks backfill to `3:5`
  (they shift from the previous `2/3` look).
- **Validation:** each field required, integer, range `1–100`.

## Data Model

`Deck` gains:

```csharp
public int AspectWidth { get; set; } = 3;
public int AspectHeight { get; set; } = 5;
```

EF migration `AddDeckAspectRatio` adds both columns with default `3` / `5`;
existing rows backfill to `3:5`.

## Backend

- **`Models/Deck.cs`** — add the two properties above.
- **`Services/IDeckService.cs`** — add `AspectWidth`/`AspectHeight` to the
  `DeckSummary` and `DeckDetail` records; add both params to `CreateAsync`
  and `UpdateAsync`.
- **`Services/DeckService.cs`** —
  - `GetAllAsync` / `GetByIdAsync`: project `d.AspectWidth`, `d.AspectHeight`.
  - `CreateAsync`: set them on the new `Deck`.
  - `UpdateAsync`: nullable int params — overwrite only when provided
    (same pattern as `ColorIndex`).
- **`Controllers/DecksController.cs`** — add `AspectWidth`/`AspectHeight`
  (`int?`) to `CreateDeckRequest` and `UpdateDeckRequest`; pass through.
  Create falls back to `3`/`5` when null.

## Frontend — Model & Service

- **`models/deck.ts`** — add `aspectWidth: number; aspectHeight: number;` to
  `Deck` and `CreateDeckPayload`.
- **`services/deck.service.ts`** — `buildDeckForm` appends `aspectWidth` and
  `aspectHeight` (as strings).

## Frontend — Forms

**create-deck** and **deck-edit**:

- Add `aspectWidth` / `aspectHeight` controls:
  `[Validators.required, Validators.min(1), Validators.max(100)]`,
  defaulting to `3` / `5`. `deck-edit` patches from the loaded deck.
- Template: a "Card shape" section with two number inputs rendered as `W : H`.
  Bind the existing gradient preview tile's `aspect-ratio` to the live values
  so the chosen shape is visible.
- `submit()` passes `aspectWidth` / `aspectHeight` in the payload.

## Frontend — Applying the Ratio

Each consumer already has the full `deck` (or a `TableDeckCard` copying deck
fields). Replace the hardcoded CSS `aspect-ratio: 2/3` with a live binding
`[style.aspect-ratio]="w + ' / ' + h"`:

- **deck-detail** — `.card-tile`, from `deck`.
- **card-detail** — `.card-figure`, from `deck`.
- **card-edit** — `.image-upload-area`; store the loaded deck's ratio in
  signals and bind.
- **drawn-card** — the flip card element, from `deck`.
- **create-card** — `.image-upload-area`; load the deck's ratio (component
  currently only reads `deckId`) so the upload preview matches. *(Added for
  consistency — not in the original request.)*
- **card-info-dialog** — add `aspectWidth` / `aspectHeight` inputs, passed
  from the table's info card; bind the dialog image.

## Frontend — Table (full scope)

The table hardcodes `2/3` as a `* 1.5` height multiplier throughout its
geometry, and loads one deck at a time.

- **`models/table.ts`** — `TableDeckCard` gains `aspectWidth` / `aspectHeight`.
- **`table.component.ts`** —
  - `loadDeck`: copy `deck.aspectWidth` / `deck.aspectHeight` onto each card.
  - Add a `deckAspect` signal (default `{ w: 3, h: 5 }`) set when a deck loads,
    and a `cardHeightMultiplier` computed = `h / w`.
  - Replace every hardcoded `* 1.5` (in `minHeightPercent`, `moveCard`,
    `placeCards`, `movePatternCard`) with `* cardHeightMultiplier()`.
- **table-card** — bind aspect-ratio from its own card's fields.
- **table-pattern-card** — receive the ratio as inputs from `deckAspect` so
  dealt cards align with the slots (defaults `3:5` before any deck loads).

## Testing

Frontend uses **Vitest** via `@angular/build`; all specs compile as one bundle,
so every spec must stay type-correct.

- **create-deck / deck-edit specs** — new controls exist, default `3`/`5`,
  required + range validation, payload carries the values; deck-edit patches
  from the deck.
- **deck.service spec** — `buildDeckForm` includes `aspectWidth`/`aspectHeight`.
- **table spec** — geometry uses the deck ratio (non-3:5 deck changes layout
  math); `loadDeck` copies the ratio onto cards.
- Add `[style.aspect-ratio]` binding assertions where a component already has a
  spec.
- Full run: `ng test --watch=false`.

Backend has no test project — verify with `dotnet build`.

## Out of Scope

- Preset ratios / dropdown UI.
- Cropping or transforming uploaded images to the ratio (images still use
  `object-fit`; only the frame shape changes).
- Mixing multiple decks' ratios on one table (table loads one deck at a time).
