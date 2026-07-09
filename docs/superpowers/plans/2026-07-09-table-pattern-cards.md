# Table Pattern Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single table card type into two kinds — deck cards (flippable, as today) and pattern cards (text + order number, lockable, no flip) — modelled as a discriminated union and rendered from two independent signals.

**Architecture:** `TableCardState` becomes a `kind`-discriminated union (`TableDeckCard | TablePatternCard`) sharing a geometry base. The existing `table-card` component is retyped to the deck kind unchanged; a new `table-pattern-card` component owns its own pointer logic (drag + rotate, no flip) and respects a `locked` flag. `TableComponent` holds `cards` and `patternCards` as separate signals, renders patterns behind deck cards, and gains "Add pattern card" / "Lock pattern" controls.

**Tech Stack:** Angular 21 (standalone components, signals, zoneless), TypeScript strict mode, Vitest (`@angular/build` builder).

## Global Constraints

- All state updates are **immutable** — use object spreads inside `signal.update()`, never mutate in place.
- Components in `TableFortuneTelling/` are **standalone**; register them in `TestBed` via `imports:`.
- Geometry unit is **% of table width** for x, y, and width; card aspect ratio is **2 / 3** (height = width × 1.5).
- TypeScript strict mode is on; specs compile as **one bundle**, so any type error in any spec fails the whole run.
- Model import path from `components/TableFortuneTelling/<dir>/` files is **`../../../models/table`** (three levels).
- Verification command (run from `fortunecards.client/`): `npx ng test --watch=false`.

---

## File Structure

- `src/app/models/table.ts` — the discriminated-union model (modified).
- `src/app/components/TableFortuneTelling/table-card/` — existing deck-card component (retyped only).
- `src/app/components/TableFortuneTelling/table-pattern-card/` — new pattern-card component (`.ts`, `.html`, `.css`, `.spec.ts`).
- `src/app/components/TableFortuneTelling/table/` — host component: two signals, handlers, controls (modified).
- Three unrelated spec files with stale imports repaired in Task 0.

---

## Task 0: Repair stale spec import paths (green baseline)

The `11: Components organizing` commit moved components into subfolders but left three spec files importing from old relative paths. All specs share one compile bundle, so this currently fails the entire `ng test` run. Fix before anything else.

**Files:**
- Modify: `src/app/components/Cards/drawn-card/drawn-card.component.spec.ts:9-10`
- Modify: `src/app/components/Deck/deck-detail/deck-detail.component.spec.ts:9-10`
- Modify: `src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts:4`

**Interfaces:**
- Consumes: nothing.
- Produces: a green baseline (`ng test` compiles and passes) for later tasks.

- [ ] **Step 1: Run the test suite to confirm the baseline is red**

Run (from `fortunecards.client/`): `npx ng test --watch=false`
Expected: FAIL — `TS2307: Cannot find module` errors in `drawn-card.component.spec.ts`, `deck-detail.component.spec.ts`, and `table-card.component.spec.ts`.

- [ ] **Step 2: Fix `drawn-card.component.spec.ts` imports**

Change lines 9-10 from:
```ts
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';
```
to:
```ts
import { Deck } from '../../../models/deck';
import { Card } from '../../../models/card';
```

- [ ] **Step 3: Fix `deck-detail.component.spec.ts` imports**

Change lines 9-10 from:
```ts
import { NavigationBar } from '../navigation-bar/navigation-bar';
import { Deck } from '../../models/deck';
```
to:
```ts
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { Deck } from '../../../models/deck';
```

- [ ] **Step 4: Fix `table-card.component.spec.ts` import**

Change line 4 from:
```ts
import { TableCardState } from '../../models/table';
```
to:
```ts
import { TableCardState } from '../../../models/table';
```

- [ ] **Step 5: Run the test suite to confirm green**

Run: `npx ng test --watch=false`
Expected: PASS — all specs compile and pass. (No module-resolution errors.)

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Cards/drawn-card/drawn-card.component.spec.ts \
        src/app/components/Deck/deck-detail/deck-detail.component.spec.ts \
        src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts
git commit -m "11: Fix stale spec import paths after component reorg"
```

---

## Task 1: Discriminated-union model + migrate the deck card

Replace the flat `TableCardState` with the union and update every consumer so the project compiles and existing behavior is unchanged.

**Files:**
- Modify: `src/app/models/table.ts`
- Modify: `src/app/components/TableFortuneTelling/table-card/table-card.component.ts:2,11`
- Modify: `src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts:4,9`
- Modify: `src/app/components/TableFortuneTelling/table/table.component.ts:5,31`
- Modify: `src/app/components/TableFortuneTelling/table/table.component.spec.ts:31`

**Interfaces:**
- Consumes: green baseline from Task 0.
- Produces:
  - `interface TableDeckCard { kind: 'deck'; id: string; x: number; y: number; rotation: number; flipped: boolean; patternId?: string }`
  - `interface TablePatternCard { kind: 'pattern'; id: string; x: number; y: number; rotation: number; text: string; order: number; locked: boolean }`
  - `type TableItem = TableDeckCard | TablePatternCard`
  - `type TableColor` unchanged.
  - `TableCardState` is **removed**.

- [ ] **Step 1: Update the existing deck-card spec to the new type (failing test)**

In `table-card.component.spec.ts`, change the import on line 4 and the `baseCard` declaration on line 9:
```ts
import { TableDeckCard } from '../../../models/table';
```
```ts
const baseCard: TableDeckCard = { kind: 'deck', id: 'c1', x: 10, y: 20, rotation: 0, flipped: false };
```

- [ ] **Step 2: Update the host spec's seed-card expectation (failing test)**

In `table.component.spec.ts`, change the assertion on line 31 from:
```ts
expect(component.cards()).toEqual([{ id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
```
to:
```ts
expect(component.cards()).toEqual([{ kind: 'deck', id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx ng test --watch=false`
Expected: FAIL — type errors (`TableDeckCard` not exported) and/or the seed-card `toEqual` mismatch.

- [ ] **Step 4: Rewrite the model**

Replace the entire contents of `src/app/models/table.ts` with:
```ts
export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

interface TableItemBase {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps all geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
}

export interface TableDeckCard extends TableItemBase {
  kind: 'deck';
  /** false = back face up (default), true = front face up. */
  flipped: boolean;
  /** Reserved for the deferred manual-pick link to a pattern slot; unused for now. */
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

- [ ] **Step 5: Retype the deck-card component**

In `table-card.component.ts`, change line 2 and line 11:
```ts
import { TableDeckCard } from '../../../models/table';
```
```ts
  readonly card = input.required<TableDeckCard>();
```

- [ ] **Step 6: Retype the host signal and add `kind` to the seed card**

In `table.component.ts`, change line 5 and line 31:
```ts
import { TableDeckCard, TableColor } from '../../../models/table';
```
```ts
  readonly cards = signal<TableDeckCard[]>([{ kind: 'deck', id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx ng test --watch=false`
Expected: PASS — all existing specs green with the new types.

- [ ] **Step 8: Commit**

```bash
git add src/app/models/table.ts \
        src/app/components/TableFortuneTelling/table-card/table-card.component.ts \
        src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts \
        src/app/components/TableFortuneTelling/table/table.component.ts \
        src/app/components/TableFortuneTelling/table/table.component.spec.ts
git commit -m "11: Model table cards as a discriminated union"
```

---

## Task 2: `table-pattern-card` component

A standalone component that renders a pattern card's order + editable text, supports drag and rotate via its own pointer handlers, has no flip, and ignores all interaction when `locked`.

**Files:**
- Create: `src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.ts`
- Create: `src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.html`
- Create: `src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.css`
- Test: `src/app/components/TableFortuneTelling/table-pattern-card/table-pattern-card.component.spec.ts`

**Interfaces:**
- Consumes: `TablePatternCard` from `models/table` (Task 1).
- Produces `TablePatternCardComponent` with:
  - Inputs: `card: TablePatternCard` (required), `widthPercent: number` (required), `tableWidthPx: number` (required), `selected: boolean` (default `false`).
  - Outputs: `cardSelect: void`, `cardMove: { x: number; y: number }`, `cardRotate: number`, `textChange: string`. **No `cardFlip`.**
  - Root element class `.table-pattern-card`; rotate handle class `.rotate-handle`; text field class `.pattern-text`; order field class `.pattern-order`.

- [ ] **Step 1: Write the failing spec**

Create `table-pattern-card.component.spec.ts`:
```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TablePatternCardComponent } from './table-pattern-card.component';
import { TablePatternCard } from '../../../models/table';

describe('TablePatternCardComponent', () => {
  let fixture: ComponentFixture<TablePatternCardComponent>;

  const baseCard: TablePatternCard = {
    kind: 'pattern', id: 'p1', x: 10, y: 20, rotation: 0, text: 'Past', order: 1, locked: false,
  };

  async function setup(card: TablePatternCard = baseCard, selected = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TablePatternCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TablePatternCardComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement.querySelector('.table-pattern-card');
  }

  it('renders the order number and text, and never a flip face', async () => {
    await setup();
    expect(root().querySelector('.pattern-order')!.textContent).toContain('1');
    expect((root().querySelector('.pattern-text') as HTMLInputElement).value).toBe('Past');
    expect(root().querySelector('.face')).toBeNull();
  });

  it('has no cardFlip output', async () => {
    await setup();
    expect('cardFlip' in fixture.componentInstance).toBe(false);
  });

  it('derives pixel position and size from % of table width', async () => {
    await setup();
    expect(root().style.left).toBe('100px');
    expect(root().style.top).toBe('200px');
    expect(root().style.width).toBe('200px');
  });

  it('emits cardSelect on pointerdown and cardMove on drag', async () => {
    await setup();
    const selected = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(selected).toHaveBeenCalledTimes(1);
    // +100px/1000px = +10%, +50px = +5%; card starts at x=10, y=20.
    expect(moved).toHaveBeenCalledWith({ x: 20, y: 25 });
  });

  it('emits textChange when the text field is edited', async () => {
    await setup();
    const changed = vi.fn();
    fixture.componentInstance.textChange.subscribe(changed);
    const input = root().querySelector('.pattern-text') as HTMLInputElement;
    input.value = 'Future';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledWith('Future');
  });

  it('emits cardRotate while dragging the rotate handle when selected', async () => {
    await setup(baseCard, true);
    const rotated = vi.fn();
    fixture.componentInstance.cardRotate.subscribe(rotated);
    vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400, x: 100, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    const handle = root().querySelector('.rotate-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 350 }));
    expect(rotated).toHaveBeenCalledWith(90);
  });

  it('when locked: no rotate handle, no cardSelect, no cardMove', async () => {
    await setup({ ...baseCard, locked: true }, true);
    const selected = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    fixture.componentInstance.cardMove.subscribe(moved);
    expect(root().querySelector('.rotate-handle')).toBeNull();
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(selected).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx ng test --watch=false`
Expected: FAIL — `Cannot find module './table-pattern-card.component'`.

- [ ] **Step 3: Create the component class**

Create `table-pattern-card.component.ts`:
```ts
import { Component, computed, input, output } from '@angular/core';
import { TablePatternCard } from '../../../models/table';

@Component({
  selector: 'table-pattern-card',
  standalone: true,
  templateUrl: './table-pattern-card.component.html',
  styleUrl: './table-pattern-card.component.css',
})
export class TablePatternCardComponent {
  readonly card = input.required<TablePatternCard>();
  /** Card width as % of table width. */
  readonly widthPercent = input.required<number>();
  readonly tableWidthPx = input.required<number>();
  readonly selected = input(false);

  readonly cardSelect = output<void>();
  /** New top-left in % of table width; parent is responsible for clamping. */
  readonly cardMove = output<{ x: number; y: number }>();
  /** New absolute rotation in degrees; parent is responsible for normalizing. */
  readonly cardRotate = output<number>();
  readonly textChange = output<string>();

  readonly leftPx = computed(() => (this.card().x / 100) * this.tableWidthPx());
  readonly topPx = computed(() => (this.card().y / 100) * this.tableWidthPx());
  readonly widthPx = computed(() => (this.widthPercent() / 100) * this.tableWidthPx());

  private dragging = false;
  private rotating = false;
  private startPointerX = 0;
  private startPointerY = 0;
  private startCardX = 0;
  private startCardY = 0;
  private centerX = 0;
  private centerY = 0;
  private startAngle = 0;
  private startRotation = 0;

  onPointerDown(event: PointerEvent): void {
    if (this.card().locked) return;
    this.cardSelect.emit();
    this.dragging = true;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.startCardX = this.card().x;
    this.startCardY = this.card().y;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.card().locked) return;
    if (this.rotating) {
      this.cardRotate.emit(this.startRotation + (this.pointerAngle(event) - this.startAngle));
      return;
    }
    if (!this.dragging) return;
    const width = this.tableWidthPx();
    if (width <= 0) return;
    const dx = ((event.clientX - this.startPointerX) / width) * 100;
    const dy = ((event.clientY - this.startPointerY) / width) * 100;
    this.cardMove.emit({ x: this.startCardX + dx, y: this.startCardY + dy });
  }

  onPointerUp(): void {
    this.dragging = false;
    this.rotating = false;
  }

  onRotateStart(event: PointerEvent): void {
    if (this.card().locked) return;
    event.stopPropagation();
    this.rotating = true;
    this.dragging = false;
    const rect = (event.currentTarget as HTMLElement).closest('.table-pattern-card')!.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.startAngle = this.pointerAngle(event);
    this.startRotation = this.card().rotation;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  private pointerAngle(event: PointerEvent): number {
    return (Math.atan2(event.clientY - this.centerY, event.clientX - this.centerX) * 180) / Math.PI;
  }
}
```

- [ ] **Step 4: Create the template**

Create `table-pattern-card.component.html`:
```html
<div
  class="table-pattern-card"
  [class.selected]="selected()"
  [class.locked]="card().locked"
  [style.left.px]="leftPx()"
  [style.top.px]="topPx()"
  [style.width.px]="widthPx()"
  [style.transform]="'rotate(' + card().rotation + 'deg)'"
  (pointerdown)="onPointerDown($event)"
  (pointermove)="onPointerMove($event)"
  (pointerup)="onPointerUp()"
  (pointercancel)="onPointerUp()"
>
  <div class="pattern-face">
    <span class="pattern-order">{{ card().order }}</span>
    <input
      class="pattern-text"
      [value]="card().text"
      [disabled]="card().locked"
      (pointerdown)="$event.stopPropagation()"
      (input)="textChange.emit($any($event.target).value)"
    />
  </div>
  @if (selected() && !card().locked) {
    <div class="rotate-handle" title="Drag to rotate" (pointerdown)="onRotateStart($event)">⤾</div>
  }
</div>
```

- [ ] **Step 5: Create the styles**

Create `table-pattern-card.component.css`:
```css
:host {
  display: contents;
}

.table-pattern-card {
  position: absolute;
  aspect-ratio: 2 / 3;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.pattern-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 2px dashed #8a8a8a;
  background: rgba(255, 255, 255, 0.35);
  color: #333;
  box-sizing: border-box;
}

.pattern-order {
  font-weight: 700;
  font-size: 1.5em;
  opacity: 0.7;
}

.pattern-text {
  width: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-family: inherit;
  font-size: 1em;
  color: inherit;
}

.pattern-text:disabled {
  color: inherit;
  opacity: 1;
}

.table-pattern-card.locked {
  cursor: default;
}

.table-pattern-card.locked .pattern-face {
  border-style: solid;
}

.table-pattern-card.selected .pattern-face {
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.85),
    0 0 14px 4px rgba(255, 255, 255, 0.55);
}

.rotate-handle {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  font-size: 14px;
}
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `npx ng test --watch=false`
Expected: PASS — all `TablePatternCardComponent` tests green, existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/TableFortuneTelling/table-pattern-card/
git commit -m "11: Add table-pattern-card component"
```

---

## Task 3: Integrate pattern cards into the table host

Add the `patternCards` signal, parallel move/rotate/text handlers, "Add pattern card" and "Lock pattern" controls, and render pattern cards behind deck cards.

**Files:**
- Modify: `src/app/components/TableFortuneTelling/table/table.component.ts`
- Modify: `src/app/components/TableFortuneTelling/table/table.component.html`
- Modify: `src/app/components/TableFortuneTelling/table/table.component.css`
- Modify: `src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `TablePatternCardComponent` (Task 2); `TableDeckCard`, `TablePatternCard` (Task 1).
- Produces on `TableComponent`:
  - `patternCards: WritableSignal<TablePatternCard[]>` (starts `[]`).
  - `patternsLocked: WritableSignal<boolean>` (starts `false`).
  - `addPatternCard(): void`, `toggleLockPattern(): void`.
  - `movePatternCard(id: string, pos: { x: number; y: number }): void`, `rotatePatternCard(id: string, rotation: number): void`, `setPatternText(id: string, text: string): void`.

- [ ] **Step 1: Write the failing host tests**

Append these tests inside the `describe('TableComponent', …)` block in `table.component.spec.ts` (before the closing `});`):
```ts
  it('starts with no pattern cards and unlocked', () => {
    expect(component.patternCards()).toEqual([]);
    expect(component.patternsLocked()).toBe(false);
  });

  it('addPatternCard appends cards with incrementing order', () => {
    component.addPatternCard();
    component.addPatternCard();
    const patterns = component.patternCards();
    expect(patterns.length).toBe(2);
    expect(patterns.map((p) => p.order)).toEqual([1, 2]);
    expect(patterns.every((p) => p.kind === 'pattern' && !p.locked)).toBe(true);
  });

  it('toggleLockPattern locks then unlocks all pattern cards', () => {
    component.addPatternCard();
    component.addPatternCard();
    component.toggleLockPattern();
    expect(component.patternsLocked()).toBe(true);
    expect(component.patternCards().every((p) => p.locked)).toBe(true);
    component.toggleLockPattern();
    expect(component.patternsLocked()).toBe(false);
    expect(component.patternCards().every((p) => !p.locked)).toBe(true);
  });

  it('movePatternCard clamps inside the table and is a no-op when locked', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.movePatternCard(id, { x: 95, y: 95 }); // clamp to maxX=80, maxY=30
    expect(component.patternCards()[0]).toMatchObject({ x: 80, y: 30 });
    component.toggleLockPattern();
    component.movePatternCard(id, { x: 0, y: 0 });
    expect(component.patternCards()[0]).toMatchObject({ x: 80, y: 30 }); // unchanged
  });

  it('rotatePatternCard normalizes and is a no-op when locked', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.rotatePatternCard(id, 370);
    expect(component.patternCards()[0].rotation).toBe(10);
    component.toggleLockPattern();
    component.rotatePatternCard(id, 90);
    expect(component.patternCards()[0].rotation).toBe(10); // unchanged
  });

  it('setPatternText updates the pattern text', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.setPatternText(id, 'Present');
    expect(component.patternCards()[0].text).toBe('Present');
  });

  it('minHeightPercent accounts for pattern cards too', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.movePatternCard(id, { x: 0, y: 50 }); // pattern bottom = 50 + 30 = 80 → min 85
    expect(component.minHeightPercent()).toBe(85);
  });

  it('R+arrows rotate a selected pattern card, but not when locked', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.selectCard(id);
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.patternCards()[0].rotation).toBe(1);
    component.toggleLockPattern();
    key('keydown', 'ArrowRight');
    expect(component.patternCards()[0].rotation).toBe(1); // unchanged while locked
  });

  it('the Add pattern card and Lock pattern buttons drive the signals', () => {
    (fixture.nativeElement.querySelector('.add-pattern-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.patternCards().length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('table-pattern-card').length).toBe(1);
    (fixture.nativeElement.querySelector('.lock-pattern-btn') as HTMLElement).click();
    expect(component.patternsLocked()).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --watch=false`
Expected: FAIL — `component.patternCards is not a function` / template has no `.add-pattern-btn`.

- [ ] **Step 3: Extend the host component class**

In `table.component.ts`:

Update the model import (line 5) and add the pattern-card component import (after line 4):
```ts
import { TablePatternCardComponent } from '../table-pattern-card/table-pattern-card.component';
import { TableDeckCard, TablePatternCard, TableColor } from '../../../models/table';
```

Add `TablePatternCardComponent` to the `imports:` array in the `@Component` decorator:
```ts
  imports: [NavigationBar, TableCardComponent, TablePatternCardComponent, TableSettingsDialogComponent],
```

Add the new signals after the `cards` signal (line 31):
```ts
  readonly patternCards = signal<TablePatternCard[]>([]);
  readonly patternsLocked = signal(false);
```

Replace `minHeightPercent` (lines 41-45) so it spans both arrays:
```ts
  readonly minHeightPercent = computed(() => {
    const cardHeight = this.cardSizePercent() * 1.5;
    const lowestBottom = [...this.cards(), ...this.patternCards()].reduce(
      (max, c) => Math.max(max, c.y + cardHeight),
      0
    );
    return lowestBottom + 5;
  });
```

Add the pattern handlers (place them after `rotateCard`, before `increaseHeight`):
```ts
  addPatternCard(): void {
    this.patternCards.update((cards) => {
      const order = cards.length + 1;
      return [
        ...cards,
        {
          kind: 'pattern' as const,
          id: `pattern-${order}`,
          x: 0,
          y: 0,
          rotation: 0,
          text: `Position ${order}`,
          order,
          locked: this.patternsLocked(),
        },
      ];
    });
    this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
  }

  toggleLockPattern(): void {
    const locked = !this.patternsLocked();
    this.patternsLocked.set(locked);
    this.patternCards.update((cards) => cards.map((c) => ({ ...c, locked })));
  }

  movePatternCard(id: string, pos: { x: number; y: number }): void {
    const cardHeight = this.cardSizePercent() * 1.5;
    const maxX = Math.max(0, 100 - this.cardSizePercent());
    const maxY = Math.max(0, this.tableHeightPercent() - cardHeight);
    const x = Math.min(maxX, Math.max(0, pos.x));
    const y = Math.min(maxY, Math.max(0, pos.y));
    this.patternCards.update((cards) =>
      cards.map((c) => (c.id === id && !c.locked ? { ...c, x, y } : c))
    );
  }

  rotatePatternCard(id: string, rotation: number): void {
    const normalized = ((rotation % 360) + 360) % 360;
    this.patternCards.update((cards) =>
      cards.map((c) => (c.id === id && !c.locked ? { ...c, rotation: normalized } : c))
    );
  }

  setPatternText(id: string, text: string): void {
    this.patternCards.update((cards) => cards.map((c) => (c.id === id ? { ...c, text } : c)));
  }
```

Update `onKeyDown` so the R+arrow branch (lines 112-120) looks up the selected id in both arrays:
```ts
    if (!this.rotateKeyHeld) return;
    const id = this.selectedCardId();
    if (!id) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const deck = this.cards().find((c) => c.id === id);
      if (deck) {
        this.rotateCard(id, deck.rotation + delta);
        return;
      }
      const pattern = this.patternCards().find((c) => c.id === id);
      if (pattern) this.rotatePatternCard(id, pattern.rotation + delta);
    }
```

- [ ] **Step 4: Render pattern cards and controls in the template**

In `table.component.html`, add the pattern `@for` block **before** the existing `card` block (so patterns paint behind), i.e. immediately after line 9 (`>`):
```html
  @for (pattern of patternCards(); track pattern.id) {
    <table-pattern-card
      [card]="pattern"
      [widthPercent]="cardSizePercent()"
      [tableWidthPx]="tableWidthPx()"
      [selected]="selectedCardId() === pattern.id"
      (cardSelect)="selectCard(pattern.id)"
      (cardMove)="movePatternCard(pattern.id, $event)"
      (cardRotate)="rotatePatternCard(pattern.id, $event)"
      (textChange)="setPatternText(pattern.id, $event)"
    />
  }
```

Add the controls block after the `height-controls` div (after line 26):
```html
  <div class="pattern-controls">
    <button class="add-pattern-btn" type="button" (click)="addPatternCard()">Add pattern card</button>
    <button class="lock-pattern-btn" type="button" (click)="toggleLockPattern()">
      {{ patternsLocked() ? 'Unlock pattern' : 'Lock pattern' }}
    </button>
  </div>
```

- [ ] **Step 5: Style the controls**

Append to `table.component.css`:
```css
.pattern-controls {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 8px;
}

.pattern-controls button {
  border: none;
  border-radius: 18px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx ng test --watch=false`
Expected: PASS — all host tests (existing + new) green.

- [ ] **Step 7: Verify the production build compiles**

Run: `npx ng build`
Expected: build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/TableFortuneTelling/table/
git commit -m "11: Render and manage pattern cards on the table"
```

---

## Self-Review

**Spec coverage:**
- Discriminated-union model (`TableDeckCard`, `TablePatternCard`, `TableItem`) → Task 1. ✅
- Deck card retyped, behavior unchanged → Task 1. ✅
- New `table-pattern-card` (text + order, lockable, drag/rotate, no flip) → Task 2. ✅
- Two independent signals, patterns rendered behind → Task 3 (Steps 3-4). ✅
- Parallel move/rotate handlers guarded by `locked`; flip stays deck-only → Task 3. ✅
- Single `selectedCardId`, keyboard rotate across both arrays → Task 3 (Step 3). ✅
- `minHeightPercent` across both arrays → Task 3 (Step 3). ✅
- "Add pattern card" + "Lock pattern" controls → Task 3 (Steps 4-5). ✅
- Seed test card unchanged apart from `kind: 'deck'`; `patternId` reserved/unused → Task 1. ✅
- Inline-editable text: implemented via a `textChange` output + `setPatternText` (spec named the feature; this is the mechanism). ✅
- Pre-existing broken baseline blocking TDD → Task 0. ✅ (out of original spec scope but required to build).

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All code steps contain full code. ✅

**Type consistency:** `TableDeckCard`/`TablePatternCard`/`TableItem` names match across Tasks 1-3. Handler names (`addPatternCard`, `toggleLockPattern`, `movePatternCard`, `rotatePatternCard`, `setPatternText`) match between the interfaces block, the class code, the template wiring, and the tests. Component outputs (`cardSelect`, `cardMove`, `cardRotate`, `textChange`) match between component, template, and spec. ✅
