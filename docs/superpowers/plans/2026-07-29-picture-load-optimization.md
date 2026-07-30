# Picture Load Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lazy-load deck card images, move the "add card" tile to the front of the grid, and make it clearly visible.

**Architecture:** All changes are confined to `DeckDetailComponent` (template, CSS, and spec). Image lazy-loading uses the native `loading="lazy"` attribute — no JS, no new dependency. The add-tile is reordered in the template and restyled in CSS.

**Tech Stack:** Angular 21 (standalone components, signals), Vitest test runner (`ng test`). No new dependencies.

## Global Constraints

- Framework: Angular 21, standalone components (no NgModules), TypeScript strict mode.
- Test runner: Vitest via `@angular/build`. Specs use `describe`/`it`/`expect` + `vi` utilities. All specs compile as one bundle — a type error in any spec fails the whole run.
- No backend, model, or service changes. No new npm dependencies.
- Scope: only files under `fortunecards.client/src/app/components/Deck/deck-detail/`.
- Commit subject format: `54: <Description>`.
- Verification command: `ng test --watch=false` run from `fortunecards.client/`.

---

### Task 1: Lazy-load card images

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html:45`
- Test: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`

**Interfaces:**
- Consumes: existing `component.deck` signal (`Deck | null`) and the `Card` model (`{ id, title, description, imageUrl, createdAt, deckId }`).
- Produces: card `<img>` elements that carry `loading="lazy"` and `decoding="async"`.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('DeckDetailComponent', ...)` block in `deck-detail.component.spec.ts`:

```typescript
it('renders card images with native lazy loading', () => {
  component.deck.set({
    ...mockDeck,
    isOwner: true,
    cards: [
      { id: 10, title: 'Sun', description: '', imageUrl: 'https://img/sun.png', createdAt: '2026-01-01', deckId: 1 },
      { id: 11, title: 'Moon', description: '', imageUrl: 'https://img/moon.png', createdAt: '2026-01-01', deckId: 1 },
    ],
  });
  component.loading.set(false);
  fixture.detectChanges();
  const imgs = fixture.nativeElement.querySelectorAll('.card-image img') as NodeListOf<HTMLImageElement>;
  expect(imgs.length).toBe(2);
  imgs.forEach((img) => {
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `fortunecards.client/`:

```bash
ng test --watch=false
```

Expected: FAIL — the new test reports `loading` attribute is `null` (attributes not yet on the `<img>`).

- [ ] **Step 3: Add the attributes to the template**

In `deck-detail.component.html`, replace line 45:

```html
          <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" />
```

with:

```html
          <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" loading="lazy" decoding="async" />
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `fortunecards.client/`:

```bash
ng test --watch=false
```

Expected: PASS — all tests green, including `renders card images with native lazy loading`.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts
git commit -m "54: Lazy-load deck card images"
```

---

### Task 2: Move the add-tile to the front of the grid

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html:38-58`
- Test: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`

**Interfaces:**
- Consumes: `component.deck` signal; `d.isOwner` controls whether the add-tile renders.
- Produces: `.card-tile--add` is the **first** child element of `.card-grid` when the deck is owned.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe` block in `deck-detail.component.spec.ts`:

```typescript
it('renders the add-card tile as the first grid cell for an owner', () => {
  component.deck.set({
    ...mockDeck,
    isOwner: true,
    cards: [
      { id: 10, title: 'Sun', description: '', imageUrl: 'https://img/sun.png', createdAt: '2026-01-01', deckId: 1 },
    ],
  });
  component.loading.set(false);
  fixture.detectChanges();
  const grid = fixture.nativeElement.querySelector('.card-grid');
  const firstTile = grid.children[0];
  expect(firstTile.classList.contains('card-tile--add')).toBe(true);
});

it('does not render the add-card tile when the deck is not owned', () => {
  component.deck.set({ ...mockDeck, isOwner: false, cards: [] });
  component.loading.set(false);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.card-tile--add')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `fortunecards.client/`:

```bash
ng test --watch=false
```

Expected: FAIL — `renders the add-card tile as the first grid cell for an owner` fails because the first grid child is currently a regular `.card-tile`, not `.card-tile--add`.

- [ ] **Step 3: Reorder the template**

In `deck-detail.component.html`, move the add-tile block so it precedes the `*ngFor`. The `.card-grid` contents (lines 38–58) become:

```html
    <div class="card-grid">
      <div *ngIf="d.isOwner" class="card-tile card-tile--add"
           [style.aspect-ratio]="d.aspectWidth + ' / ' + d.aspectHeight"
           (click)="addCard()">
        <div class="card-image card-image--add">+</div>
      </div>

      <div class="card-tile"
           *ngFor="let card of (d.cards ?? []); let i = index"
           [style.aspect-ratio]="d.aspectWidth + ' / ' + d.aspectHeight"
           [style.border-top-color]="getCardAccent(i)"
           (click)="openCard(card.id)">
        <div class="card-image" [style.background]="getCardAccent(i) + '18'">
          <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" loading="lazy" decoding="async" />
          <span *ngIf="!card.imageUrl" class="card-placeholder">🃏</span>
        </div>
        <div class="card-body">
          <p class="card-title">{{ card.title }}</p>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `fortunecards.client/`:

```bash
ng test --watch=false
```

Expected: PASS — all tests green, including both new add-tile tests.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts
git commit -m "54: Move add-card tile to front of deck grid"
```

---

### Task 3: Restyle the add-tile for visibility

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.css:93-94`

**Interfaces:**
- Consumes: existing CSS custom properties defined in `fortunecards.client/src/styles/design-system.css` — `--color-muted` (`#999`, mid-gray for the border), `--color-label` (`#666`, darker gray for the glyph), `--color-cream` (`#FFF9F0`, existing add-tile background). Note: `--color-border` (`#f0e8dc`) and `--color-border-light` (`#e0d5cc`) are both light beiges and are deliberately NOT used here.
- Produces: `.card-tile--add` with a thicker, darker dashed border; `.card-image--add` with a darker `+` glyph. No template or class-name changes — purely visual.

- [ ] **Step 1: Confirm the darker palette tokens exist**

Run from the repo root to confirm the tokens referenced below are defined:

```bash
grep -n "color-muted\|color-label\|color-cream" fortunecards.client/src/styles/design-system.css
```

Expected: matches showing `--color-muted: #999;`, `--color-label: #666;`, and `--color-cream: #FFF9F0;` are defined.

- [ ] **Step 2: Update the add-tile CSS**

In `deck-detail.component.css`, replace lines 93–94:

```css
.card-tile--add { border-top-color: var(--color-border-light) !important; border-top-style: dashed; box-shadow: none; }
.card-image--add { background: var(--color-cream); font-size: 24px; color: var(--color-border-light); font-weight: 400; }
```

with:

```css
.card-tile--add {
  border: 3px dashed var(--color-muted);
  border-top-color: var(--color-muted) !important;
  box-shadow: none;
}
.card-image--add {
  background: var(--color-cream);
  font-size: 32px;
  color: var(--color-label);
  font-weight: 700;
}
```

- [ ] **Step 3: Verify the suite still passes**

Run from `fortunecards.client/`:

```bash
ng test --watch=false
```

Expected: PASS — CSS-only change; no test regressions.

- [ ] **Step 4: Visually verify (manual)**

Start the app (`dotnet run --project FortuneCards.Server` + `npm start` from `fortunecards.client/`, or F5 in Visual Studio), open a deck you own, and confirm the add-tile is the first cell and its border and `+` are clearly visible on a light background.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.css
git commit -m "54: Darken add-card tile border and glyph for visibility"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (lazy-load images) → Task 1. ✓
- Spec §2 (move add-tile to front) → Task 2. ✓
- Spec §3 (restyle add-tile) → Task 3. ✓
- Spec "Testing" (add-tile first child, imgs carry `loading="lazy"`) → Task 1 Step 1 and Task 2 Step 1. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps. All code shown in full. ✓ (Task 3 uses real palette tokens verified against `styles/design-system.css`: `--color-muted` #999 for the border and `--color-label` #666 for the glyph — both genuinely darker than the current faint `--color-border-light` #e0d5cc.)

**Type consistency:** Mock `Card` objects match the `Card` interface (`id`, `title`, `description`, `imageUrl`, `createdAt`, `deckId`) exactly. `mockDeck` spread matches the existing spec's `Deck` shape. `.card-tile--add` / `.card-image--add` class names match the template across Tasks 2 and 3. ✓
