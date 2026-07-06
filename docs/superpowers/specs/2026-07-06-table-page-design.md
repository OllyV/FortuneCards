# Table Page — Design

**Date:** 2026-07-06
**Branch:** 11_Table
**Status:** Approved

## Purpose

Add a new public "Table" page to the FortuneCards Angular frontend: a resizable play surface where fortune cards can be placed, selected, moved, rotated, and flipped. This stage ships the surface and interactions with a single hard-coded test card; wiring real deck cards onto the table comes in a later stage.

## Routing & Menu

- New route `{ path: 'table', loadComponent: () => import('./components/table/table.component').then(c => c.TableComponent) }` in `app-routing-module.ts`. Lazy-loaded, no auth guard (public, like Search decks).
- New menu item **"Table"** in `main-menu.html`, placed immediately after "Search decks", visible to all users (logged in or not).

## Components

All new components are **standalone**, under `fortunecards.client/src/app/components/`.

### `TableComponent` (`components/table/`)

The page component. Owns all state as signals:

| Signal | Type | Default |
|---|---|---|
| `tableColor` | `'beige' \| 'pink' \| 'yellow' \| 'dark-red'` | `'beige'` |
| `cardSizePercent` | `number` (5–50) | `20` |
| `tableHeightPercent` | `number` — table height in % of table width | derived from viewport height on first measure |
| `cards` | `TableCardState[]` | one test card at (0, 0) |
| `selectedCardId` | `string \| null` | `null` |
| `settingsOpen` | `boolean` | `false` |

Layout: the table is a container `width: 90%`, horizontally centered. Initial height equals the page (viewport) height. Background color driven by `tableColor`.

Controls rendered by the table:
- **⚙ settings button** — top-right corner of the table, opens the settings dialog.
- **"+" / "−" buttons** — bottom-right corner, change table height (see Geometry).

### `TableCardComponent` (`components/table-card/`)

Renders a single card. Two faces: front face shows the text "front", back face shows "back" (placeholder for real card images later). Flip is an animated 3D CSS `rotateY` transition.

- Inputs: card state (`TableCardState`), card width (% of table width), table width in px, selected flag.
- Outputs: select, flip, move (new x/y), rotate (new angle).
- When selected: light border/glow effect and a rotate handle (arrows icon) at the card's top-right corner.

### `TableSettingsDialogComponent` (`components/table-settings-dialog/`)

Overlay dialog opened from the ⚙ button:

1. **Color of table** — four swatches: beige (default), pink, yellow, dark-red.
2. **Size of cards** — range slider, min 5, max 50, value displayed as "% of table width".

Changes apply live to the table's signals. Closed via close button or backdrop click. No persistence — values live in `TableComponent` state only and reset on navigation.

## Data Model

```ts
interface TableCardState {
  id: string;
  x: number;        // % of table width, card top-left
  y: number;        // % of table width (yes, width — see Geometry)
  rotation: number; // degrees
  flipped: boolean;
}
```

## Geometry Model

Everything is stored in **units of % of table width**: card `x`/`y`, card width (= `cardSizePercent`), and table height (`tableHeightPercent`).

- A `ResizeObserver` on the table element keeps a `tableWidthPx` signal; pixel positions are derived from it (`px = percent / 100 * tableWidthPx`).
- Card width is `cardSizePercent`% of table width; card height follows from CSS `aspect-ratio: 2 / 3`.
- Because all geometry is proportional to table width, resizing the window rescales the table, the cards, and their positions automatically — no dedicated resize logic beyond the observer.

### Table height

- Initial height = viewport height, converted once to `tableHeightPercent` on first measure.
- **"+"** adds the current `cardSizePercent` to `tableHeightPercent`; **"−"** subtracts it.
- Minimum height = bottom edge of the lowest card (its y + card height, in table-width %) + 5 (i.e. 5% of table width). "−" clamps to this minimum.

## Interactions

| Gesture | Effect |
|---|---|
| Click card | Select it — light glow border + rotate handle appears at card's top-right |
| Click empty table | Deselect |
| Double-click card | Flip (animated) |
| Drag card body | Move; position clamped inside table bounds |
| Drag rotate handle | Rotate around card center, following pointer angle |
| Hold **R** + **←/→** (card selected) | Rotate ∓1° per keydown; OS key auto-repeat gives smooth continuous rotation while held |

Implementation: custom pointer events (`pointerdown`/`pointermove`/`pointerup` with pointer capture) — no drag library. Keyboard state (R held) tracked via `keydown`/`keyup` listeners active while the table page is displayed.

## Testing

Vitest specs (standalone components registered via `imports:` in TestBed):

- Table defaults: beige color, 20% card size, exactly one card at (0, 0), nothing selected.
- Click selects a card; clicking the table background deselects.
- Double-click toggles `flipped`.
- Settings dialog: color choice and size slider update the table's signals; slider respects 5–50 bounds.
- Height "+" / "−" change `tableHeightPercent` by `cardSizePercent`; "−" clamps to the minimum (lowest card bottom + 5).

Backend: no changes (`dotnet build` untouched).

## Out of Scope (later stages)

- Placing real cards from decks onto the table.
- Persisting table state (server or localStorage).
- Multi-select, z-order management, touch-specific gestures beyond pointer events.
