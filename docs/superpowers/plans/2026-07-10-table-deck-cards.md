# Table Deck Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick a deck on the Table page and have every card in that deck appear as draggable/rotatable/flippable `table-card`s laid out in justified rows, replacing any previously placed deck cards and pushing existing table content down.

**Architecture:** Extend the `TableDeckCard` model to carry deck/card ids, colour index, and both face images. `table-card` renders real images (front = card image; back = deck back image, or the deck gradient when there is none). A new `deck-selector` dialog (auth-aware: my decks when logged in, public decks + search otherwise) emits a full deck; `TableComponent.loadDeck()` runs the justified-row layout and the push-down/extend math.

**Tech Stack:** Angular 21 standalone components, Angular signals, TypeScript strict mode, Vitest (`@angular/build` runner).

## Global Constraints

- All components are **standalone**; register dependencies via `imports:`, never `declarations:`.
- Component state uses **signals** (`signal()`, `computed()`, `input()`, `output()`).
- All table geometry is in **% of table width** (x, y, widths, heights). Card aspect ratio is 2/3, so `cardHeight = cardWidth * 1.5`.
- Tests run under Vitest: `describe`/`it`/`expect` + `vi`. All specs compile as **one bundle** — a type error in any spec fails the whole run, so every card literal must satisfy `TableDeckCard`.
- Provide `provideZonelessChangeDetection()` in every `TestBed`.
- Verify frontend with `cd fortunecards.client && ng test --watch=false`. No backend changes.

---

## File Structure

- `fortunecards.client/src/app/models/table.ts` — extend `TableDeckCard`.
- `fortunecards.client/src/app/components/TableFortuneTelling/table-card/` — render images + gradient back.
- `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/` — **new** dialog component.
- `fortunecards.client/src/app/components/TableFortuneTelling/table/` — `loadDeck` layout + wiring.

---

## Task 1: Extend the `TableDeckCard` model and remove the placeholder card

Introduce the real card shape and stop seeding a hardcoded card. This is the foundational change that keeps the whole spec bundle compiling.

**Files:**
- Modify: `fortunecards.client/src/app/models/table.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts`

**Interfaces:**
- Produces: `TableDeckCard` with `deckId: number`, `cardId: number`, `colorIndex: number`, `frontImageUrl: string`, `backImageUrl: string | null` (plus existing `kind`, `id`, `x`, `y`, `rotation`, `flipped`, `patternId?`).
- Produces: `TableComponent.cards` starts as `[]`; `TableComponent` has a private `nextDeckCardId` counter.

- [ ] **Step 1: Extend the model**

In `models/table.ts`, replace the `TableDeckCard` interface with:

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

- [ ] **Step 2: Start with no deck cards**

In `table.component.ts`, replace the `cards` signal initializer and add the id counter next to `nextPatternId`:

```ts
private nextPatternId = 1;
private nextDeckCardId = 1;
```

```ts
readonly cards = signal<TableDeckCard[]>([]);
```

(Remove the old `[{ kind: 'deck', id: 'test-card', ... }]` literal.)

- [ ] **Step 3: Update the table-card spec fixture (keep the bundle compiling)**

In `table-card.component.spec.ts`, replace the `baseCard` literal so it satisfies the new type:

```ts
const baseCard: TableDeckCard = {
  kind: 'deck', id: 'c1', x: 10, y: 20, rotation: 0, flipped: false,
  deckId: 1, cardId: 1, colorIndex: 0,
  frontImageUrl: '/images/front.png', backImageUrl: '/images/back.png',
};
```

- [ ] **Step 4: Add a card factory and seed affected tests in the table spec**

In `table.component.spec.ts`, add this helper inside the `describe` block (after the `tableEl` helper) and a seeding `beforeEach`:

```ts
function makeDeckCard(overrides: Partial<TableDeckCard> = {}): TableDeckCard {
  return {
    kind: 'deck', id: 'c1', x: 0, y: 0, rotation: 0, flipped: false,
    deckId: 1, cardId: 1, colorIndex: 0,
    frontImageUrl: '/images/front.png', backImageUrl: '/images/back.png',
    ...overrides,
  };
}

beforeEach(() => {
  component.cards.set([makeDeckCard({ id: 'test-card', x: 5, y: 5 })]);
  fixture.detectChanges();
});
```

Add the import at the top:

```ts
import { TableDeckCard } from '../../../models/table';
```

- [ ] **Step 5: Fix the "spec defaults" test to match the empty initializer**

Replace the existing `has spec defaults...` test with:

```ts
it('has spec defaults: beige, 15% cards, nothing selected', () => {
  expect(component.tableColor()).toBe('beige');
  expect(component.cardSizePercent()).toBe(15);
  expect(component.selectedCardId()).toBeNull();
});
```

(All other existing tests keep working: the seeding `beforeEach` provides a `test-card` at `(5, 5)`, matching every assumption they already make.)

- [ ] **Step 6: Run the tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (all existing table + table-card specs green with the new model).

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/models/table.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts
git commit -m "11: Extend TableDeckCard model with deck/card ids and images"
```

---

## Task 2: Render real card images in `table-card`

Front shows the card image; back shows the deck back image, or the deck gradient when the deck has no back image.

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.html`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.css`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts`

**Interfaces:**
- Consumes: `TableDeckCard.frontImageUrl`, `backImageUrl`, `colorIndex`.
- Produces: a `backStyle` computed on the component (`string` — gradient CSS or `''`).

- [ ] **Step 1: Write the failing tests**

In `table-card.component.spec.ts`, delete the `renders back and front faces with placeholder text` test and add:

```ts
it('shows the card image on the front face', () => {
  const img = root().querySelector('.face.front img') as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.getAttribute('src')).toBe('/images/front.png');
});

it('shows the deck back image on the back face when present', () => {
  const img = root().querySelector('.face.back img') as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.getAttribute('src')).toBe('/images/back.png');
});

it('falls back to the deck gradient on the back face when there is no back image', () => {
  fixture.componentRef.setInput('card', { ...baseCard, backImageUrl: null, colorIndex: 0 });
  fixture.detectChanges();
  const back = root().querySelector('.face.back') as HTMLElement;
  expect(back.querySelector('img')).toBeNull();
  expect(back.style.background).toContain('linear-gradient');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL (no `img` in faces; back has no gradient background yet).

- [ ] **Step 3: Add the gradient computed to the component**

In `table-card.component.ts`, add the import and computed:

```ts
import { getDeckGradientStyle } from '../../../utils/deck-colors';
```

```ts
readonly backStyle = computed(() =>
  this.card().backImageUrl ? '' : getDeckGradientStyle(this.card().colorIndex)
);
```

- [ ] **Step 4: Render images in the template**

Replace the `.flip-inner` block in `table-card.component.html` with:

```html
<div class="flip-inner" [class.flipped]="card().flipped">
  <div class="face back" [style.background]="backStyle()">
    @if (card().backImageUrl) {
      <img class="face-img" [src]="card().backImageUrl" alt="" draggable="false" />
    }
  </div>
  <div class="face front">
    <img class="face-img" [src]="card().frontImageUrl" alt="" draggable="false" />
  </div>
</div>
```

- [ ] **Step 5: Style the images**

In `table-card.component.css`, add:

```css
.face-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table-card/
git commit -m "11: Render card images and gradient back face in table-card"
```

---

## Task 3: Create the `deck-selector` dialog

An auth-aware modal that lists decks and emits the full chosen deck (with its cards).

**Files:**
- Create: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.ts`
- Create: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.html`
- Create: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.css`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`

**Interfaces:**
- Consumes: `DeckService.getDecks(): Observable<Deck[]>`, `DeckService.getDeck(id): Observable<Deck>`, `AuthService.currentUser` (signal).
- Produces: `DeckSelectorComponent` with `deckSelected: output<Deck>` and `closed: output<void>`, selector `deck-selector`.

- [ ] **Step 1: Write the failing spec**

Create `deck-selector.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of } from 'rxjs';
import { DeckSelectorComponent } from './deck-selector.component';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck } from '../../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮',
    colorIndex: 0, cardBackImageUrl: null, isPublic: false, isOwner: false, ...over,
  };
}

describe('DeckSelectorComponent', () => {
  let fixture: ComponentFixture<DeckSelectorComponent>;
  const decks = [
    deck({ id: 1, name: 'Mine', isOwner: true, isPublic: false }),
    deck({ id: 2, name: 'Public', isOwner: false, isPublic: true }),
    deck({ id: 3, name: 'Other', isOwner: false, isPublic: false }),
  ];
  const getDeck = vi.fn((id: number) => of(deck({ id, name: 'Full', isOwner: true })));

  function setup(loggedIn: boolean) {
    TestBed.configureTestingModule({
      imports: [DeckSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: { getDecks: () => of(decks), getDeck } },
        { provide: AuthService, useValue: { currentUser: signal(loggedIn ? { id: 1 } : null) } },
      ],
    });
    fixture = TestBed.createComponent(DeckSelectorComponent);
    fixture.detectChanges();
  }

  it('shows only owned decks when authorized', () => {
    setup(true);
    expect(fixture.componentInstance.visibleDecks().map((d) => d.id)).toEqual([1]);
    expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
  });

  it('shows public decks with a search box when not authorized', () => {
    setup(false);
    expect(fixture.componentInstance.visibleDecks().map((d) => d.id)).toEqual([2]);
    expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
    fixture.componentInstance.searchTerm.set('nomatch');
    expect(fixture.componentInstance.visibleDecks()).toEqual([]);
  });

  it('fetches the full deck and emits deckSelected + closed on pick', () => {
    setup(true);
    const selected = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.deckSelected.subscribe(selected);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.selectDeck(decks[0]);
    expect(getDeck).toHaveBeenCalledWith(1);
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Full' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL with "Cannot find module './deck-selector.component'".

- [ ] **Step 3: Create the component class**

Create `deck-selector.component.ts`:

```ts
import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'deck-selector',
  standalone: true,
  templateUrl: './deck-selector.component.html',
  styleUrl: './deck-selector.component.css',
})
export class DeckSelectorComponent {
  private readonly deckService = inject(DeckService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly deckSelected = output<Deck>();
  readonly closed = output<void>();

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly isAuthorized = computed(() => this.auth.currentUser() !== null);

  readonly visibleDecks = computed<Deck[]>(() => {
    const all = this.decks();
    if (this.isAuthorized()) return all.filter((d) => d.isOwner);
    const publicDecks = all.filter((d) => d.isPublic);
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return publicDecks;
    return publicDecks.filter(
      (d) => d.name.toLowerCase().includes(term) || (d.description ?? '').toLowerCase().includes(term)
    );
  });

  constructor() {
    this.deckService
      .getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => {
          this.decks.set(decks);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load decks.');
          this.loading.set(false);
        },
      });
  }

  gradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  selectDeck(deck: Deck): void {
    this.deckService
      .getDeck(deck.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => {
          this.deckSelected.emit(full);
          this.closed.emit();
        },
        error: () => this.error.set('Failed to load deck.'),
      });
  }
}
```

- [ ] **Step 4: Create the template**

Create `deck-selector.component.html`:

```html
<div class="dialog-backdrop" (click)="closed.emit()"></div>
<div class="dialog-panel" role="dialog" aria-label="Select deck">
  <h2>Select a deck</h2>

  @if (!isAuthorized()) {
    <input
      class="deck-search"
      type="search"
      placeholder="Search public decks…"
      [value]="searchTerm()"
      (input)="onSearchInput($event)"
    />
  }

  @if (loading()) {
    <div class="state">Loading decks…</div>
  }
  @if (error()) {
    <div class="state state-error">{{ error() }}</div>
  }

  @if (!loading() && !error()) {
    <div class="deck-grid">
      @for (deck of visibleDecks(); track deck.id) {
        <button type="button" class="deck-tile" [style.background]="gradient(deck.colorIndex)" (click)="selectDeck(deck)">
          <span class="deck-emoji">{{ deck.emoji }}</span>
          <span class="deck-name">{{ deck.name }}</span>
        </button>
      }
    </div>
    @if (visibleDecks().length === 0) {
      <p class="state">{{ isAuthorized() ? 'You have no decks yet.' : 'No public decks found.' }}</p>
    }
  }

  <button class="dialog-close" type="button" (click)="closed.emit()">Close</button>
</div>
```

- [ ] **Step 5: Create the styles**

Create `deck-selector.component.css`:

```css
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 100;
}

.dialog-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.dialog-panel h2 {
  margin: 0 0 16px;
  font-size: 1.1rem;
}

.deck-search {
  width: 100%;
  margin-bottom: 16px;
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.deck-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.deck-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: #222;
  font: inherit;
}

.deck-emoji {
  font-size: 1.8rem;
}

.deck-name {
  font-weight: 600;
  text-align: center;
}

.state {
  padding: 12px 0;
  color: #555;
}

.state-error {
  color: #b00020;
}

.dialog-close {
  display: block;
  margin: 16px 0 0 auto;
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: #6b4f9e;
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/
git commit -m "11: Add deck-selector dialog component"
```

---

## Task 4: Lay out a deck's cards in `TableComponent.loadDeck`

Add the justified-row layout plus the push-down/extend math.

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `Deck` (`id`, `colorIndex`, `cardBackImageUrl`, `cards?: Card[]`); each `Card` has `id`, `imageUrl`.
- Produces: `TableComponent.loadDeck(deck: Deck): void`.

- [ ] **Step 1: Write the failing tests**

In `table.component.spec.ts`, add the `Deck`/`Card` imports at the top:

```ts
import { Deck } from '../../../models/deck';
import { Card } from '../../../models/card';
```

Add this block of tests inside the `describe` (near the end, before the closing `});`):

```ts
function card(id: number): Card {
  return { id, title: `t${id}`, description: '', imageUrl: `/images/${id}.png`, createdAt: '', deckId: 7 };
}
function deck(cards: Card[]): Deck {
  return {
    id: 7, name: 'D', description: null, createdAt: '', emoji: '🔮',
    colorIndex: 2, cardBackImageUrl: '/images/back.png', isPublic: false, isOwner: true, cards,
  };
}

it('loadDeck replaces deck cards but keeps pattern cards', () => {
  component.addPatternCard();
  component.loadDeck(deck([card(1), card(2)]));
  expect(component.cards().length).toBe(2);
  expect(component.cards().every((c) => c.deckId === 7 && !c.flipped)).toBe(true);
  expect(component.patternCards().length).toBe(1);
});

it('loadDeck justifies a single row (cardSize 15% → n=5, gap=3.75)', () => {
  component.loadDeck(deck([card(1), card(2), card(3)]));
  expect(component.cards().map((c) => c.x)).toEqual([5, 23.75, 42.5]);
  expect(component.cards().every((c) => c.y === 5)).toBe(true);
});

it('loadDeck wraps overflow onto a second row 5% below', () => {
  component.loadDeck(deck([1, 2, 3, 4, 5, 6, 7].map(card)));
  // n=5: index 5 and 6 land on row 1 at y = 5 + (22.5 + 5) = 32.5
  expect(component.cards()[5]).toMatchObject({ x: 5, y: 32.5 });
  expect(component.cards()[6]).toMatchObject({ x: 23.75, y: 32.5 });
});

it('loadDeck pushes existing pattern cards down and extends the table', () => {
  component.tableWidthPx.set(1000);
  component.tableHeightPercent.set(100);
  component.addPatternCard(); // pattern at y=5
  component.loadDeck(deck([card(1), card(2), card(3)])); // 1 line
  // distance = 1*(22.5 + 5) + 5 - 5 = 27.5
  expect(component.patternCards()[0].y).toBe(32.5);
  expect(component.tableHeightPercent()).toBe(127.5);
});

it('loadDeck floors the height to fit new cards when nothing else is on the table', () => {
  component.tableWidthPx.set(1000);
  component.tableHeightPercent.set(10);
  component.loadDeck(deck([card(1), card(2), card(3)]));
  // one line: lowest bottom = 5 + 22.5 = 27.5 → min height 32.5
  expect(component.tableHeightPercent()).toBe(32.5);
});

it('loadDeck with an empty deck clears deck cards without pushing patterns', () => {
  component.tableHeightPercent.set(100);
  component.addPatternCard();
  component.loadDeck(deck([]));
  expect(component.cards()).toEqual([]);
  expect(component.patternCards().length).toBe(1);
  expect(component.patternCards()[0].y).toBe(5);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL with "component.loadDeck is not a function".

- [ ] **Step 3: Implement `loadDeck`**

In `table.component.ts`, add the import:

```ts
import { Deck } from '../../../models/deck';
```

Add the method to the class (e.g. after `addPatternCard`):

```ts
loadDeck(deck: Deck): void {
  const cardWidth = this.cardSizePercent();
  const cardHeight = cardWidth * 1.5;
  const source = deck.cards ?? [];

  // Row capacity: max cards whose gaps stay >= 20% of card width across x = 5..95.
  const usable = 90;
  const minGap = 0.2 * cardWidth;
  const n = Math.max(1, Math.floor((usable + minGap) / (cardWidth + minGap)));
  const gap = n > 1 ? (usable - n * cardWidth) / (n - 1) : 0;
  const lines = source.length > 0 ? Math.ceil(source.length / n) : 0;

  const placed: TableDeckCard[] = source.map((card, i) => ({
    kind: 'deck' as const,
    id: `card-${this.nextDeckCardId++}`,
    x: 5 + (i % n) * (cardWidth + gap),
    y: 5 + Math.floor(i / n) * (cardHeight + 5),
    rotation: 0,
    flipped: false,
    deckId: deck.id,
    cardId: card.id,
    colorIndex: deck.colorIndex,
    frontImageUrl: card.imageUrl,
    backImageUrl: deck.cardBackImageUrl,
  }));

  // Push existing items (pattern cards) below the new block and grow the table.
  const existing = this.patternCards();
  if (placed.length > 0 && existing.length > 0) {
    const topmost = existing.reduce((min, c) => Math.min(min, c.y), Infinity);
    const distance = Math.max(0, lines * (cardHeight + 5) + 5 - topmost);
    if (distance > 0) {
      this.patternCards.update((items) => items.map((c) => ({ ...c, y: c.y + distance })));
      this.tableHeightPercent.update((h) => h + distance);
    }
  }

  this.cards.set(placed);
  this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts
git commit -m "11: Lay out deck cards in justified rows via loadDeck"
```

---

## Task 5: Wire the deck-selector into the Table page

Add the "Select deck" button, render the dialog, feed the chosen deck into `loadDeck`, and ignore rotate keys while it is open.

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.html`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `DeckSelectorComponent` (`deckSelected`, `closed`), `TableComponent.loadDeck`.
- Produces: `TableComponent.deckSelectorOpen` (signal), `TableComponent.onDeckSelected(deck: Deck): void`.

- [ ] **Step 1: Write the failing tests**

In `table.component.spec.ts`, add `of` and `DeckService` imports:

```ts
import { of } from 'rxjs';
import { DeckService } from '../../../services/deck.service';
```

Add a `DeckService` mock to the `providers` array in the main `beforeEach` (the dialog injects it when rendered):

```ts
{ provide: DeckService, useValue: { getDecks: () => of([]), getDeck: () => of(null) } },
```

Add these tests inside the `describe`:

```ts
it('opens the deck-selector dialog from the Select deck button', () => {
  expect(fixture.nativeElement.querySelector('deck-selector')).toBeNull();
  (fixture.nativeElement.querySelector('.select-deck-btn') as HTMLElement).click();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('deck-selector')).not.toBeNull();
});

it('onDeckSelected loads the deck and closes the dialog', () => {
  const spy = vi.spyOn(component, 'loadDeck');
  component.deckSelectorOpen.set(true);
  component.onDeckSelected(deck([card(1)]));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(component.deckSelectorOpen()).toBe(false);
});

it('ignores R+arrows while the deck-selector is open', () => {
  component.selectCard('test-card');
  component.deckSelectorOpen.set(true);
  key('keydown', 'r');
  key('keydown', 'ArrowRight');
  expect(component.cards()[0].rotation).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL (`.select-deck-btn` missing; `deckSelectorOpen`/`onDeckSelected` undefined).

- [ ] **Step 3: Add the signal, handler, and key guard**

In `table.component.ts`, add the import and register the component:

```ts
import { DeckSelectorComponent } from '../deck-selector/deck-selector.component';
```

Add `DeckSelectorComponent` to the `imports` array in the `@Component` decorator.

Add the signal (next to `settingsOpen`):

```ts
readonly deckSelectorOpen = signal(false);
```

Add the handler (near `onCardSizeChange`):

```ts
onDeckSelected(deck: Deck): void {
  this.loadDeck(deck);
  this.deckSelectorOpen.set(false);
}
```

Update the first line of `onKeyDown` to also bail while the selector is open:

```ts
if (this.settingsOpen() || this.deckSelectorOpen()) return;
```

- [ ] **Step 4: Add the button and dialog to the template**

In `table.component.html`, add a Select-deck control inside the `.table` div (after the `.pattern-controls` block):

```html
<div class="deck-controls">
  <button class="select-deck-btn" type="button" (click)="deckSelectorOpen.set(true)">Select deck</button>
</div>
```

Add the dialog block at the end of the file (after the settings-dialog `@if`):

```html
@if (deckSelectorOpen()) {
  <deck-selector
    (deckSelected)="onDeckSelected($event)"
    (closed)="deckSelectorOpen.set(false)"
  />
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table/
git commit -m "11: Wire deck-selector into the table page"
```

---

## Verification

- [ ] **Full suite:** `cd fortunecards.client && ng test --watch=false` → all specs pass.
- [ ] **Production build:** `cd fortunecards.client && ng build` → succeeds (strict TS, no unused-import errors).
- [ ] **Manual smoke (optional):** run backend + `npm start`, open the Table page, click **Select deck**, pick a deck, confirm cards appear in justified rows (backs showing), pattern cards pushed down, and the table grew.
