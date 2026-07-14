# Table Card Info Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "i" (info) handle to the front face of a placed deck card that opens a dialog showing the card's picture on the left and its title/description on the right.

**Architecture:** The `table-card` shows a small circular "i" handle (mirroring the existing rotate handle) in the top-left corner, visible only when the card is selected and flipped to its front face. Clicking it emits a `cardInfo` output. `TableComponent` tracks which card's info is open and renders a new standalone `card-info-dialog` at the table level (alongside the existing dialogs) — rendering it there, not inside the rotated card, avoids the `position: fixed` containing-block bug caused by the card's CSS `transform`.

**Tech Stack:** Angular 21 (standalone components, signals, `input()`/`output()`), Vitest (`ng test`), TypeScript strict mode.

## Global Constraints

- All components are **standalone**; register them in `TestBed` via `imports:`, never `declarations:`.
- Tests run under **Vitest** with `provideZonelessChangeDetection()`; use `describe`/`it`/`expect` and `vi` (e.g. `vi.fn`, `vi.spyOn`). All specs compile as one bundle — a type error in any spec fails the whole run.
- Component state uses signals (`signal()`, `computed()`, `input()`, `output()`).
- Import `CommonModule` only where a template uses `*ngIf`/`*ngFor`; new components use `@if`/`@for` and do not need it.
- Verify command (single run): from `fortunecards.client/`, run `ng test --watch=false`.
- Commit messages on this branch use the `11: <subject>` convention, and end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Scope: **deck cards only**. Do not touch `TablePatternCard` or `table-pattern-card`.

---

## File Structure

- **Modify** `fortunecards.client/src/app/models/table.ts` — add `title`/`description` to `TableDeckCard`.
- **Modify** `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts` — populate the new fields in `loadDeck`; add info-dialog state + handler.
- **Modify** `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.html` — wire `(cardInfo)` and render the dialog.
- **Create** `.../card-info-dialog/card-info-dialog.component.ts` (+ `.html`, `.css`, `.spec.ts`) — the info dialog.
- **Modify** `.../table-card/table-card.component.ts` — add `cardInfo` output + click handler.
- **Modify** `.../table-card/table-card.component.html` — render the "i" handle.
- **Modify** `.../table-card/table-card.component.css` — style the "i" handle.
- **Modify** the three spec files (`table`, `table-card`) for new behavior and updated fixtures.

---

## Task 1: Add title/description to the table deck-card model

**Files:**
- Modify: `fortunecards.client/src/app/models/table.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts` (`loadDeck`, lines ~128-143)
- Modify (fixtures): `.../table/table.component.spec.ts`, `.../table-card/table-card.component.spec.ts`
- Test: `.../table/table.component.spec.ts`

**Interfaces:**
- Produces: `TableDeckCard` now has `title: string` and `description: string`. `loadDeck` sets them from the source `Card` (`card.title`, `card.description`).

- [ ] **Step 1: Add the fields to the model**

In `models/table.ts`, add to `TableDeckCard` (after `backImageUrl`):

```ts
  /** Card title, shown in the info dialog. */
  title: string;
  /** Card description, shown in the info dialog. */
  description: string;
```

- [ ] **Step 2: Update the two test fixtures so the suite still compiles**

Making the fields required breaks existing fixtures. In `table-card.component.spec.ts`, add to `baseCard`:

```ts
    frontImageUrl: '/images/front.png', backImageUrl: '/images/back.png',
    title: 'The Sun', description: 'A bright card.',
```

In `table.component.spec.ts`, add to the object returned by `makeDeckCard`:

```ts
      frontImageUrl: '/images/front.png', backImageUrl: '/images/back.png',
      title: 'The Sun', description: 'A bright card.',
```

- [ ] **Step 3: Write the failing test for `loadDeck` populating the fields**

In `table.component.spec.ts`, add near the other `loadDeck` tests (the `card(id)` helper already sets `title: \`t${id}\`` and `description: ''`):

```ts
  it('loadDeck carries the card title and description onto the table cards', () => {
    component.loadDeck(deck([card(1), card(2)]));
    expect(component.cards().map((c) => c.title)).toEqual(['t1', 't2']);
    expect(component.cards().every((c) => c.description === '')).toBe(true);
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: FAIL — `loadDeck` does not set `title`/`description`, so `c.title` is `undefined` and the `toEqual(['t1','t2'])` assertion fails. (A TS compile error on the mapped object in Step 5's absence is also acceptable as the failing signal.)

- [ ] **Step 5: Populate the fields in `loadDeck`**

In `table.component.ts`, inside the `loadDeck` map object, add after `backImageUrl: deck.cardBackImageUrl,`:

```ts
      title: card.title,
      description: card.description,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: PASS (whole suite green).

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/models/table.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts fortunecards.client/src/app/components/TableFortuneTelling/table-card/table-card.component.spec.ts
git commit -m "11: Carry card title and description onto table deck cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Create the card-info-dialog component

**Files:**
- Create: `.../card-info-dialog/card-info-dialog.component.ts`
- Create: `.../card-info-dialog/card-info-dialog.component.html`
- Create: `.../card-info-dialog/card-info-dialog.component.css`
- Test: `.../card-info-dialog/card-info-dialog.component.spec.ts`

**Interfaces:**
- Produces: `CardInfoDialogComponent`, selector `card-info-dialog`. Inputs: `imageUrl` (required string), `title` (required string), `description` (required string). Output: `closed` (`output<void>()`), emitted on backdrop click and Close button.

- [ ] **Step 1: Write the failing spec**

Create `card-info-dialog.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CardInfoDialogComponent } from './card-info-dialog.component';

describe('CardInfoDialogComponent', () => {
  let fixture: ComponentFixture<CardInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardInfoDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CardInfoDialogComponent);
    fixture.componentRef.setInput('imageUrl', '/images/front.png');
    fixture.componentRef.setInput('title', 'The Sun');
    fixture.componentRef.setInput('description', 'A bright card.');
    fixture.detectChanges();
  });

  function el(): HTMLElement {
    return fixture.nativeElement;
  }

  it('renders the picture, title and description', () => {
    const img = el().querySelector('.card-info-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/images/front.png');
    expect(el().querySelector('.card-info-title')!.textContent).toContain('The Sun');
    expect(el().querySelector('.card-info-description')!.textContent).toContain('A bright card.');
  });

  it('emits closed when the backdrop is clicked', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (el().querySelector('.dialog-backdrop') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed when the Close button is clicked', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (el().querySelector('.dialog-close') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: FAIL — `CardInfoDialogComponent` does not exist (module resolution / compile error).

- [ ] **Step 3: Create the component class**

Create `card-info-dialog.component.ts`:

```ts
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'card-info-dialog',
  standalone: true,
  templateUrl: './card-info-dialog.component.html',
  styleUrl: './card-info-dialog.component.css',
})
export class CardInfoDialogComponent {
  readonly imageUrl = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();

  readonly closed = output<void>();
}
```

- [ ] **Step 4: Create the template**

Create `card-info-dialog.component.html`:

```html
<div class="dialog-backdrop" (click)="closed.emit()"></div>
<div class="dialog-panel" role="dialog" aria-label="Card information">
  <div class="card-info-body">
    <img class="card-info-img" [src]="imageUrl()" alt="" />
    <div class="card-info-text">
      <h2 class="card-info-title">{{ title() }}</h2>
      <p class="card-info-description">{{ description() }}</p>
    </div>
  </div>
  <button class="dialog-close" type="button" (click)="closed.emit()">Close</button>
</div>
```

- [ ] **Step 5: Create the styles**

Create `card-info-dialog.component.css` (backdrop/panel/close mirror `deck-selector`; body is the picture-left / text-right row):

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

.card-info-body {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.card-info-img {
  flex: 0 0 auto;
  width: 180px;
  max-width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #8a8a8a;
}

.card-info-text {
  flex: 1 1 240px;
  min-width: 0;
}

.card-info-title {
  margin: 0 0 12px;
  font-size: 1.2rem;
}

.card-info-description {
  margin: 0;
  color: #333;
  white-space: pre-wrap;
}

.dialog-close {
  display: block;
  margin: 20px 0 0 auto;
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: #6b4f9e;
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/card-info-dialog/
git commit -m "11: Add card-info-dialog with picture, title and description

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Add the "i" handle to table-card

**Files:**
- Modify: `.../table-card/table-card.component.ts`
- Modify: `.../table-card/table-card.component.html`
- Modify: `.../table-card/table-card.component.css`
- Test: `.../table-card/table-card.component.spec.ts`

**Interfaces:**
- Consumes: `TableCardComponent` inputs `card` (`TableDeckCard`) and `selected`.
- Produces: `TableCardComponent` gains `readonly cardInfo = output<void>();`, emitted from `onInfoClick(event)`. Handle element has class `.info-handle`, visible only when `selected() && card().flipped`.

- [ ] **Step 1: Write the failing tests**

In `table-card.component.spec.ts`, add:

```ts
  it('shows the info handle only when selected and flipped to the front', () => {
    // selected but back face up → no handle
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(root().querySelector('.info-handle')).toBeNull();
    // selected + flipped → handle appears
    fixture.componentRef.setInput('card', { ...baseCard, flipped: true });
    fixture.detectChanges();
    expect(root().querySelector('.info-handle')).not.toBeNull();
    // flipped but not selected → no handle
    fixture.componentRef.setInput('selected', false);
    fixture.detectChanges();
    expect(root().querySelector('.info-handle')).toBeNull();
  });

  it('emits cardInfo when the info handle is clicked without starting a move', () => {
    fixture.componentRef.setInput('card', { ...baseCard, flipped: true });
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const info = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardInfo.subscribe(info);
    fixture.componentInstance.cardMove.subscribe(moved);
    const handle = root().querySelector('.info-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 150 }));
    handle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // moving the pointer afterwards must not drag the card
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 }));
    expect(info).toHaveBeenCalledTimes(1);
    expect(moved).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: FAIL — no `.info-handle` element and no `cardInfo` output.

- [ ] **Step 3: Add the output and handler to the class**

In `table-card.component.ts`, add the output after `cardRotate`:

```ts
  readonly cardInfo = output<void>();
```

Add the handler method (e.g. after `onRotateStart`):

```ts
  onInfoClick(event: PointerEvent): void {
    event.stopPropagation();
    this.cardInfo.emit();
  }
```

- [ ] **Step 4: Render the handle in the template**

In `table-card.component.html`, add after the existing rotate-handle `@if` block (inside the `.table-card` div):

```html
  @if (selected() && card().flipped) {
    <div class="info-handle" title="Card info" (pointerdown)="onInfoClick($event)">ⓘ</div>
  }
```

- [ ] **Step 5: Style the handle**

In `table-card.component.css`, add (mirrors `.rotate-handle` but top-left):

```css
.info-handle {
  position: absolute;
  top: -12px;
  left: -12px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  font-size: 16px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table-card/
git commit -m "11: Add front-face info handle to table cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire the info dialog into TableComponent

**Files:**
- Modify: `.../table/table.component.ts`
- Modify: `.../table/table.component.html`
- Test: `.../table/table.component.spec.ts`

**Interfaces:**
- Consumes: `TableCardComponent.cardInfo` output; `CardInfoDialogComponent` (`imageUrl`/`title`/`description` inputs, `closed` output); `TableDeckCard.title`/`description` from Task 1.
- Produces: `TableComponent` gains `infoCardId = signal<string | null>(null)`, `infoCard = computed(...)`, and `openCardInfo(id: string): void`.

- [ ] **Step 1: Write the failing tests**

In `table.component.spec.ts`, add:

```ts
  it('openCardInfo sets infoCardId and infoCard resolves to that card', () => {
    component.loadDeck(deck([card(1), card(2)]));
    const target = component.cards()[1];
    component.openCardInfo(target.id);
    expect(component.infoCardId()).toBe(target.id);
    expect(component.infoCard()!.id).toBe(target.id);
  });

  it('renders card-info-dialog while a card info is open and closing clears it', () => {
    component.loadDeck(deck([card(1)]));
    expect(fixture.nativeElement.querySelector('card-info-dialog')).toBeNull();
    component.openCardInfo(component.cards()[0].id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('card-info-dialog')).not.toBeNull();
    (fixture.nativeElement.querySelector('card-info-dialog .dialog-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.infoCardId()).toBeNull();
    expect(fixture.nativeElement.querySelector('card-info-dialog')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: FAIL — `openCardInfo`/`infoCard`/`infoCardId` do not exist and `card-info-dialog` is never rendered.

- [ ] **Step 3: Add state and handler to the class**

In `table.component.ts`, import the dialog at the top:

```ts
import { CardInfoDialogComponent } from '../card-info-dialog/card-info-dialog.component';
```

Add it to the `imports` array of the `@Component` decorator (append to the existing list):

```ts
  imports: [NavigationBar, TableCardComponent, TablePatternCardComponent, TableSettingsDialogComponent, DeckSelectorComponent, CardInfoDialogComponent],
```

Add the signals near `selectedCardId` (line ~37):

```ts
  readonly infoCardId = signal<string | null>(null);
  readonly infoCard = computed(() => this.cards().find((c) => c.id === this.infoCardId()) ?? null);
```

Add the handler (e.g. after `flipCard`):

```ts
  openCardInfo(id: string): void {
    this.infoCardId.set(id);
  }
```

- [ ] **Step 4: Wire the template**

In `table.component.html`, add the `(cardInfo)` binding to the `<table-card>` element (after `(cardRotate)`):

```html
        (cardRotate)="rotateCard(card.id, $event)"
        (cardInfo)="openCardInfo(card.id)"
```

Add the dialog render at the end of the file (after the `deck-selector` block):

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: from `fortunecards.client/`, `ng test --watch=false`
Expected: PASS (whole suite green).

- [ ] **Step 6: Verify the backend still builds (no backend changes, sanity only)**

Run: from repo root, `dotnet build`
Expected: Build succeeded.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table/
git commit -m "11: Open card info dialog from the table card info handle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data (title/description on `TableDeckCard`, populated in `loadDeck`) → Task 1. ✓
- "i" handle on `table-card`, top-left, visible when selected + flipped, stops drag, emits output → Task 3. ✓
- `card-info-dialog` (picture left, title/description right, backdrop + Close close it) → Task 2. ✓
- Wiring in `TableComponent` (`infoCardId`, `infoCard`, `openCardInfo`, template + imports) → Task 4. ✓
- Pattern cards untouched → enforced by scope; no task modifies them. ✓
- Parent-owned dialog rationale (transform/fixed bug) → realized by Task 4 rendering at table level. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `cardInfo` output (Task 3) matches `(cardInfo)` binding (Task 4). `CardInfoDialogComponent` inputs `imageUrl`/`title`/`description` + `closed` output (Task 2) match the bindings in Task 4. `title`/`description` fields (Task 1) are consumed by `infoCard` bindings (Task 4). Fixture updates (Task 1) keep the required fields satisfied across all specs. ✓
