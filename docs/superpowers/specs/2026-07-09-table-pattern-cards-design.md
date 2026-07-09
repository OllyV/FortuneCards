# Table Pattern Cards — Design

**Date:** 2026-07-09
**Branch:** 11_Table
**Status:** Approved (scope: model + components only)

## Problem

The table currently has a single card type (`TableCardState`): a draggable, rotatable,
flippable card intended to show a deck card's front/back images. The fortune-telling
workflow needs a second kind of card:

- **Deck card** — behaves as today: front/back image from an uploaded deck card,
  flippable; selecting it will (later) show the deck card's meaning.
- **Pattern card** — carries text and an order number, is **not** flippable, and can be
  **locked** from user interaction.

Intended end-state workflow (most of which is *out of scope for this increment*): the user
lays out a pattern of pattern-cards, locks them, then places deck cards and manually links
each to a pattern slot so the pattern's text is shown alongside the card's meaning;
re-running the reading picks fresh cards for the same pattern.

## Scope

**In scope (this increment):**

- Replace the flat `TableCardState` with a discriminated-union model of two card kinds.
- Retype the existing card component to the deck-card kind (no behavior change).
- Add a new `table-pattern-card` component (text + order, lockable, draggable/rotatable,
  **no flip**).
- Render both kinds from two independent signals in the table host.
- Minimal demonstrable controls: **"Add pattern card"** button and **"Lock pattern"** toggle.

**Deferred (future specs):**

- The manual-pick linkage UI connecting a selected deck card to a pattern slot.
- Showing pattern text together with a deck card's meaning.
- Real deck-card images/meanings on the table.
- Re-triggering a reading to reassign cards.
- Persisting/saving patterns independently from decks.

## Decisions & rationale

- **Discriminated union, not class inheritance.** All table state is updated immutably via
  object spreads (`{ ...c, flipped }`) inside Angular signals. Spreads drop class
  prototypes, so an inheritance hierarchy would break `instanceof`/methods after every
  update. A `kind`-discriminated union stays plain-object-friendly and gives
  `switch (item.kind)` exhaustiveness checking.
- **Two signals, not one union array.** Keeping `cards` and `patternCards` separate lets a
  pattern be loaded/saved independently of any deck (a stated future goal), gives clean
  per-array typing without type guards in most operations, and makes z-ordering trivial
  (render patterns first, deck cards on top). Chosen over a single `items` array for lower
  coupling and extendability.
- **Duplicated pointer logic, not a shared base/directive.** Per explicit preference: each
  component owns its own drag/rotate handlers. Some duplication is acceptable in exchange
  for lower coupling and independently-evolvable card kinds.

## Data model — `models/table.ts`

```ts
export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

interface TableItemBase {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
}

export interface TableDeckCard extends TableItemBase {
  kind: 'deck';
  /** false = back face up (default), true = front face up. */
  flipped: boolean;
  /** Reserved for the deferred manual-pick link to a pattern slot; unused this increment. */
  patternId?: string;
}

export interface TablePatternCard extends TableItemBase {
  kind: 'pattern';
  text: string;
  order: number;
  locked: boolean;
}

export type TableItem = TableDeckCard | TablePatternCard;
```

Geometry is unchanged from the current model: same %-of-table-width units and the same 2:3
card aspect ratio for both kinds.

## Components

### `table-card.component` (existing — retyped)

- Input `card` retyped from `TableCardState` to `TableDeckCard`.
- No behavior change: keeps drag, rotate, flip, and the `cardSelect`/`cardFlip`/`cardMove`/
  `cardRotate` outputs.

### `table-pattern-card.component` (new, standalone)

- **Inputs:** `card: TablePatternCard`, `widthPercent: number`, `tableWidthPx: number`,
  `selected = false`.
- **Outputs:** `cardSelect`, `cardMove` (`{ x, y }` in % of table width),
  `cardRotate` (absolute degrees), `textChange` (new text, for inline editing).
  **No `cardFlip`.**
- **Rendering:** shows the pattern `text` and `order` number; same card dimensions
  (`leftPx`/`topPx`/`widthPx` computed exactly as in `table-card`).
- **Behavior:** owns its own pointer handlers for drag + rotate (copied from `table-card`,
  minus flip). When `card.locked` is `true`, all pointer interaction is ignored — no select,
  no drag, no rotate.

## Table host — `table.component`

- **State:**
  - `cards = signal<TableDeckCard[]>([...])` — the existing seed card gains `kind: 'deck'`.
  - `patternCards = signal<TablePatternCard[]>([])`.
  - `selectedId = signal<string | null>(null)` stays single; ids are unique across both
    arrays.
- **Template:** render `patternCards` first (lower z-index, behind), then `cards` (on top),
  as two `@for` blocks, so deck cards visually move over pattern cards.
- **Handlers:**
  - `movePatternCard` / `rotatePatternCard` mirror the deck-card handlers, each a no-op when
    the target pattern card is `locked`.
  - `flipCard` remains deck-only.
  - Keyboard rotate (`R` + arrows) looks the selected item up in whichever array holds it;
    a locked pattern card does not rotate.
  - `minHeightPercent` computes the lowest card bottom across **both** arrays.
- **Controls:**
  - **"Add pattern card"** — appends a `TablePatternCard` with the next `order`, default
    `locked: false`, and inline-editable `text`.
  - **"Lock pattern"** toggle — flips `locked` on all pattern cards.

## Testing

- Model: type-level — a `switch (item.kind)` covering `'deck'` and `'pattern'` compiles with
  exhaustiveness (no `default` needed).
- `table-pattern-card.component` spec (standalone, registered via `imports:` in `TestBed`):
  renders `text` and `order`; emits `cardMove`/`cardRotate` on drag/rotate; emits **nothing**
  and does not move when `locked` is `true`; never exposes a flip affordance.
- `table.component` spec: "Add pattern card" appends to `patternCards` with incrementing
  `order`; "Lock pattern" sets `locked` on all; deck-card behavior (flip/move/rotate)
  unchanged; `minHeightPercent` reflects the lowest card across both arrays.
- Run `ng test --watch=false` for verification (Vitest; all specs compile as one bundle).
