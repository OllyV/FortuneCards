# Fortune-telling Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide the user through a fortune-telling reading — the pattern's questions are asked one at a time, and for each the user clicks a deck card, which is dealt face-up onto the matching pattern slot with the answered question recorded on it.

**Architecture:** All orchestration lives in the existing `TableComponent` (Angular signals). A new `fortuneStepOrder` signal drives which pattern card is "active"; deck cards enter a click-to-place mode via a new `pickMode` input on `table-card`; the active pattern card glows via a new `active` input on `table-pattern-card`. No backend or persistence work.

**Tech Stack:** Angular 21 standalone components, signals, Vitest (`@angular/build` builder). Run tests from `fortunecards.client/`.

## Global Constraints

- Angular **standalone** components only; register components in `TestBed` via `imports:` (never `declarations:`).
- TypeScript **strict mode** — no implicit `any`, handle `null`/`undefined` explicitly.
- Frontend tests use **Vitest** (`describe`/`it`/`expect`, `vi.spyOn`, `vi.fn`); all specs compile as one bundle, so a type error in any spec fails the whole run.
- Geometry unit: `x`/`y`/sizes are **% of table width**; card aspect ratio is 2/3 (height = `cardSizePercent * 1.5`).
- Run the full suite with: `npm test -- --watch=false` from `fortunecards.client/`.
- `patternText` string format is exactly `` `${order}. ${text}` `` — e.g. `"1. Position 1"`.

---

### Task 1: Rename `patternId` → `patternText` and clear it on (re)placement

**Files:**
- Modify: `fortunecards.client/src/app/models/table.ts` (the `TableDeckCard.patternId?` field, ~line 31-32)
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts` (`placeCards`, ~line 180-187)
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: nothing (the field is currently unused in code).
- Produces: `TableDeckCard.patternText?: string` — the answered pattern question `"{order}. {text}"`, `undefined` when the card is not (yet) placed on a pattern slot. `placeCards`/`loadDeck` always leave it `undefined`.

- [ ] **Step 1: Rename the model field**

In `models/table.ts`, replace the current field and comment:

```ts
  /** Reserved for the deferred manual-pick link to a pattern slot; unused for now. */
  patternId?: string;
```

with:

```ts
  /**
   * The answered pattern question this card was dealt onto, as `"{order}. {text}"`
   * (e.g. "1. Position 1"). Undefined until the card is placed on a pattern slot;
   * cleared whenever the deck is (re)placed.
   */
  patternText?: string;
```

- [ ] **Step 2: Write the failing test for clearing on re-load**

Add this test inside `describe('TableComponent', ...)` in `table.component.spec.ts` (the `deck`/`card` helpers already exist in that file):

```ts
it('placeCards clears patternText on every deck card when the deck is re-loaded', () => {
  component.loadDeck(deck([card(1), card(2)]));
  // simulate a prior reading having stamped a card
  component.cards.update((cards) =>
    cards.map((c, i) => (i === 0 ? { ...c, patternText: '1. Position 1' } : c))
  );
  component.reloadDeck();
  expect(component.cards().every((c) => c.patternText === undefined)).toBe(true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --watch=false -t "clears patternText"`
Expected: FAIL — the stamped card still has `patternText === '1. Position 1'` after re-load (placeCards carries it over via the `...card` spread).

- [ ] **Step 4: Clear `patternText` in `placeCards`**

In `table.component.ts`, in the `placeCards` mapping, add `patternText: undefined` to the placed-card object:

```ts
    const placed: TableDeckCard[] = this.shuffle(cards).map((card, i) => ({
      ...card,
      x: 5 + (i % n) * gap,
      y: 7 + Math.floor(i / n) * (cardHeight + 5),
      z: i,
      rotation: 0,
      flipped: false,
      patternText: undefined,
    }));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- --watch=false -t "clears patternText"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/models/table.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts
git commit -m "11: Rename TableDeckCard.patternId to patternText and clear it on deck re-load"
```

---

### Task 2: Fortune-telling state and orchestration in `TableComponent`

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `patternText` from Task 1; existing `patternCards`, `cards`, `patternsLocked`, `toggleLockPattern()`, `placeCards()`, `closeMenus()`, `nextZ`.
- Produces:
  - `fortuneStepOrder = signal<number | null>(null)` — `order` of the pattern card being asked; `null` = not running.
  - `activePatternId = computed<string | null>` — id of the pattern card whose `order === fortuneStepOrder()`.
  - `fortuneActive = computed<boolean>` — `fortuneStepOrder() !== null`.
  - `startFortuneTelling(): void`
  - `pickCard(id: string): void` — deals deck card `id` onto the active pattern slot and advances.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block inside `describe('TableComponent', ...)` in `table.component.spec.ts` (uses the existing `deck`/`card` helpers and the file-level `makeDeckCard`):

```ts
describe('fortune-telling', () => {
  beforeEach(() => {
    component.cards.set([]); // drop the seeded single card
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    // deterministic deck order so placement is assertable
    vi.spyOn(component as unknown as { shuffle(items: TableDeckCard[]): TableDeckCard[] }, 'shuffle')
      .mockImplementation((items) => items);
  });

  it('start locks the pattern, reloads the deck (clearing patternText) and asks order 1', () => {
    component.addPatternCard(); // order 1
    component.addPatternCard(); // order 2
    component.loadDeck(deck([card(1), card(2), card(3)]));

    component.startFortuneTelling();

    expect(component.patternsLocked()).toBe(true);
    expect(component.fortuneStepOrder()).toBe(1);
    expect(component.fortuneActive()).toBe(true);
    const active = component.patternCards().find((p) => p.id === component.activePatternId());
    expect(active!.order).toBe(1);
    expect(component.cards().every((c) => c.patternText === undefined)).toBe(true);
  });

  it('start lifts the topmost pattern card to y=5 before dealing the deck', () => {
    component.addPatternCard();
    component.addPatternCard();
    // move both patterns down so the lift is observable
    component.patternCards.update((cards) => cards.map((c) => ({ ...c, y: c.y + 30 })));
    // stub placeCards so it doesn't push the pattern back down after the lift
    vi.spyOn(component as unknown as { placeCards(cards: TableDeckCard[]): void }, 'placeCards')
      .mockImplementation(() => {});

    component.startFortuneTelling();

    const minY = Math.min(...component.patternCards().map((p) => p.y));
    expect(minY).toBe(5);
  });

  it('pickCard deals the chosen card onto the active pattern slot, flips it, stamps patternText and advances', () => {
    component.addPatternCard(); // order 1
    component.addPatternCard(); // order 2
    component.setPatternText(component.patternCards()[0].id, 'Position 1');
    component.loadDeck(deck([card(1), card(2), card(3)]));
    component.startFortuneTelling();

    const slot1 = component.patternCards().find((p) => p.id === component.activePatternId())!;
    const chosen = component.cards()[0];
    component.pickCard(chosen.id);

    const placed = component.cards().find((c) => c.id === chosen.id)!;
    expect(placed).toMatchObject({ x: slot1.x, y: slot1.y, flipped: true, patternText: '1. Position 1' });
    // it comes to the front
    expect(placed.z!).toBeGreaterThanOrEqual(Math.max(...component.cards().map((c) => c.z ?? 0)));
    // and the next question is now asked
    expect(component.fortuneStepOrder()).toBe(2);
  });

  it('ends when the last pattern card is filled', () => {
    component.addPatternCard(); // order 1
    component.addPatternCard(); // order 2
    component.loadDeck(deck([card(1), card(2), card(3)]));
    component.startFortuneTelling();

    component.pickCard(component.cards()[0].id); // fills order 1 → step 2
    component.pickCard(component.cards()[1].id); // fills order 2 → done
    expect(component.fortuneStepOrder()).toBeNull();
    expect(component.fortuneActive()).toBe(false);
  });

  it('ends when the deck is exhausted before all pattern cards are filled', () => {
    component.addPatternCard(); // order 1
    component.addPatternCard(); // order 2
    component.addPatternCard(); // order 3
    component.loadDeck(deck([card(1), card(2)])); // only two cards
    component.startFortuneTelling();

    component.pickCard(component.cards()[0].id); // step → 2
    component.pickCard(component.cards()[1].id); // deck exhausted → done, order 3 never asked
    expect(component.fortuneStepOrder()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --watch=false -t "fortune-telling"`
Expected: FAIL — `startFortuneTelling`, `pickCard`, `fortuneStepOrder`, `activePatternId`, `fortuneActive` do not exist (type errors).

- [ ] **Step 3: Add the signals and computed values**

In `table.component.ts`, add alongside the other signals (after `selectedCardId`, ~line 38):

```ts
  /** `order` of the pattern card whose question is being asked; null = not running. */
  readonly fortuneStepOrder = signal<number | null>(null);
  readonly fortuneActive = computed(() => this.fortuneStepOrder() !== null);
  readonly activePatternId = computed(() => {
    const step = this.fortuneStepOrder();
    if (step === null) return null;
    return this.patternCards().find((p) => p.order === step)?.id ?? null;
  });
```

- [ ] **Step 4: Add `startFortuneTelling`, `pickCard`, and the private `advanceFortune`**

In `table.component.ts`, add these methods (e.g. after `reloadDeck`):

```ts
  startFortuneTelling(): void {
    this.closeMenus();
    if (this.patternCards().length === 0) return;
    // 1) block the pattern (locks + sends the slots behind the deck cards)
    if (!this.patternsLocked()) this.toggleLockPattern();
    // lift the pattern so its topmost card sits at y = 5
    const minY = this.patternCards().reduce((min, c) => Math.min(min, c.y), Infinity);
    const shift = minY - 5;
    if (shift !== 0) {
      this.patternCards.update((cards) => cards.map((c) => ({ ...c, y: c.y - shift })));
    }
    // 2) re-load the deck (shuffles, deals on top, pushes the pattern below, clears patternText)
    this.placeCards(this.cards());
    // 3) start asking from the first question
    this.fortuneStepOrder.set(1);
  }

  pickCard(id: string): void {
    const step = this.fortuneStepOrder();
    if (step === null) return;
    const target = this.patternCards().find((p) => p.order === step);
    if (!target) return;
    const z = this.nextZ++;
    this.cards.update((cards) =>
      cards.map((c) =>
        c.id === id
          ? { ...c, x: target.x, y: target.y, z, flipped: true, patternText: `${target.order}. ${target.text}` }
          : c
      )
    );
    this.advanceFortune();
  }

  /** Move to the next question, or end when the pattern is finished or the deck is exhausted. */
  private advanceFortune(): void {
    const next = (this.fortuneStepOrder() ?? 0) + 1;
    const maxOrder = this.patternCards().reduce((max, c) => Math.max(max, c.order), 0);
    this.fortuneStepOrder.set(next > maxOrder || next > this.cards().length ? null : next);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- --watch=false -t "fortune-telling"`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts
git commit -m "11: Add fortune-telling orchestration state to TableComponent"
```

---

### Task 3: Click-to-place mode on `table-card`

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `pickMode = input(false)` — when `true`, the card is a click-to-place target.
  - `cardPick = output<void>()` — emitted on pointer-down while `pickMode` is `true`, in place of select/drag.

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe('TableCardComponent', ...)` in `table-card.component.spec.ts`:

```ts
it('in pickMode, pointerdown emits cardPick and does not select or drag', () => {
  fixture.componentRef.setInput('pickMode', true);
  fixture.detectChanges();
  const picked = vi.fn();
  const selected = vi.fn();
  const moved = vi.fn();
  fixture.componentInstance.cardPick.subscribe(picked);
  fixture.componentInstance.cardSelect.subscribe(selected);
  fixture.componentInstance.cardMove.subscribe(moved);
  root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
  root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
  expect(picked).toHaveBeenCalledTimes(1);
  expect(selected).not.toHaveBeenCalled();
  expect(moved).not.toHaveBeenCalled();
});

it('without pickMode, pointerdown still selects (no cardPick)', () => {
  const picked = vi.fn();
  const selected = vi.fn();
  fixture.componentInstance.cardPick.subscribe(picked);
  fixture.componentInstance.cardSelect.subscribe(selected);
  root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
  expect(picked).not.toHaveBeenCalled();
  expect(selected).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --watch=false -t "pickMode"`
Expected: FAIL — `pickMode` input and `cardPick` output do not exist (type errors).

- [ ] **Step 3: Add the input, output, and the early return in `onPointerDown`**

In `table-card.component.ts`, add next to the other inputs/outputs:

```ts
  readonly pickMode = input(false);
```
```ts
  readonly cardPick = output<void>();
```

Then make `onPointerDown` short-circuit in pick mode (add at the very top of the method):

```ts
  onPointerDown(event: PointerEvent): void {
    if (this.pickMode()) {
      this.cardPick.emit();
      return;
    }
    this.cardSelect.emit();
    // ...existing drag-start code unchanged...
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --watch=false -t "pickMode"`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts
git commit -m "11: Add click-to-place pickMode to table-card"
```

---

### Task 4: Active-question glow on `table-pattern-card`

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.html`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.css`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `active = input(false)` — drives the `.active` class (bright glow) on the root.
  - `dimmed = input(false)` — drives the `.dimmed` class (lowered opacity) on the root.

- [ ] **Step 1: Write the failing tests**

Add these tests in `table-pattern-card.component.spec.ts` (the `setup` helper only sets `card`/`widthPercent`/`tableWidthPx`/`selected`, so set the new inputs directly via `fixture.componentRef.setInput`):

```ts
it('applies the active class when active and the dimmed class when dimmed', async () => {
  await setup();
  expect(root().classList.contains('active')).toBe(false);
  expect(root().classList.contains('dimmed')).toBe(false);

  fixture.componentRef.setInput('active', true);
  fixture.detectChanges();
  expect(root().classList.contains('active')).toBe(true);

  fixture.componentRef.setInput('active', false);
  fixture.componentRef.setInput('dimmed', true);
  fixture.detectChanges();
  expect(root().classList.contains('dimmed')).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watch=false -t "active class when active"`
Expected: FAIL — `active`/`dimmed` inputs do not exist (type errors).

- [ ] **Step 3: Add the inputs**

In `table-pattern-card.component.ts`, add next to the other inputs:

```ts
  readonly active = input(false);
  readonly dimmed = input(false);
```

- [ ] **Step 4: Bind the classes in the template**

In `table-pattern-card.component.html`, add the two class bindings to the root `.table-pattern-card` div (next to the existing `[class.selected]`/`[class.locked]`):

```html
  [class.active]="active()"
  [class.dimmed]="dimmed()"
```

- [ ] **Step 5: Add the styles**

Append to `table-pattern-card.component.css`:

```css
.table-pattern-card.dimmed {
  opacity: 0.4;
}

.table-pattern-card.active {
  opacity: 1;
}

.table-pattern-card.active .pattern-face {
  border-color: #ffd76a;
  box-shadow:
    0 0 0 3px rgba(255, 215, 106, 0.9),
    0 0 18px 6px rgba(255, 215, 106, 0.6);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- --watch=false -t "active class when active"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table-pattern-card/
git commit -m "11: Add active-question glow and dimmed state to table-pattern-card"
```

---

### Task 5: Wire the process into the table template and menus

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.html`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `fortuneActive`, `activePatternId`, `pickCard`, `startFortuneTelling` (Task 2); `pickMode`/`cardPick` (Task 3); `active`/`dimmed` (Task 4).
- Produces: user-facing behavior — a "Start fortune-telling" menu item, disabled Deck/Pattern menu buttons while running, click-to-place deck cards, and the glowing active pattern card.

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe('TableComponent', ...)` in `table.component.spec.ts` (reuse the existing `openMenu`, `deck`, `card` helpers):

```ts
it('the Pattern menu starts fortune-telling and the item is disabled with no pattern cards', () => {
  component.cards.set([]);
  fixture.detectChanges();
  openMenu('.pattern-menu-btn');
  const startItem = fixture.nativeElement.querySelector('.start-fortune-item') as HTMLButtonElement;
  expect(startItem.disabled).toBe(true); // no pattern cards yet
  component.closeMenus();
  fixture.detectChanges();

  component.addPatternCard();
  component.loadDeck(deck([card(1), card(2)]));
  openMenu('.pattern-menu-btn');
  (fixture.nativeElement.querySelector('.start-fortune-item') as HTMLButtonElement).click();
  expect(component.fortuneActive()).toBe(true);
});

it('blocks the Deck and Pattern menu buttons while fortune-telling is active', () => {
  component.addPatternCard();
  component.loadDeck(deck([card(1), card(2)]));
  component.startFortuneTelling();
  fixture.detectChanges();
  expect((fixture.nativeElement.querySelector('.deck-menu-btn') as HTMLButtonElement).disabled).toBe(true);
  expect((fixture.nativeElement.querySelector('.pattern-menu-btn') as HTMLButtonElement).disabled).toBe(true);
});

it('a face-down deck card is click-to-place while active and places onto the active slot', () => {
  vi.spyOn(component as unknown as { shuffle(items: TableDeckCard[]): TableDeckCard[] }, 'shuffle')
    .mockImplementation((items) => items);
  component.addPatternCard();
  component.setPatternText(component.patternCards()[0].id, 'Position 1');
  component.loadDeck(deck([card(1), card(2)]));
  component.startFortuneTelling();
  fixture.detectChanges();

  // the first table-card is in pick mode; a pointerdown places it (no drag)
  const firstCardEl = fixture.nativeElement.querySelector('table-card .table-card') as HTMLElement;
  firstCardEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
  const placed = component.cards().find((c) => c.patternText === '1. Position 1');
  expect(placed).toBeDefined();
  expect(placed!.flipped).toBe(true);
});

it('marks the active pattern card and dims the rest while running', () => {
  component.addPatternCard(); // order 1
  component.addPatternCard(); // order 2
  component.loadDeck(deck([card(1), card(2)]));
  component.startFortuneTelling();
  fixture.detectChanges();
  const patternEls = fixture.nativeElement.querySelectorAll('table-pattern-card .table-pattern-card');
  const activeCount = Array.from(patternEls).filter((el: Element) => el.classList.contains('active')).length;
  const dimmedCount = Array.from(patternEls).filter((el: Element) => el.classList.contains('dimmed')).length;
  expect(activeCount).toBe(1);
  expect(dimmedCount).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --watch=false -t "fortune"`
Expected: FAIL — `.start-fortune-item` does not exist; the menu buttons are not disabled; deck cards are not in pick mode; pattern cards have no `active`/`dimmed` classes.

- [ ] **Step 3: Add the "Start fortune-telling" menu item**

In `table.component.html`, inside the Pattern `.dropdown-panel` (after the lock item, ~line 76), add:

```html
          <button class="dropdown-item start-fortune-item" type="button" [disabled]="patternCards().length === 0" (click)="closeMenus(); startFortuneTelling()">
            Start fortune-telling
          </button>
```

- [ ] **Step 4: Disable the Deck and Pattern menu buttons while active**

In `table.component.html`, add `[disabled]="fortuneActive()"` to both dropdown buttons:

```html
      <button
        class="dropdown-btn deck-menu-btn"
        type="button"
        aria-haspopup="menu"
        [attr.aria-expanded]="deckMenuOpen()"
        [disabled]="fortuneActive()"
        (click)="toggleDeckMenu()"
        (keydown.escape)="closeMenus()"
      >Deck ▾</button>
```

```html
      <button
        class="dropdown-btn pattern-menu-btn"
        type="button"
        aria-haspopup="menu"
        [attr.aria-expanded]="patternMenuOpen()"
        [disabled]="fortuneActive()"
        (click)="togglePatternMenu()"
        (keydown.escape)="closeMenus()"
      >Pattern ▾</button>
```

- [ ] **Step 5: Wire `pickMode`/`cardPick` on `table-card`**

In `table.component.html`, update the `<table-card>` element in the `@for (card of cards(); ...)` loop to add the two bindings:

```html
      <table-card
        [card]="card"
        [widthPercent]="cardSizePercent()"
        [tableWidthPx]="tableWidthPx()"
        [selected]="selectedCardId() === card.id"
        [pickMode]="fortuneActive() && !card.patternText"
        (cardSelect)="selectCard(card.id)"
        (cardFlip)="flipCard(card.id)"
        (cardMove)="moveCard(card.id, $event)"
        (cardRotate)="rotateCard(card.id, $event)"
        (cardInfo)="openCardInfo(card.id)"
        (cardPick)="pickCard(card.id)"
      />
```

- [ ] **Step 6: Wire `active`/`dimmed` on `table-pattern-card`**

In `table.component.html`, update the `<table-pattern-card>` element in the `@for (pattern of patternCards(); ...)` loop to add the two bindings:

```html
      <table-pattern-card
        [card]="pattern"
        [widthPercent]="cardSizePercent()"
        [tableWidthPx]="tableWidthPx()"
        [selected]="selectedCardId() === pattern.id"
        [active]="activePatternId() === pattern.id"
        [dimmed]="fortuneActive() && activePatternId() !== pattern.id"
        (cardSelect)="selectCard(pattern.id)"
        (cardMove)="movePatternCard(pattern.id, $event)"
        (cardRotate)="rotatePatternCard(pattern.id, $event)"
        (textChange)="setPatternText(pattern.id, $event)"
      />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- --watch=false -t "fortune"`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `npm test -- --watch=false`
Expected: PASS — all specs green (a type error in any spec fails the whole bundle).

- [ ] **Step 9: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.html fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts
git commit -m "11: Wire the fortune-telling process into the table template and menus"
```

---

## Notes for the implementer

- The four tests in Task 2's `describe('fortune-telling', ...)` set `tableWidthPx`/`tableHeightPercent` so `placeCards` geometry is stable; keep the `shuffle` spy (identity) so `component.cards()[0]` is a predictable card.
- `pickMode` is bound as `fortuneActive() && !card.patternText`, so already-placed cards (which carry a `patternText`) fall back to normal drag/select behavior — this is intentional (the reader can tidy the spread).
- No backend changes; verify the server still builds only if you touched shared types (you did not).
