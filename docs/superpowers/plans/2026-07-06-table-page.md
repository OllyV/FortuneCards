# Table Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/table` page with a resizable play surface where a test card can be selected, moved, rotated, and flipped; table color and card size configurable via a settings dialog.

**Architecture:** Three new standalone Angular components (`TableComponent` page, `TableCardComponent`, `TableSettingsDialogComponent`) plus a model file. All geometry (card x/y, card width, table height) is stored in **% of table width**; a `ResizeObserver` keeps a `tableWidthPx` signal and pixel values are derived, so window resize rescales everything automatically. Interactions are custom pointer events — no drag library.

**Tech Stack:** Angular 21 (standalone components, `signal()`/`input()`/`output()`, zoneless), TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-table-page-design.md`

## Global Constraints

- Frontend root: `fortunecards.client/` — all paths below are relative to repo root.
- TypeScript **strict mode** is on; all specs compile as **one bundle** — a type error in any spec fails the whole test run.
- Test runner is **Vitest** via `ng test` (NOT Karma/Jasmine): use `describe`/`it`/`expect`, `vi.fn()`, `vi.spyOn()`. `vi` is a global — no import needed (matches existing specs, e.g. `main-menu.spec.ts`).
- Standalone components are registered in TestBed via `imports:` (never `declarations:`).
- Zoneless change detection: every TestBed must provide `provideZonelessChangeDetection()`.
- Test command (PowerShell, from repo root): `cd fortunecards.client; ng test --watch=false` — runs the whole suite every time; there is no per-file filter in use.
- No backend changes in this plan; `dotnet build` is not required.
- Table colors: `'beige' | 'pink' | 'yellow' | 'dark-red'`, default `'beige'`. Card size: % of table width, min 5, max 80, default 20. Card aspect ratio 2/3 (height = width × 1.5).

---

### Task 1: Table model + TableCardComponent rendering

**Files:**
- Create: `fortunecards.client/src/app/models/table.ts`
- Create: `fortunecards.client/src/app/components/table-card/table-card.component.ts`
- Create: `fortunecards.client/src/app/components/table-card/table-card.component.html`
- Create: `fortunecards.client/src/app/components/table-card/table-card.component.css`
- Test: `fortunecards.client/src/app/components/table-card/table-card.component.spec.ts`

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces:
  - `models/table.ts`: `TableColor` type, `TableCardState` interface — used by every later task.
  - `TableCardComponent` (selector `table-card`) with signal inputs `card: TableCardState` (required), `widthPercent: number` (required), `tableWidthPx: number` (required), `selected: boolean` (default false). Task 2 adds its outputs.

- [ ] **Step 1: Write the model file** (no test needed — pure types)

`fortunecards.client/src/app/models/table.ts`:

```ts
export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

export interface TableCardState {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps all geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
  /** false = back face up (default), true = front face up. */
  flipped: boolean;
}
```

- [ ] **Step 2: Write the failing rendering tests**

`fortunecards.client/src/app/components/table-card/table-card.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TableCardComponent } from './table-card.component';
import { TableCardState } from '../../models/table';

describe('TableCardComponent', () => {
  let fixture: ComponentFixture<TableCardComponent>;

  const baseCard: TableCardState = { id: 'c1', x: 10, y: 20, rotation: 0, flipped: false };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TableCardComponent);
    fixture.componentRef.setInput('card', baseCard);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', false);
    fixture.detectChanges();
  });

  function root(): HTMLElement {
    return fixture.nativeElement.querySelector('.table-card');
  }

  it('renders back and front faces with placeholder text', () => {
    expect(root().querySelector('.face.back')!.textContent).toContain('back');
    expect(root().querySelector('.face.front')!.textContent).toContain('front');
  });

  it('derives pixel position and size from % of table width', () => {
    // x=10% of 1000px, y=20% of 1000px, width=20% of 1000px
    expect(root().style.left).toBe('100px');
    expect(root().style.top).toBe('200px');
    expect(root().style.width).toBe('200px');
  });

  it('applies the rotation as a CSS transform', () => {
    fixture.componentRef.setInput('card', { ...baseCard, rotation: 45 });
    fixture.detectChanges();
    expect(root().style.transform).toBe('rotate(45deg)');
  });

  it('toggles the flipped class from card state', () => {
    expect(root().querySelector('.flip-inner')!.classList.contains('flipped')).toBe(false);
    fixture.componentRef.setInput('card', { ...baseCard, flipped: true });
    fixture.detectChanges();
    expect(root().querySelector('.flip-inner')!.classList.contains('flipped')).toBe(true);
  });

  it('shows the rotate handle and selected class only when selected', () => {
    expect(root().classList.contains('selected')).toBe(false);
    expect(root().querySelector('.rotate-handle')).toBeNull();
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(root().classList.contains('selected')).toBe(true);
    expect(root().querySelector('.rotate-handle')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: FAIL — cannot resolve `./table-card.component`.

- [ ] **Step 4: Write the component**

`fortunecards.client/src/app/components/table-card/table-card.component.ts`:

```ts
import { Component, computed, input } from '@angular/core';
import { TableCardState } from '../../models/table';

@Component({
  selector: 'table-card',
  standalone: true,
  templateUrl: './table-card.component.html',
  styleUrl: './table-card.component.css',
})
export class TableCardComponent {
  readonly card = input.required<TableCardState>();
  /** Card width as % of table width. */
  readonly widthPercent = input.required<number>();
  readonly tableWidthPx = input.required<number>();
  readonly selected = input(false);

  readonly leftPx = computed(() => (this.card().x / 100) * this.tableWidthPx());
  readonly topPx = computed(() => (this.card().y / 100) * this.tableWidthPx());
  readonly widthPx = computed(() => (this.widthPercent() / 100) * this.tableWidthPx());
}
```

`fortunecards.client/src/app/components/table-card/table-card.component.html`:

```html
<div
  class="table-card"
  [class.selected]="selected()"
  [style.left.px]="leftPx()"
  [style.top.px]="topPx()"
  [style.width.px]="widthPx()"
  [style.transform]="'rotate(' + card().rotation + 'deg)'"
>
  <div class="flip-inner" [class.flipped]="card().flipped">
    <div class="face back">back</div>
    <div class="face front">front</div>
  </div>
  @if (selected()) {
    <div class="rotate-handle" title="Drag to rotate">⤾</div>
  }
</div>
```

`fortunecards.client/src/app/components/table-card/table-card.component.css`:

```css
:host {
  display: contents;
}

.table-card {
  position: absolute;
  aspect-ratio: 2 / 3;
  cursor: grab;
  user-select: none;
  touch-action: none;
  perspective: 600px;
}

.flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s;
  border-radius: 8px;
}

.flip-inner.flipped {
  transform: rotateY(180deg);
}

.face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  border-radius: 8px;
  border: 1px solid #8a8a8a;
  font-family: inherit;
}

.face.back {
  background: #6b4f9e;
  color: #fff;
}

.face.front {
  background: #fffdf7;
  color: #333;
  transform: rotateY(180deg);
}

.table-card.selected .flip-inner {
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS (all suites, including the 5 new tests).

- [ ] **Step 6: Commit**

```powershell
git add fortunecards.client/src/app/models/table.ts fortunecards.client/src/app/components/table-card
git commit -m "feat: add TableCardComponent with flip faces and rotate handle"
```

---

### Task 2: TableCardComponent interactions (select, flip, drag-move, drag-rotate)

**Files:**
- Modify: `fortunecards.client/src/app/components/table-card/table-card.component.ts`
- Modify: `fortunecards.client/src/app/components/table-card/table-card.component.html`
- Test: `fortunecards.client/src/app/components/table-card/table-card.component.spec.ts` (append)

**Interfaces:**
- Consumes: Task 1's component and inputs.
- Produces outputs consumed by `TableComponent` in Task 3:
  - `cardSelect: OutputEmitterRef<void>` — pointerdown anywhere on the card
  - `cardFlip: OutputEmitterRef<void>` — double-click
  - `cardMove: OutputEmitterRef<{ x: number; y: number }>` — new top-left in % of table width (unclamped; parent clamps)
  - `cardRotate: OutputEmitterRef<number>` — new absolute rotation in degrees (unnormalized; parent normalizes)

**Note on jsdom:** dispatch pointer events as `new MouseEvent('pointerdown', {...})` — jsdom has no `PointerEvent`, but Angular's `(pointerdown)` binding listens by event name, so `MouseEvent` works. The implementation must call `setPointerCapture` with optional chaining (`?.`) because jsdom elements lack it.

- [ ] **Step 1: Append the failing interaction tests**

Append inside the existing `describe('TableCardComponent', ...)` block in `table-card.component.spec.ts` (after the last `it`):

```ts
  it('emits cardSelect on pointerdown', () => {
    const selected = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it('emits cardFlip on double click', () => {
    const flipped = vi.fn();
    fixture.componentInstance.cardFlip.subscribe(flipped);
    root().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(flipped).toHaveBeenCalledTimes(1);
  });

  it('emits cardMove with pointer delta converted to % of table width', () => {
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    // +100px on a 1000px table = +10%; +50px = +5%. Card starts at x=10, y=20.
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(moved).toHaveBeenCalledWith({ x: 20, y: 25 });
  });

  it('stops emitting cardMove after pointerup', () => {
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(moved).not.toHaveBeenCalled();
  });

  it('emits cardRotate while dragging the rotate handle', () => {
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const rotated = vi.fn();
    fixture.componentInstance.cardRotate.subscribe(rotated);
    // Card rect: center at (200, 250).
    vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400, x: 100, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    const handle = root().querySelector('.rotate-handle')!;
    // Start: pointer directly right of center → reference angle 0°.
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    // Move: pointer directly below center → +90° from start. Card rotation was 0 → emits 90.
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 350 }));
    expect(rotated).toHaveBeenCalledWith(90);
  });

  it('does not emit cardMove while rotating via the handle', () => {
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    const handle = root().querySelector('.rotate-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 310, clientY: 260 }));
    expect(moved).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: FAIL — `cardSelect` / `cardFlip` / `cardMove` / `cardRotate` do not exist on the component (compile error).

- [ ] **Step 3: Implement the interactions**

Replace `table-card.component.ts` with:

```ts
import { Component, computed, input, output } from '@angular/core';
import { TableCardState } from '../../models/table';

@Component({
  selector: 'table-card',
  standalone: true,
  templateUrl: './table-card.component.html',
  styleUrl: './table-card.component.css',
})
export class TableCardComponent {
  readonly card = input.required<TableCardState>();
  /** Card width as % of table width. */
  readonly widthPercent = input.required<number>();
  readonly tableWidthPx = input.required<number>();
  readonly selected = input(false);

  readonly cardSelect = output<void>();
  readonly cardFlip = output<void>();
  /** New top-left in % of table width; parent is responsible for clamping. */
  readonly cardMove = output<{ x: number; y: number }>();
  /** New absolute rotation in degrees; parent is responsible for normalizing. */
  readonly cardRotate = output<number>();

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
    this.cardSelect.emit();
    this.dragging = true;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.startCardX = this.card().x;
    this.startCardY = this.card().y;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
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
    event.stopPropagation();
    this.rotating = true;
    this.dragging = false;
    const rect = (event.currentTarget as HTMLElement).closest('.table-card')!.getBoundingClientRect();
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

Replace `table-card.component.html` with:

```html
<div
  class="table-card"
  [class.selected]="selected()"
  [style.left.px]="leftPx()"
  [style.top.px]="topPx()"
  [style.width.px]="widthPx()"
  [style.transform]="'rotate(' + card().rotation + 'deg)'"
  (pointerdown)="onPointerDown($event)"
  (pointermove)="onPointerMove($event)"
  (pointerup)="onPointerUp()"
  (pointercancel)="onPointerUp()"
  (dblclick)="cardFlip.emit()"
>
  <div class="flip-inner" [class.flipped]="card().flipped">
    <div class="face back">back</div>
    <div class="face front">front</div>
  </div>
  @if (selected()) {
    <div class="rotate-handle" title="Drag to rotate" (pointerdown)="onRotateStart($event)">⤾</div>
  }
</div>
```

(Pointer capture on the handle retargets move/up events to the handle, which bubble up to the root `div` where `(pointermove)`/`(pointerup)` are bound — so rotation keeps tracking even when the pointer leaves the handle.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/table-card
git commit -m "feat: table-card select, flip, drag-move and drag-rotate interactions"
```

---

### Task 3: TableComponent page — state, geometry, card wiring, route

**Files:**
- Create: `fortunecards.client/src/app/components/table/table.component.ts`
- Create: `fortunecards.client/src/app/components/table/table.component.html`
- Create: `fortunecards.client/src/app/components/table/table.component.css`
- Modify: `fortunecards.client/src/app/app-routing-module.ts` (add `table` route before the `profile/settings` entry)
- Test: `fortunecards.client/src/app/components/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `TableCardComponent` (Task 2), `TableCardState`/`TableColor` (Task 1), existing `NavigationBar`.
- Produces (used by Tasks 4–6): `TableComponent` with public members
  - `tableColor: WritableSignal<TableColor>`, `cardSizePercent: WritableSignal<number>`, `tableHeightPercent: WritableSignal<number>`, `tableWidthPx: WritableSignal<number>`, `cards: WritableSignal<TableCardState[]>`, `selectedCardId: WritableSignal<string | null>`
  - methods `selectCard(id: string): void`, `flipCard(id: string): void`, `moveCard(id: string, pos: { x: number; y: number }): void`, `rotateCard(id: string, rotation: number): void`, `onTablePointerDown(event: Event): void`
  - `heightStyle: Signal<string>` — `'<px>px'` once measured, `'100vh'` fallback

**Test setup note:** `NavigationBar` (and its inner `MainMenuComponent`) inject `AuthService` and `Router` — provide the same mocks `deck-list.component.spec.ts` uses. jsdom has no `ResizeObserver` and element widths measure 0, so the implementation guards both, and tests set `tableWidthPx` / `tableHeightPercent` signals directly.

- [ ] **Step 1: Write the failing tests**

`fortunecards.client/src/app/components/table/table.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TableComponent } from './table.component';
import { AuthService } from '../../services/auth.service';

describe('TableComponent', () => {
  let component: TableComponent;
  let fixture: ComponentFixture<TableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn: signal(false), currentUser: signal(null), login: vi.fn(), logout: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function tableEl(): HTMLElement {
    return fixture.nativeElement.querySelector('.table');
  }

  it('has spec defaults: beige, 20% cards, one test card, nothing selected', () => {
    expect(component.tableColor()).toBe('beige');
    expect(component.cardSizePercent()).toBe(20);
    expect(component.cards()).toEqual([{ id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
    expect(component.selectedCardId()).toBeNull();
  });

  it('renders the table with its color and one table-card', () => {
    expect(tableEl().getAttribute('data-color')).toBe('beige');
    expect(fixture.nativeElement.querySelectorAll('table-card').length).toBe(1);
  });

  it('falls back to 100vh height before the table is measured', () => {
    expect(component.heightStyle()).toBe('100vh');
  });

  it('derives pixel height from tableHeightPercent and tableWidthPx', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    expect(component.heightStyle()).toBe('600px');
  });

  it('selectCard selects; pointerdown on the table background deselects', () => {
    component.selectCard('test-card');
    expect(component.selectedCardId()).toBe('test-card');
    fixture.detectChanges();
    tableEl().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBeNull();
  });

  it('pointerdown bubbling from a child does not deselect', () => {
    component.selectCard('test-card');
    fixture.detectChanges();
    const child = fixture.nativeElement.querySelector('table-card')!;
    child.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBe('test-card');
  });

  it('flipCard toggles the flipped flag', () => {
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(true);
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(false);
  });

  it('moveCard clamps the card inside the table', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    // card is 20% wide, 30% tall (aspect 2/3) → max x = 80, max y = 30
    component.moveCard('test-card', { x: 95, y: 95 });
    expect(component.cards()[0]).toMatchObject({ x: 80, y: 30 });
    component.moveCard('test-card', { x: -10, y: -10 });
    expect(component.cards()[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('rotateCard normalizes the angle into [0, 360)', () => {
    component.rotateCard('test-card', 370);
    expect(component.cards()[0].rotation).toBe(10);
    component.rotateCard('test-card', -10);
    expect(component.cards()[0].rotation).toBe(350);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: FAIL — cannot resolve `./table.component`.

- [ ] **Step 3: Write the component and route**

`fortunecards.client/src/app/components/table/table.component.ts`:

```ts
import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationBar } from '../navigation-bar/navigation-bar';
import { TableCardComponent } from '../table-card/table-card.component';
import { TableCardState, TableColor } from '../../models/table';

@Component({
  selector: 'app-table',
  standalone: true,
  templateUrl: './table.component.html',
  styleUrl: './table.component.css',
  imports: [NavigationBar, TableCardComponent],
})
export class TableComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');

  readonly tableColor = signal<TableColor>('beige');
  /** Card width, in % of table width (5–80). */
  readonly cardSizePercent = signal(20);
  /** Table height, in % of table width; 0 = not yet measured. */
  readonly tableHeightPercent = signal(0);
  readonly tableWidthPx = signal(0);
  readonly cards = signal<TableCardState[]>([{ id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
  readonly selectedCardId = signal<string | null>(null);

  readonly heightStyle = computed(() =>
    this.tableWidthPx() > 0 && this.tableHeightPercent() > 0
      ? `${(this.tableHeightPercent() / 100) * this.tableWidthPx()}px`
      : '100vh'
  );

  ngAfterViewInit(): void {
    const el = this.tableRef().nativeElement;
    const width = el.getBoundingClientRect().width;
    if (width > 0) {
      this.tableWidthPx.set(width);
      // Initial table height = viewport height, stored in table-width % so it rescales.
      this.tableHeightPercent.set((window.innerHeight / width) * 100);
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) this.tableWidthPx.set(w);
      });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  selectCard(id: string): void {
    this.selectedCardId.set(id);
  }

  onTablePointerDown(event: Event): void {
    if (event.target === this.tableRef().nativeElement) {
      this.selectedCardId.set(null);
    }
  }

  flipCard(id: string): void {
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, flipped: !c.flipped } : c)));
  }

  moveCard(id: string, pos: { x: number; y: number }): void {
    const cardHeight = this.cardSizePercent() * 1.5; // aspect ratio 2/3
    const maxX = Math.max(0, 100 - this.cardSizePercent());
    const maxY = Math.max(0, this.tableHeightPercent() - cardHeight);
    const x = Math.min(maxX, Math.max(0, pos.x));
    const y = Math.min(maxY, Math.max(0, pos.y));
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, x, y } : c)));
  }

  rotateCard(id: string, rotation: number): void {
    const normalized = ((rotation % 360) + 360) % 360;
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, rotation: normalized } : c)));
  }
}
```

`fortunecards.client/src/app/components/table/table.component.html`:

```html
<navigation-bar></navigation-bar>

<div
  #table
  class="table"
  [attr.data-color]="tableColor()"
  [style.height]="heightStyle()"
  (pointerdown)="onTablePointerDown($event)"
>
  @for (card of cards(); track card.id) {
    <table-card
      [card]="card"
      [widthPercent]="cardSizePercent()"
      [tableWidthPx]="tableWidthPx()"
      [selected]="selectedCardId() === card.id"
      (cardSelect)="selectCard(card.id)"
      (cardFlip)="flipCard(card.id)"
      (cardMove)="moveCard(card.id, $event)"
      (cardRotate)="rotateCard(card.id, $event)"
    />
  }
</div>
```

`fortunecards.client/src/app/components/table/table.component.css`:

```css
.table {
  position: relative;
  width: 90%;
  margin: 16px auto;
  border-radius: 12px;
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.15);
}

.table[data-color='beige'] {
  background: #f0e6d2;
}

.table[data-color='pink'] {
  background: #f6d5e0;
}

.table[data-color='yellow'] {
  background: #f6e7a9;
}

.table[data-color='dark-red'] {
  background: #7a2e2e;
}
```

In `fortunecards.client/src/app/app-routing-module.ts`, insert the new route between the `{ path: 'decks', ... }` entry and the `profile/settings` entry:

```ts
  {
    path: 'table',
    loadComponent: () => import('./components/table/table.component').then((c) => c.TableComponent)
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/table fortunecards.client/src/app/app-routing-module.ts
git commit -m "feat: add public /table page with proportional geometry and card wiring"
```

---

### Task 4: Keyboard rotation — hold R + arrow keys

**Files:**
- Modify: `fortunecards.client/src/app/components/table/table.component.ts`
- Test: `fortunecards.client/src/app/components/table/table.component.spec.ts` (append)

**Interfaces:**
- Consumes: `TableComponent.rotateCard`, `selectedCardId`, `cards` (Task 3).
- Produces: document-level `keydown`/`keyup` host listeners (`onKeyDown(event: KeyboardEvent)`, `onKeyUp(event: KeyboardEvent)`); rotation changes by ±1° per ArrowRight/ArrowLeft keydown while R is held (OS key auto-repeat provides continuous rotation).

- [ ] **Step 1: Append the failing tests**

Append inside the `describe('TableComponent', ...)` block:

```ts
  function key(type: 'keydown' | 'keyup', key: string): void {
    document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  it('rotates the selected card 1° per arrow keydown while R is held', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(2);
    key('keydown', 'ArrowLeft');
    expect(component.cards()[0].rotation).toBe(1);
  });

  it('ignores arrows when R is not held', () => {
    component.selectCard('test-card');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('stops rotating after R is released', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keyup', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('ignores R+arrows when no card is selected', () => {
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: the 3 new rotation-behavior tests FAIL (rotation stays 0 / arrows do nothing); "ignores" tests may pass vacuously — that's fine.

- [ ] **Step 3: Implement keyboard rotation**

In `table.component.ts`, add a `host` block to the `@Component` decorator:

```ts
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
  },
```

and add to the class:

```ts
  private rotateKeyHeld = false;

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'r' || event.key === 'R') {
      this.rotateKeyHeld = true;
      return;
    }
    if (!this.rotateKeyHeld) return;
    const id = this.selectedCardId();
    if (!id) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const card = this.cards().find((c) => c.id === id);
      if (card) this.rotateCard(id, card.rotation + delta);
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'r' || event.key === 'R') {
      this.rotateKeyHeld = false;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/table/table.component.ts fortunecards.client/src/app/components/table/table.component.spec.ts
git commit -m "feat: rotate selected table-card with R + arrow keys"
```

---

### Task 5: Table settings dialog (color + card size)

**Files:**
- Create: `fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.ts`
- Create: `fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.html`
- Create: `fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.css`
- Modify: `fortunecards.client/src/app/components/table/table.component.ts` (import dialog, `settingsOpen` signal)
- Modify: `fortunecards.client/src/app/components/table/table.component.html` (⚙ button + dialog)
- Test: `fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.spec.ts`
- Test: `fortunecards.client/src/app/components/table/table.component.spec.ts` (append integration tests)

**Interfaces:**
- Consumes: `TableColor` (Task 1), `TableComponent` signals (Task 3).
- Produces: `TableSettingsDialogComponent` (selector `table-settings-dialog`) — inputs `color: TableColor` (required), `cardSize: number` (required); outputs `colorChange: OutputEmitterRef<TableColor>`, `cardSizeChange: OutputEmitterRef<number>` (clamped to 5–80), `closed: OutputEmitterRef<void>`. Also `TableComponent.settingsOpen: WritableSignal<boolean>`.

- [ ] **Step 1: Write the failing dialog tests**

`fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TableSettingsDialogComponent } from './table-settings-dialog.component';

describe('TableSettingsDialogComponent', () => {
  let fixture: ComponentFixture<TableSettingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableSettingsDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TableSettingsDialogComponent);
    fixture.componentRef.setInput('color', 'beige');
    fixture.componentRef.setInput('cardSize', 20);
    fixture.detectChanges();
  });

  function swatches(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.swatch'));
  }

  it('renders the four color swatches with the current one active', () => {
    expect(swatches().map((s) => s.getAttribute('data-color'))).toEqual(['beige', 'pink', 'yellow', 'dark-red']);
    expect(swatches().filter((s) => s.classList.contains('active')).map((s) => s.getAttribute('data-color'))).toEqual(['beige']);
  });

  it('emits colorChange when a swatch is clicked', () => {
    const changed = vi.fn();
    fixture.componentInstance.colorChange.subscribe(changed);
    swatches().find((s) => s.getAttribute('data-color') === 'dark-red')!.click();
    expect(changed).toHaveBeenCalledWith('dark-red');
  });

  it('shows the card size as % of table width with 5–80 slider bounds', () => {
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    expect(slider.min).toBe('5');
    expect(slider.max).toBe('80');
    expect(slider.value).toBe('20');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('20% of table width');
  });

  it('emits cardSizeChange on slider input, clamped to 5–80', () => {
    const changed = vi.fn();
    fixture.componentInstance.cardSizeChange.subscribe(changed);
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    slider.value = '55';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledWith(55);
    fixture.componentInstance.onSizeInput({ target: { value: '999' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith(80);
    fixture.componentInstance.onSizeInput({ target: { value: '1' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith(5);
  });

  it('emits closed from the backdrop and the close button', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.dialog-close') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: FAIL — cannot resolve `./table-settings-dialog.component`.

- [ ] **Step 3: Write the dialog component**

`fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.ts`:

```ts
import { Component, input, output } from '@angular/core';
import { TableColor } from '../../models/table';

@Component({
  selector: 'table-settings-dialog',
  standalone: true,
  templateUrl: './table-settings-dialog.component.html',
  styleUrl: './table-settings-dialog.component.css',
})
export class TableSettingsDialogComponent {
  readonly color = input.required<TableColor>();
  readonly cardSize = input.required<number>();

  readonly colorChange = output<TableColor>();
  readonly cardSizeChange = output<number>();
  readonly closed = output<void>();

  readonly colors: TableColor[] = ['beige', 'pink', 'yellow', 'dark-red'];

  onSizeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.cardSizeChange.emit(Math.min(80, Math.max(5, value)));
  }
}
```

`fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.html`:

```html
<div class="dialog-backdrop" (click)="closed.emit()"></div>
<div class="dialog-panel" role="dialog" aria-label="Table settings">
  <h2>Table settings</h2>

  <div class="setting">
    <span class="setting-label">Color of table</span>
    <div class="swatches">
      @for (c of colors; track c) {
        <button
          type="button"
          class="swatch"
          [attr.data-color]="c"
          [class.active]="color() === c"
          [attr.aria-label]="c"
          (click)="colorChange.emit(c)"
        ></button>
      }
    </div>
  </div>

  <div class="setting">
    <label class="setting-label" for="card-size">Size of cards: {{ cardSize() }}% of table width</label>
    <input id="card-size" type="range" min="5" max="80" [value]="cardSize()" (input)="onSizeInput($event)" />
  </div>

  <button class="dialog-close" type="button" (click)="closed.emit()">Close</button>
</div>
```

`fortunecards.client/src/app/components/table-settings-dialog/table-settings-dialog.component.css`:

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
  min-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.dialog-panel h2 {
  margin: 0 0 16px;
  font-size: 1.1rem;
}

.setting {
  margin-bottom: 16px;
}

.setting-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.swatches {
  display: flex;
  gap: 10px;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.swatch.active {
  border-color: #333;
  box-shadow: 0 0 0 2px #fff inset;
}

.swatch[data-color='beige'] { background: #f0e6d2; }
.swatch[data-color='pink'] { background: #f6d5e0; }
.swatch[data-color='yellow'] { background: #f6e7a9; }
.swatch[data-color='dark-red'] { background: #7a2e2e; }

.setting input[type='range'] {
  width: 100%;
}

.dialog-close {
  display: block;
  margin-left: auto;
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: #6b4f9e;
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 4: Run dialog tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Append the failing integration tests**

Append inside the `describe('TableComponent', ...)` block in `table.component.spec.ts`:

```ts
  it('opens the settings dialog from the gear button and applies changes', () => {
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).toBeNull();
    (fixture.nativeElement.querySelector('.settings-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).not.toBeNull();

    (fixture.nativeElement.querySelector('.swatch[data-color="pink"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.tableColor()).toBe('pink');
    expect(tableEl().getAttribute('data-color')).toBe('pink');

    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.cardSizePercent()).toBe(40);

    (fixture.nativeElement.querySelector('.dialog-close') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).toBeNull();
  });
```

- [ ] **Step 6: Run tests to verify the integration test fails**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: the new test FAILS — no `.settings-btn` element.

- [ ] **Step 7: Integrate the dialog into the table page**

In `table.component.ts`: add `TableSettingsDialogComponent` to the `imports:` array and its import statement

```ts
import { TableSettingsDialogComponent } from '../table-settings-dialog/table-settings-dialog.component';
```

and add to the class:

```ts
  readonly settingsOpen = signal(false);
```

In `table.component.html`, add the gear button as the last child of `div.table`:

```html
  <button class="settings-btn" type="button" aria-label="Table settings" (click)="settingsOpen.set(true)">⚙</button>
```

and after the closing `</div>` of `.table`:

```html
@if (settingsOpen()) {
  <table-settings-dialog
    [color]="tableColor()"
    [cardSize]="cardSizePercent()"
    (colorChange)="tableColor.set($event)"
    (cardSizeChange)="cardSizePercent.set($event)"
    (closed)="settingsOpen.set(false)"
  />
}
```

In `table.component.css`, add:

```css
.settings-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add fortunecards.client/src/app/components/table-settings-dialog fortunecards.client/src/app/components/table
git commit -m "feat: table settings dialog for table color and card size"
```

---

### Task 6: Table height +/− controls with minimum-height clamp

**Files:**
- Modify: `fortunecards.client/src/app/components/table/table.component.ts`
- Modify: `fortunecards.client/src/app/components/table/table.component.html`
- Modify: `fortunecards.client/src/app/components/table/table.component.css`
- Test: `fortunecards.client/src/app/components/table/table.component.spec.ts` (append)

**Interfaces:**
- Consumes: `tableHeightPercent`, `cardSizePercent`, `cards` (Task 3).
- Produces: `increaseHeight(): void`, `decreaseHeight(): void`, `minHeightPercent: Signal<number>` (= lowest card bottom edge in table-width % + 5).

- [ ] **Step 1: Append the failing tests**

Append inside the `describe('TableComponent', ...)` block:

```ts
  it('the + and − buttons change table height by the current card size', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.height-btn--plus') as HTMLElement).click();
    expect(component.tableHeightPercent()).toBe(120);
    (fixture.nativeElement.querySelector('.height-btn--minus') as HTMLElement).click();
    expect(component.tableHeightPercent()).toBe(100);
  });

  it('minHeightPercent is the lowest card bottom edge + 5% of table width', () => {
    // test card at y=0, card height = 20 * 1.5 = 30 → min = 35
    expect(component.minHeightPercent()).toBe(35);
    component.moveCard('test-card', { x: 0, y: 50 });
    component.tableHeightPercent.set(100); // allow the move first
    component.moveCard('test-card', { x: 0, y: 50 });
    expect(component.minHeightPercent()).toBe(85);
  });

  it('decreaseHeight clamps to the minimum height', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(40); // min is 35 (card at y=0)
    component.decreaseHeight(); // 40 - 20 = 20 → clamped to 35
    expect(component.tableHeightPercent()).toBe(35);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: FAIL — `minHeightPercent` / `increaseHeight` / `decreaseHeight` do not exist (compile error).

- [ ] **Step 3: Implement the height controls**

Add to the `TableComponent` class:

```ts
  /** Minimum table height: bottom edge of the lowest card + 5% of table width. */
  readonly minHeightPercent = computed(() => {
    const cardHeight = this.cardSizePercent() * 1.5;
    const lowestBottom = this.cards().reduce((max, c) => Math.max(max, c.y + cardHeight), 0);
    return lowestBottom + 5;
  });

  increaseHeight(): void {
    this.tableHeightPercent.update((h) => h + this.cardSizePercent());
  }

  decreaseHeight(): void {
    this.tableHeightPercent.update((h) => Math.max(this.minHeightPercent(), h - this.cardSizePercent()));
  }
```

In `table.component.html`, add inside `div.table`, right after the settings button:

```html
  <div class="height-controls">
    <button class="height-btn height-btn--plus" type="button" aria-label="Increase table height" (click)="increaseHeight()">+</button>
    <button class="height-btn height-btn--minus" type="button" aria-label="Decrease table height" (click)="decreaseHeight()">−</button>
  </div>
```

In `table.component.css`, add:

```css
.height-controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  gap: 8px;
}

.height-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/table
git commit -m "feat: table height +/- controls with lowest-card minimum clamp"
```

---

### Task 7: Main menu "Table" item + final verification

**Files:**
- Modify: `fortunecards.client/src/app/components/main-menu/main-menu.html`
- Modify: `fortunecards.client/src/app/components/main-menu/main-menu.spec.ts`

**Interfaces:**
- Consumes: the `/table` route (Task 3) and the existing `MainMenuComponent.go(path)` method.
- Produces: a "Table" menu item, visible to everyone, right after "Search decks".

- [ ] **Step 1: Update the failing menu expectations**

In `main-menu.spec.ts`, update the two label-assertion tests:

```ts
  it('shows Search decks and Sign in when logged out', () => {
    component.open.set(true);
    fixture.detectChanges();
    expect(itemLabels()).toEqual(['Search decks', 'Table', 'Sign in with Google']);
  });

  it('shows all nav items and Logout when logged in', () => {
    auth.isLoggedIn.set(true);
    component.open.set(true);
    fixture.detectChanges();
    expect(itemLabels()).toEqual(['My decks', 'Search decks', 'Table', 'My profile', 'Logout']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: the two updated tests FAIL — no "Table" item yet.

- [ ] **Step 3: Add the menu item**

In `main-menu.html`, insert after the "Search decks" button (line with `go('/decks/search')`):

```html
      <button class="menu-item" type="button" (click)="go('/table')">Table</button>
```

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `cd fortunecards.client; ng test --watch=false`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/main-menu
git commit -m "feat: add Table link to the main menu"
```

- [ ] **Step 6: Manual smoke check (optional but recommended)**

Run backend + frontend (`dotnet run --project FortuneCards.Server` and `npm start` in `fortunecards.client/`), open `https://127.0.0.1:51313/table` and verify: beige table 90% wide and full viewport height; one card top-left showing "back"; click selects (glow + handle); double-click flips to "front"; drag moves; handle-drag and R+arrows rotate; ⚙ dialog changes color/size live; +/− resize the table height with the clamp; window resize rescales everything proportionally.
