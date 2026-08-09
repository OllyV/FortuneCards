# Pattern Detail Page — Design (Issue #59)

## Goal

Add a read-only **pattern-detail** page that opens when a user clicks a pattern in
`PatternListComponent` (both *My Patterns* and *Browse*). It shows the pattern's
questions and a non-interactive preview of the card positions, plus a `pattern-hero`
header (modelled on the deck-detail hero) carrying the primary actions.

## Context

- The current `pattern-list` links owner cards → `/patterns/:id/edit` and non-owner
  cards → `null` (a dead link). This feature replaces that with a single detail route.
- `PatternService.getPattern(id)` already returns everything needed: `cards`,
  `cardSizePercent`, `tableHeightPercent`, `isOwner`, `isFavorite`. **No backend
  changes are required.**
- Unlike decks, the "hero" here is a real standalone component (`pattern-hero`),
  not an inline section. Deck's hero is inline markup in `deck-detail.component.html`.
- The Table page (`/table`) can already load a pattern via its in-page
  `pattern-selector` modal → `loadPattern()`. This feature adds a second entry point:
  arriving at `/table?pattern=<id>` auto-loads that pattern.

## Route & navigation

- New lazy route `patterns/:id` → `PatternDetailComponent`. **No** `authGuard` —
  public patterns are viewable by anyone; the backend returns 404 for
  private/non-owned patterns (no existence leak).
- Ordering: `patterns/:id` must come **after** `patterns/new`, `patterns/mine`,
  `patterns/search`, and the `patterns/:id/edit` + `patterns/:id/cards` routes so the
  single-segment `:id` does not swallow the literal paths. Placed at the end of the
  patterns block.
- `pattern-list` cards change to link `['/patterns', p.id]` for **all** patterns
  (owner and non-owner alike). Owners reach Edit via the hero buttons. The list-card
  favorite button is unchanged.

## Components

### `PatternDetailComponent` (`patterns/:id`)

Mirrors `deck-detail.component.ts`:

- On the route `params`, calls `getPattern(Number(id))`; holds `pattern`, `loading`,
  `error` signals. Loading/error templates match deck-detail.
- Renders `<app-pattern-hero>`, the read-only question list, the read-only
  `<app-pattern-table-view>`, and a page-end owner-only
  "📝 Edit questions & layout" button (same target as the hero's Edit questions).
- Back button → `/patterns/mine` if `isOwner` else `/patterns/search`.
- Owns the optimistic favorite toggle (copied from `deck-detail.toggleFavorite`:
  flip the signal, call `addFavorite`/`removeFavorite`, revert on error).
- Wires hero outputs to router navigations:
  - `editPattern` → `/patterns/:id/edit`
  - `editQuestions` → `/patterns/:id/cards`
  - `usePattern` → `/table` with `queryParams: { pattern: id }`
  - `toggleFavorite` → the favorite handler above.
- Maps `pattern.cards` (`PatternCard[]`) → the editable-shaped input the table view
  needs, using a stable string id (`String(card.id ?? index)`).

### `PatternHeroComponent` (new standalone component)

- Inputs: `name`, `emoji`, `description` (nullable), `cardCount`, `colorIndex`,
  `isOwner`, `isFavorite`, `isLoggedIn`.
- Outputs: `usePattern`, `editPattern`, `editQuestions`, `toggleFavorite`.
- Gradient/shadow via `getDeckGradientStyle` / `getDeckShadowStyle`.
- Buttons:
  - **Everyone:** "🔮 Use pattern" → `usePattern`.
  - **Owner:** "✏️ Edit pattern" → `editPattern`; "📝 Edit questions" → `editQuestions`.
  - **Logged-in non-owner:** ☆/⭐ favorite toggle → `toggleFavorite`, with
    `aria-pressed` / `aria-label` like deck-hero.
- Presentation mirrors the `.deck-hero` markup/CSS (hero-left, emoji, name, meta,
  hero-actions). CSS lives with the component.

### `pattern-position-card` (modified)

- Add `readonly = input(false)`.
- When `readonly()` is true: the pointer handlers (`onPointerDown`, `onPointerMove`,
  `onPointerUp`, `onRotateStart`) return early / are not bound, the rotate handle is
  not rendered (it is already gated on `selected()`), and the cursor is `default`
  (CSS class toggle, e.g. `.readonly { cursor: default; }`).
- Default `false` preserves all existing editing behavior in `add-pattern-table`.

### `PatternTableViewComponent` (new, lean)

Read-only counterpart to `add-pattern-table`:

- Inputs: `cards` (editable-shaped `EditablePatternCard[]`), `cardSizePercent`,
  `tableHeightPercent`.
- Measures its own width via `ResizeObserver` + initial `getBoundingClientRect`
  (same pattern as `add-pattern-table`), exposes `tableWidthPx`.
- `heightStyle` computed from `tableHeightPercent` and measured width (same formula as
  add-pattern-table, `'60vh'` fallback before measurement).
- Renders one `<pattern-position-card readonly>` per card. No card-size / table-length
  controls, no move/rotate/select outputs.

## Read-only question list

- Numbered rows: `order` badge + `text`. No `<input>`, no reorder/remove buttons.
- Styled to match the existing `.question-row` look (reuse class names where practical;
  a read-only variant may omit the action column).
- Empty state: "No questions yet."

## Table page auto-load (`/table?pattern=<id>`)

- `TableComponent` gains `ngOnInit` (it currently implements only `AfterViewInit`):
  read the `pattern` query param from `ActivatedRoute`; if present and numeric, call
  `PatternService.getPattern(id)` and pass the result to the existing `loadPattern()`.
- Inject `ActivatedRoute` and `PatternService`.
- The fetch is async, so table width is measured (in `AfterViewInit`) by the time the
  pattern arrives; `loadPattern` already floors the height via `minHeightPercent()`.
- The existing selector flow (`openPatternSelector` → `onPatternSelected` →
  `loadPattern`) is unchanged. On failure, the Table simply loads nothing (no cards);
  no blocking error UI is required for this entry point.

## Data flow

```
pattern-list card click
  → /patterns/:id
    → PatternDetailComponent: getPattern(id)
        → pattern-hero (actions)
        → question list (read-only)
        → pattern-table-view → pattern-position-card[readonly]
  hero "Use pattern"
    → /table?pattern=:id
      → TableComponent.ngOnInit: getPattern(id) → loadPattern()
```

## Testing

- **pattern-detail.spec** — loads a pattern and renders questions + table; owner sees
  Edit pattern / Edit questions / page-end button and no favorite; logged-in non-owner
  sees favorite and no Edit buttons; "Use pattern" navigates to `/table` with the
  `pattern` query param; favorite toggle calls the service and reverts on error;
  error state renders.
- **pattern-hero.spec** — each button emits its output; owner-vs-non-owner-vs-anonymous
  visibility; gradient applied.
- **pattern-position-card.spec** — `readonly` blocks `cardMove`/`cardRotate` on pointer
  events and hides the rotate handle; non-readonly behavior still works.
- **pattern-table-view.spec** — renders one position card per input card; passes
  `readonly` through.
- **table.component.spec** — a `pattern` query param triggers `getPattern` +
  `loadPattern`; absence of the param loads nothing.
- **pattern-list.spec** — cards link to `/patterns/:id` for both owner and non-owner.

## Out of scope

- No backend changes (`getPattern` already returns cards + layout + per-user flags).
- No editing or deletion on the detail page (those stay on the edit / add-cards pages).
- No new model fields or DTOs.
- No changes to the existing `pattern-selector` modal or `add-pattern-table`.
