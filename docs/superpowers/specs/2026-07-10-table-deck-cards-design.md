# Table Deck Cards — Design

**Date:** 2026-07-10
**Branch:** 11_Table
**Status:** Approved design, pending implementation plan

## Goal

Let a user pick a deck on the Table page and have every card in that deck
appear on the table as a draggable/rotatable/flippable `table-card`, laid out
automatically in justified rows. Selecting a deck replaces any previously placed
deck cards and pushes existing table content down to make room.

## Scope

In scope:
- A `deck-selector` dialog on the Table page.
- Real card images on `table-card` (front = card image, back = deck back image or
  deck gradient fallback).
- Automatic layout of a deck's cards into justified rows.
- Pushing existing table items (pattern cards) down and extending the table when
  a deck is loaded.

Out of scope (unchanged / deferred):
- Persisting table state to the backend.
- The manual pick / pattern-slot linkage (`patternId`) — still reserved, unused.
- Reordering or shuffling cards.

## 1. Data model — `models/table.ts`

Extend `TableDeckCard` so each placed card carries its origin and the data needed
to render both faces:

```ts
export interface TableDeckCard extends TableItemBase {
  kind: 'deck';
  /** false = back face up (default for freshly placed cards), true = front face up. */
  flipped: boolean;
  deckId: number;
  cardId: number;
  /** Deck colour index — used for the gradient fallback back face. */
  colorIndex: number;
  /** Card image (front face). */
  frontImageUrl: string;
  /** Deck back image; null → render the deck gradient instead. */
  backImageUrl: string | null;
  /** Reserved for the deferred manual-pick link to a pattern slot; unused for now. */
  patternId?: string;
}
```

## 2. `table-card` — render real images

- **Front face:** `<img [src]="card().frontImageUrl">`.
- **Back face:** if `card().backImageUrl` is set, `<img [src]="backImageUrl">`;
  otherwise apply `getDeckGradientStyle(card().colorIndex)` (from
  `utils/deck-colors`) as the face background.
- Keep the existing 3D flip, drag, rotate, and select behavior untouched.
- Images fill the face (`object-fit: cover`, `width/height: 100%`, inherited
  border-radius), remain non-draggable (`draggable="false"`, `user-select: none`,
  `pointer-events: none` on the `<img>` so drag/rotate still hit the card).

## 3. `deck-selector` dialog — `TableFortuneTelling/deck-selector/`

New standalone component, modeled on `table-settings-dialog`
(overlay + panel + close). Selector `deck-selector`.

Behavior:
- Injects `DeckService` and `AuthService`.
- On open, calls `DeckService.getDecks()`.
- **Mode depends on auth** (mirrors the two `deck-list` modes):
  - Authorized (`auth.currentUser()` truthy) → list decks where `isOwner`
    ("My decks"). No search box.
  - Not authorized → list decks where `isPublic`, with a search input filtering
    by name/description (like deck-list "search" mode).
- Each deck renders as a tile (emoji + name), styled with the deck gradient for
  visual consistency (reuse `getDeckGradientStyle`).
- On pick: call `DeckService.getDeck(id)` to fetch the full deck **with cards**,
  then emit the loaded deck to the parent and close.
- Loading / error / empty states shown inline (spinner text, error text, "no
  decks" text), following `deck-list`'s pattern.

Outputs:
- `deckSelected: output<Deck>` — the full deck (with `cards`) chosen by the user.
- `closed: output<void>`.

The Table toolbar gains a **"Select deck"** button that sets `deckSelectorOpen`.

## 4. Placement — `TableComponent`

All geometry in **% of table width** (existing convention).
Let `cardWidth = cardSizePercent()` and `cardHeight = cardWidth * 1.5`.

New method `loadDeck(deck: Deck)`:

### 4a. Replace previous deck cards
Set `cards` to `[]` first (the placeholder test card and any prior deck's cards
are removed). Pattern cards are untouched. If `deck.cards` is empty/undefined,
stop after clearing.

### 4b. Cards per row (`n`) and horizontal justification
Row band spans x = 5 → 95 (usable width = 90; left & right margins of 5).
Minimum gap between adjacent cards = `0.2 * cardWidth`.

- `n` = the largest count with `n*cardWidth + (n-1)*(0.2*cardWidth) ≤ 90`
  (at least 1).
- If `n == 1` or only one card, place at x = 5.
- Otherwise **justify**: `gap = (90 - n*cardWidth) / (n - 1)` (≥ the 0.2·cardWidth
  minimum by construction). Card `i` in a full row: `x = 5 + i*(cardWidth + gap)`;
  the last card's right edge lands on 95.
  - A trailing, partially filled row uses the **same `gap`** (left-aligned from
    x = 5), not re-justified.

### 4c. Vertical rows
`L = ceil(total / n)` lines. Row `k` (0-based) top: `y = 5 + k*(cardHeight + 5)`
(5% gap between lines). Cards fill left→right, top→bottom.

Each new card: `kind: 'deck'`, `id: 'card-' + nextDeckCardId++` (monotonic
counter, like pattern ids), `rotation: 0`, `flipped: false` (back showing),
`deckId`, `cardId`, `colorIndex`, `frontImageUrl`, `backImageUrl` from the deck
and card.

### 4d. Push existing items down + extend table
Existing items = current `patternCards` (deck cards were just cleared). The code
handles both types generically.

- `topmost = min(y)` over existing items (skip if none).
- `distance = (L*(cardHeight + 5) + 5) − topmost`, clamped to `≥ 0`.
  - This is the new-cards block height: `L` lines each `cardHeight + 5` tall,
    plus a final 5% gap — i.e. where existing content should now start.
- If there are existing items and `distance > 0`: add `distance` to every
  existing item's `y`, and set `tableHeightPercent += distance`.
- If there are **no** existing items: floor `tableHeightPercent` to
  `max(current, minHeightPercent())` so the new cards fit (reusing the existing
  `minHeightPercent` computed signal, which already accounts for all cards).

## Wiring & flow

1. User clicks **Select deck** → `deck-selector` opens.
2. Dialog lists decks per auth mode; user picks one.
3. Dialog fetches the full deck and emits `deckSelected`.
4. `TableComponent.loadDeck(deck)` runs the placement above and closes the dialog.
5. Cards render via the existing `@for (card of cards())` loop; all existing
   drag/rotate/flip/select handlers work unchanged.

## Testing

Frontend (Vitest, `ng test --watch=false`):
- **table.component.spec** — `loadDeck`:
  - clears prior deck cards, keeps pattern cards;
  - computes `n` and justified `gap` for a known `cardSizePercent`;
  - wraps to `L` rows with correct `y` per row;
  - pushes an existing pattern card down by `distance` and grows
    `tableHeightPercent` by the same amount;
  - no-op push when there are no existing items (height floored to fit).
- **deck-selector.component.spec** — authorized shows owner decks; unauthorized
  shows public decks + search filter; picking a deck fetches `getDeck` and emits
  `deckSelected`; loading/error/empty states. Mock `DeckService`/`AuthService`.
- **table-card.component.spec** — front `<img>` uses `frontImageUrl`; back uses
  `<img>` when `backImageUrl` set, else gradient background from `colorIndex`.

Backend: no changes (`dotnet build` only if touched — it is not).

## Notes / assumptions

- `getDecks()` returns public decks to anonymous users (the existing deck-list
  "search" mode already relies on this).
- `getDeck(id)` returns the deck with its `cards` populated (used by the deck
  detail view).
- Decks with no `cardBackImageUrl` fall back to the gradient back face; decks
  with no cards clear the table's deck cards and do nothing else.
