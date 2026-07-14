# Table Card Info Dialog — Design

**Date:** 2026-07-14
**Branch:** 11_Table

## Goal

Let the user inspect a placed deck card's details on the table. Add a small
"i" (info) handle to the front face of a deck card that opens a dialog showing
the card's picture on the left and its title and description on the right,
styled after the existing deck-selector dialog.

## Scope

- **Deck cards only.** Pattern cards (`TablePatternCard`) have no picture,
  title, or description — only an order number and a text label — so they get
  no info handle. Left unchanged.
- No backend changes. All data needed is already returned by `GET /api/decks/{id}`
  (the `Card` model carries `title` and `description`); it is currently dropped
  when a deck is loaded onto the table.

## Design

### 1. Data — carry title/description onto the table card

`TableDeckCard` currently stores `frontImageUrl` and `cardId` but not the
card's `title`/`description`. Add two fields:

```ts
export interface TableDeckCard extends TableItemBase {
  // …existing fields…
  /** Card title, shown in the info dialog. */
  title: string;
  /** Card description, shown in the info dialog. */
  description: string;
}
```

Populate them in `TableComponent.loadDeck` from the source `Card`:

```ts
title: card.title,
description: card.description,
```

Pattern cards are untouched.

### 2. The "i" handle on `table-card`

- A small circular badge mirroring the existing `.rotate-handle` style
  (26px circle, white background, drop shadow) in the **top-left** corner
  (`top: -12px; left: -12px`), with an info glyph (`ⓘ`).
- Visible only when `selected() && card().flipped` (i.e. the front face is up).
  The rotate handle stays in the top-right, so the two do not collide.
- `title="Card info"` for the tooltip.
- On `pointerdown`, call `$event.stopPropagation()` so it does not start a drag,
  and emit a new `cardInfo` output (`output<void>()`).

### 3. New `card-info-dialog` component

- Standalone component at
  `fortunecards.client/src/app/components/TableFortuneTelling/card-info-dialog/`,
  following the `deck-selector` pattern (fixed full-screen backdrop + centered
  panel; clicking the backdrop or the Close button emits `closed`).
- Inputs: `imageUrl` (string), `title` (string), `description` (string).
- Output: `closed` (`output<void>()`).
- Layout: a flex row — **picture on the left, title + description on the right**.
  The image uses `aspect-ratio: 2 / 3` and a capped width; on narrow screens the
  row wraps so the image sits above the text. The description preserves author
  line breaks (`white-space: pre-wrap`).

### 4. Wiring in `TableComponent`

- Add `readonly infoCardId = signal<string | null>(null);`
- Add `readonly infoCard = computed(() => this.cards().find((c) => c.id === this.infoCardId()) ?? null);`
- Add `openCardInfo(id: string): void { this.infoCardId.set(id); }`
- In the template, the `table-card` gains `(cardInfo)="openCardInfo(card.id)"`.
- Render the dialog at the table level, next to the existing dialogs:

```html
@if (infoCard(); as info) {
  <card-info-dialog
    [imageUrl]="info.frontImageUrl"
    [title]="info.title"
    [description]="info.description"
    (closed)="infoCardId.set(null)"
  />
}
```

- Register `CardInfoDialogComponent` in the `TableComponent` `imports` array.

### Why parent-owned (not card-owned)

The dialog is rendered by `TableComponent`, not inside `table-card`. `.table-card`
has `transform: rotate(...)`, and a CSS transform on an ancestor makes it the
containing block for `position: fixed` descendants. A fixed backdrop/panel
rendered inside the rotated card would be positioned relative to the card rather
than the viewport. Rendering the dialog at the table level avoids this and
matches how `deck-selector` and the settings dialog are already hosted.

## Testing

- **`table-card`**: the "i" renders only when `selected` and `flipped`; clicking
  it emits `cardInfo`; its `pointerdown` does not trigger a card move/drag.
- **`card-info-dialog`**: renders the image (`src`), title, and description;
  clicking the backdrop emits `closed`; clicking Close emits `closed`.
- **`table`**: `openCardInfo` sets `infoCardId` and `infoCard` resolves to the
  right card; the `closed` handler clears it; `loadDeck` populates `title` and
  `description` on the table cards.

## Out of scope

- Pattern-card info (explicitly excluded).
- Editing card details from the dialog (read-only view).
- The deferred pattern-slot linkage (`TableDeckCard.patternId`).
