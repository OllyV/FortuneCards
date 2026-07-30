# Picture Load Optimization — Design

GitHub issue: #54
Branch: `54_PictureLoadOptimization`
Date: 2026-07-29

## Problem

`DeckDetailComponent` renders a `card-grid` that eagerly loads every card image at
once. A deck can contain 100+ cards, so opening the deck fires 100+ image requests
immediately, wasting bandwidth and slowing the page.

Two secondary UX issues in the same grid:

- The "add card" tile (`card-tile--add`) sits at the **end** of the grid, forcing an
  owner to scroll the whole deck to add a card.
- The add-tile's styling (light dashed border, no shadow, faint `+`) is hard to see
  on some screens.

## Scope

All changes are confined to `DeckDetailComponent`
(`fortunecards.client/src/app/components/Deck/deck-detail/`). No backend, model, or
service changes. No new dependencies.

## Design

### 1. Lazy-load card images (native `loading="lazy"`)

In `deck-detail.component.html`, the card image (currently `<img *ngIf="card.imageUrl"
[src]="card.imageUrl" [alt]="card.title" />`) gains `loading="lazy"` and
`decoding="async"`.

The browser then only downloads images near the viewport and fetches more as the user
scrolls — exactly the requested behavior. No TypeScript or CSS logic is required, and
no new dependency is added.

Rationale for native lazy loading over an IntersectionObserver directive or CDK virtual
scroll: the pain point is the **image network payload**, not DOM node count (100
lightweight tile `<div>`s are cheap). Native lazy loading solves the payload problem in
one attribute with full modern-browser support.

### 2. Move the add-tile to the front of the grid

The `card-tile--add` block moves from after the `*ngFor` to **before** it, making it
the first grid cell. The CSS grid fills in DOM order, so no grid changes are needed.
Owners can add a card without scrolling the deck.

### 3. Restyle the add-tile for visibility

Replace the faint styling with a thicker, darker dashed border and a darker `+` glyph
on a subtly tinted background, so the tile clearly reads as an actionable "add" cell on
all screens while staying visually distinct from real card tiles. Exact palette tokens
(darker `--color-border`, `+` in `--color-charcoal`) are chosen against the existing
palette during implementation.

### 4. Cache images across navigations (added scope)

Testing on the branch surfaced a related issue: navigating from the deck to a
card detail and back re-fetches every card image. Root cause — R2 objects are
served with `ETag`/`Last-Modified` but **no `Cache-Control`**, so the browser
revalidates each image (304 round-trips) whenever Angular re-creates the `<img>`
elements; with `loading="lazy"` this shows as visible reloading on scroll.

Fix, in two parts:

- **New uploads:** `R2ImageStorage.SaveAsync` sets
  `Cache-Control: public, max-age=31536000, immutable` on the `PutObjectRequest`.
  Image keys are content-addressed GUIDs (a replaced image gets a new key and the
  old object is deleted), so each URL is genuinely immutable and safe to cache
  forever without revalidation.
- **Existing objects:** a standalone one-off tool `tools/CacheControlBackfill`
  re-uploads every object in the R2 bucket in place with the same header,
  skipping objects that already carry it (idempotent). Modeled on
  `tools/ImageMigrator`; run operationally with the same `R2_*` env vars.

This part is a backend + tooling change (outside the original frontend-only
scope) and has no automated tests — the repo has no backend test project;
verified with `dotnet build`. The runtime effect is verified manually via
response headers / DevTools.

## Testing

Update `deck-detail.component.spec.ts`:

- Assert that, for an owner, the add-tile is the **first** child of `.card-grid`.
- Assert that rendered card `<img>` elements carry `loading="lazy"`.

Verify the full frontend suite with `ng test --watch=false`.
