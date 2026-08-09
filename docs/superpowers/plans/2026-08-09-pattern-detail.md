# Pattern Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only pattern-detail page (`/patterns/:id`) with a `pattern-hero` header, a question list, and a non-interactive card-position preview; open it from the pattern list; and let a "Use pattern" button load a pattern onto the Table via `/table?pattern=<id>`.

**Architecture:** Angular 21 standalone components + signals. A new `PatternDetailComponent` loads the pattern via the existing `PatternService.getPattern(id)` and composes a new `PatternHeroComponent` and a new lean read-only `PatternTableViewComponent`. The read-only table reuses `pattern-position-card` with a new `readonly` input. The Table page gains an `ngOnInit` query-param auto-load. No backend changes.

**Tech Stack:** Angular 21 (standalone, signals, `input`/`output`/`computed`/`viewChild`), Vitest (`ng test --watch=false`), TypeScript strict.

## Global Constraints

- All components are **standalone**; register them (and any standalone child they render) in `TestBed` via `imports:`, never `declarations:`.
- Tests run under **Vitest** with `provideZonelessChangeDetection()`; set component inputs via `fixture.componentRef.setInput(...)`; all specs compile as one bundle, so a type error in any spec fails the whole run.
- Import `CommonModule` only in components that use `*ngIf`/`*ngFor`. Newer components use `@if`/`@for` and don't need it.
- Coordinate model: `x`/`y` are % of table width; `rotation` in degrees. Card aspect ratio is 3:5.
- Layout fields on `Pattern` are optional (`cardSizePercent?`, `tableHeightPercent?`) — always read them with `?? 15` / `?? 60` fallbacks.
- Gradients/shadows come from `utils/deck-colors` (`getDeckGradientStyle`, `getDeckShadowStyle`).
- Run the frontend suite from `fortunecards.client/` with `ng test --watch=false`.

---

### Task 1: `pattern-position-card` — add `readonly` input

**Files:**
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-position-card/pattern-position-card.component.ts`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-position-card/pattern-position-card.component.html`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-position-card/pattern-position-card.component.css`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-position-card/pattern-position-card.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PatternPositionCardComponent` gains `readonly = input(false)`. When `readonly()` is true, `cardSelect`/`cardMove`/`cardRotate` never fire and the rotate handle is never rendered. Default `false` preserves all existing editing behavior.

- [ ] **Step 1: Add the failing tests**

Append these two tests inside the `describe('PatternPositionCardComponent', …)` block in the spec file (they need a `readonly` setup — extend the existing `setup` helper to accept it):

Change the existing `setup` signature and body to add the input:

```typescript
  async function setup(card: EditablePatternCard = baseCard, selected = false, readonly = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternPositionCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternPositionCardComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
  }
```

Then add:

```typescript
  it('readonly: does not emit cardSelect or cardMove on pointer interaction', async () => {
    await setup(baseCard, false, true);
    const selected = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(selected).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled();
  });

  it('readonly: renders no rotate handle even when selected', async () => {
    await setup(baseCard, true, true);
    expect(root().querySelector('.rotate-handle')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: the two new tests FAIL (readonly input not defined → `setInput('readonly', …)` throws / handle still emits).

- [ ] **Step 3: Add the `readonly` input and guard the handlers**

In `pattern-position-card.component.ts`, add the input after `selected`. Declare it **without** a leading `readonly` modifier — `readonly readonly = …` double-keywords the modifier and the property name and reads badly; input signals are already immutable, so the modifier adds nothing here:

```typescript
  readonly selected = input(false);
  readonly = input(false);
```

Guard the three interaction entry points by returning early when readonly. Update the method tops:

```typescript
  onPointerDown(event: PointerEvent): void {
    if (this.readonly()) return;
    this.cardSelect.emit();
    this.dragging = true;
    // …unchanged…
  }

  onPointerMove(event: PointerEvent): void {
    if (this.readonly()) return;
    if (this.rotating) {
      // …unchanged…
    }
    // …unchanged…
  }

  onRotateStart(event: PointerEvent): void {
    if (this.readonly()) return;
    event.stopPropagation();
    // …unchanged…
  }
```

(`onPointerUp` needs no guard — it only clears flags.)

- [ ] **Step 4: Reflect readonly in the template + CSS**

In `pattern-position-card.component.html`, add the class binding to the root div and gate the handle on `!readonly()`:

```html
<div
  class="pattern-position-card"
  [class.selected]="selected()"
  [class.readonly]="readonly()"
  [style.left.px]="leftPx()"
  ...unchanged style/pointer bindings...
>
  <span class="position-order">{{ card().order }}</span>
  @if (selected() && !readonly()) {
    <div class="rotate-handle" title="Drag to rotate" (pointerdown)="onRotateStart($event)">⤾</div>
  }
</div>
```

In `pattern-position-card.component.css`, append:

```css
.pattern-position-card.readonly { cursor: default; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS, including the original four position-card tests (no regressions) and pristine output.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Pattern/pattern-position-card
git commit -m "59: Add readonly mode to pattern-position-card"
```

---

### Task 2: `PatternTableViewComponent` — read-only position preview

**Files:**
- Create: `fortunecards.client/src/app/components/Pattern/pattern-table-view/pattern-table-view.component.ts`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-table-view/pattern-table-view.component.html`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-table-view/pattern-table-view.component.css`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-table-view/pattern-table-view.component.spec.ts`

**Interfaces:**
- Consumes: `PatternPositionCardComponent` with its `readonly` input (Task 1); `EditablePatternCard` from `models/pattern`.
- Produces: `PatternTableViewComponent`, selector `app-pattern-table-view`. Inputs: `cards = input.required<EditablePatternCard[]>()`, `cardSizePercent = input.required<number>()`, `tableHeightPercent = input.required<number>()`. No outputs. Renders one read-only `pattern-position-card` per card.

- [ ] **Step 1: Write the failing test**

Create the spec file:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PatternTableViewComponent } from './pattern-table-view.component';
import { EditablePatternCard } from '../../../models/pattern';

describe('PatternTableViewComponent', () => {
  let fixture: ComponentFixture<PatternTableViewComponent>;

  const cards: EditablePatternCard[] = [
    { id: 'a', text: 'One', order: 1, x: 10, y: 10, rotation: 0 },
    { id: 'b', text: 'Two', order: 2, x: 40, y: 30, rotation: 15 },
  ];

  async function setup(list: EditablePatternCard[] = cards): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternTableViewComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternTableViewComponent);
    fixture.componentRef.setInput('cards', list);
    fixture.componentRef.setInput('cardSizePercent', 15);
    fixture.componentRef.setInput('tableHeightPercent', 60);
    fixture.detectChanges();
  }

  it('renders one position card per input card', async () => {
    await setup();
    expect(fixture.nativeElement.querySelectorAll('pattern-position-card').length).toBe(2);
  });

  it('renders the cards in read-only mode (no rotate handles, default cursor)', async () => {
    await setup();
    // readonly cards never render a rotate handle regardless of selection.
    expect(fixture.nativeElement.querySelector('.rotate-handle')).toBeNull();
    const card = fixture.nativeElement.querySelector('.pattern-position-card') as HTMLElement;
    expect(card.classList.contains('readonly')).toBe(true);
  });

  it('renders an empty table when there are no cards', async () => {
    await setup([]);
    expect(fixture.nativeElement.querySelectorAll('pattern-position-card').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./pattern-table-view.component`.

- [ ] **Step 3: Create the component**

`pattern-table-view.component.ts`:

```typescript
import {
  AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { PatternPositionCardComponent } from '../pattern-position-card/pattern-position-card.component';
import { EditablePatternCard } from '../../../models/pattern';

/** Position-card aspect ratio (matches the default deck card shape). */
const ASPECT_W = 3;
const ASPECT_H = 5;

@Component({
  selector: 'app-pattern-table-view',
  standalone: true,
  templateUrl: './pattern-table-view.component.html',
  styleUrl: './pattern-table-view.component.css',
  imports: [PatternPositionCardComponent],
})
export class PatternTableViewComponent implements AfterViewInit {
  readonly cards = input.required<EditablePatternCard[]>();
  readonly cardSizePercent = input.required<number>();
  readonly tableHeightPercent = input.required<number>();

  readonly aspectWidth = ASPECT_W;
  readonly aspectHeight = ASPECT_H;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');
  private readonly _widthPx = signal(0);
  readonly tableWidthPx = this._widthPx.asReadonly();

  readonly heightStyle = computed(() =>
    this.tableWidthPx() > 0 && this.tableHeightPercent() > 0
      ? `${(this.tableHeightPercent() / 100) * this.tableWidthPx()}px`
      : '60vh'
  );

  ngAfterViewInit(): void {
    const el = this.tableRef().nativeElement;
    const width = el.getBoundingClientRect().width;
    if (width > 0) this._widthPx.set(width);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) this._widthPx.set(w);
      });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }
}
```

`pattern-table-view.component.html`:

```html
<div #table class="view-table" [style.height]="heightStyle()">
  @for (card of cards(); track card.id) {
    <pattern-position-card
      [card]="card"
      [widthPercent]="cardSizePercent()"
      [tableWidthPx]="tableWidthPx()"
      [readonly]="true"
      [selected]="false"
      [aspectWidth]="aspectWidth"
      [aspectHeight]="aspectHeight"
    ></pattern-position-card>
  }
</div>
```

`pattern-table-view.component.css`:

```css
.view-table {
  position: relative;
  width: 100%;
  border: 2px solid #e3dcf5;
  border-radius: 16px;
  background: repeating-linear-gradient(45deg, #faf8ff, #faf8ff 12px, #f3eefc 12px, #f3eefc 24px);
  overflow: hidden;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (3 new tests), output pristine.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Pattern/pattern-table-view
git commit -m "59: Add read-only pattern-table-view component"
```

---

### Task 3: `PatternHeroComponent`

**Files:**
- Create: `fortunecards.client/src/app/components/Pattern/pattern-hero/pattern-hero.component.ts`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-hero/pattern-hero.component.html`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-hero/pattern-hero.component.css`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-hero/pattern-hero.component.spec.ts`

**Interfaces:**
- Consumes: `getDeckGradientStyle`, `getDeckShadowStyle` from `utils/deck-colors`.
- Produces: `PatternHeroComponent`, selector `app-pattern-hero`. Inputs: `name: string`, `emoji: string`, `description: string | null`, `cardCount: number`, `colorIndex: number`, `isOwner: boolean`, `isFavorite: boolean`, `isLoggedIn: boolean`. Outputs (all `output<void>()`): `usePattern`, `editPattern`, `editQuestions`, `toggleFavorite`.

- [ ] **Step 1: Write the failing test**

Create the spec file:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PatternHeroComponent } from './pattern-hero.component';

describe('PatternHeroComponent', () => {
  let fixture: ComponentFixture<PatternHeroComponent>;

  async function setup(over: Partial<{ isOwner: boolean; isFavorite: boolean; isLoggedIn: boolean }> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternHeroComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternHeroComponent);
    fixture.componentRef.setInput('name', 'Celtic Cross');
    fixture.componentRef.setInput('emoji', '🔮');
    fixture.componentRef.setInput('description', 'Ten positions');
    fixture.componentRef.setInput('cardCount', 10);
    fixture.componentRef.setInput('colorIndex', 0);
    fixture.componentRef.setInput('isOwner', over.isOwner ?? false);
    fixture.componentRef.setInput('isFavorite', over.isFavorite ?? false);
    fixture.componentRef.setInput('isLoggedIn', over.isLoggedIn ?? false);
    fixture.detectChanges();
  }

  function hero(): HTMLElement { return fixture.nativeElement.querySelector('.pattern-hero'); }

  it('renders emoji, name and meta, with the color gradient applied', async () => {
    await setup();
    expect(hero().textContent).toContain('🔮');
    expect(hero().textContent).toContain('Celtic Cross');
    expect(hero().textContent).toContain('Ten positions');
    const style = hero().getAttribute('style') ?? '';
    expect(style.includes('#B2FEFA') || style.includes('rgb(178, 254, 250)')).toBe(true);
  });

  it('always shows Use pattern and emits usePattern on click', async () => {
    await setup();
    const emit = vi.fn();
    fixture.componentInstance.usePattern.subscribe(emit);
    const btn = fixture.nativeElement.querySelector('.hero-use') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('owner sees Edit buttons that emit; no favourite', async () => {
    await setup({ isOwner: true, isLoggedIn: true });
    const editPattern = vi.fn();
    const editQuestions = vi.fn();
    fixture.componentInstance.editPattern.subscribe(editPattern);
    fixture.componentInstance.editQuestions.subscribe(editQuestions);
    (fixture.nativeElement.querySelector('.hero-edit-pattern') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.hero-edit-questions') as HTMLButtonElement).click();
    expect(editPattern).toHaveBeenCalledTimes(1);
    expect(editQuestions).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
  });

  it('logged-in non-owner sees a favourite toggle that emits; no Edit buttons', async () => {
    await setup({ isOwner: false, isLoggedIn: true });
    const fav = vi.fn();
    fixture.componentInstance.toggleFavorite.subscribe(fav);
    const btn = fixture.nativeElement.querySelector('.hero-fav') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(fav).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-edit-pattern')).toBeNull();
  });

  it('anonymous non-owner sees neither Edit nor favourite', async () => {
    await setup({ isOwner: false, isLoggedIn: false });
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-edit-pattern')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./pattern-hero.component`.

- [ ] **Step 3: Create the component**

`pattern-hero.component.ts`:

```typescript
import { Component, computed, input, output } from '@angular/core';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-pattern-hero',
  standalone: true,
  templateUrl: './pattern-hero.component.html',
  styleUrl: './pattern-hero.component.css',
})
export class PatternHeroComponent {
  readonly name = input.required<string>();
  readonly emoji = input.required<string>();
  readonly description = input<string | null>(null);
  readonly cardCount = input.required<number>();
  readonly colorIndex = input.required<number>();
  readonly isOwner = input.required<boolean>();
  readonly isFavorite = input.required<boolean>();
  readonly isLoggedIn = input.required<boolean>();

  readonly usePattern = output<void>();
  readonly editPattern = output<void>();
  readonly editQuestions = output<void>();
  readonly toggleFavorite = output<void>();

  readonly gradient = computed(() => getDeckGradientStyle(this.colorIndex()));
  readonly shadow = computed(() => getDeckShadowStyle(this.colorIndex()));
}
```

`pattern-hero.component.html`:

```html
<div class="pattern-hero" [style.background]="gradient()">
  <div class="hero-left">
    <span class="hero-emoji">{{ emoji() }}</span>
    <div class="hero-info">
      <h1 class="hero-name">{{ name() }}</h1>
      <p class="hero-meta">
        @if (description()) { <span>{{ description() }} · </span> }
        {{ cardCount() }} question{{ cardCount() === 1 ? '' : 's' }}
      </p>
    </div>
  </div>
  <div class="hero-actions">
    <button class="hero-btn hero-use" [style.background]="gradient()" (click)="usePattern.emit()">🔮 Use pattern</button>
    @if (isOwner()) {
      <button class="hero-btn hero-edit-pattern" [style.background]="gradient()" (click)="editPattern.emit()">✏️ Edit pattern</button>
      <button class="hero-btn hero-edit-questions" [style.background]="gradient()" (click)="editQuestions.emit()">📝 Edit questions</button>
    } @else if (isLoggedIn()) {
      <button class="hero-btn hero-fav"
              [class.is-fav]="isFavorite()"
              [attr.aria-pressed]="isFavorite()"
              [attr.aria-label]="isFavorite() ? 'Remove from favourites' : 'Add to favourites'"
              [style.background]="gradient()"
              (click)="toggleFavorite.emit()">{{ isFavorite() ? '★ Favourited' : '☆ Favourite' }}</button>
    }
  </div>
</div>
```

`pattern-hero.component.css` (mirrors the deck-hero styles):

```css
.pattern-hero {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: space-between;
}

.hero-left  { display: flex; align-items: center; gap: 16px; }
.hero-emoji { font-size: 48px; }
.hero-name  { font-size: 22px; font-weight: 800; color: white; text-align: left; }
.hero-meta  { font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 4px; }

.hero-actions {
  display: flex;
  gap: 8px;
  align-self: stretch;
  align-items: stretch;
  flex-wrap: wrap;
}

.hero-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  border: 4px solid rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: opacity 0.15s;
}

.hero-btn:hover { opacity: 0.85; }
.hero-fav.is-fav { color: #ffd54a; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (5 new tests), output pristine.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Pattern/pattern-hero
git commit -m "59: Add pattern-hero component"
```

---

### Task 4: `PatternDetailComponent`

**Files:**
- Create: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.ts`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.html`
- Create: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.css`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.spec.ts`

**Interfaces:**
- Consumes: `PatternHeroComponent` (Task 3), `PatternTableViewComponent` (Task 2), `PatternService.getPattern/addFavorite/removeFavorite`, `AuthService.isLoggedIn`, `NavigationBar`, `EditablePatternCard`/`Pattern` from `models/pattern`.
- Produces: `PatternDetailComponent` (route `patterns/:id`, Task 5). Public methods used by tests: `usePattern()`, `editPattern()`, `editQuestions()`, `goBack()`, `toggleFavorite()`, and signals `pattern`, `loading`, `error`, and `tableCards` (computed `EditablePatternCard[]`).

- [ ] **Step 1: Write the failing test**

Create the spec file:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { PatternDetailComponent } from './pattern-detail.component';
import { Pattern } from '../../../models/pattern';
import { AuthService } from '../../../services/auth.service';
import { PatternService } from '../../../services/pattern.service';

const mockPattern: Pattern = {
  id: 1, name: 'Celtic Cross', description: 'Ten positions', createdAt: '2026-01-01',
  emoji: '🔮', colorIndex: 0, isPublic: true, isOwner: false, isFavorite: false,
  cardSizePercent: 15, tableHeightPercent: 60,
  cards: [
    { id: 5, text: 'Present', order: 1, x: 10, y: 10, rotation: 0 },
    { id: 6, text: 'Challenge', order: 2, x: 30, y: 20, rotation: 90 },
  ],
};

describe('PatternDetailComponent', () => {
  let component: PatternDetailComponent;
  let fixture: ComponentFixture<PatternDetailComponent>;
  let service: { getPattern: any; addFavorite: any; removeFavorite: any };

  async function setup(getPattern = of(mockPattern)): Promise<void> {
    service = {
      getPattern: vi.fn(() => getPattern),
      addFavorite: vi.fn(() => of(void 0)),
      removeFavorite: vi.fn(() => of(void 0)),
    };
    await TestBed.configureTestingModule({
      imports: [PatternDetailComponent, CommonModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, currentUser: signal({ id: 2, displayName: 'U', email: 'u@e.com', avatarUrl: null }) } },
        { provide: PatternService, useValue: service },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('loads the pattern and renders its questions', async () => {
    await setup();
    expect(component.pattern()!.name).toBe('Celtic Cross');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Present');
    expect(text).toContain('Challenge');
  });

  it('maps pattern cards to editable-shaped table cards with string ids', async () => {
    await setup();
    expect(component.tableCards()).toEqual([
      { id: '5', text: 'Present', order: 1, x: 10, y: 10, rotation: 0 },
      { id: '6', text: 'Challenge', order: 2, x: 30, y: 20, rotation: 90 },
    ]);
  });

  it('renders the pattern-table-view', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('app-pattern-table-view')).not.toBeNull();
  });

  it('shows the page-end Edit button only to the owner', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    expect(fixture.nativeElement.querySelector('.edit-cta')).not.toBeNull();
  });

  it('hides the page-end Edit button for a non-owner', async () => {
    await setup(of({ ...mockPattern, isOwner: false }));
    expect(fixture.nativeElement.querySelector('.edit-cta')).toBeNull();
  });

  it('usePattern navigates to the table with the pattern query param', async () => {
    await setup();
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.usePattern();
    expect(nav).toHaveBeenCalledWith(['/table'], { queryParams: { pattern: 1 } });
  });

  it('editPattern and editQuestions navigate to the right routes', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.editPattern();
    expect(nav).toHaveBeenCalledWith(['/patterns', 1, 'edit']);
    component.editQuestions();
    expect(nav).toHaveBeenCalledWith(['/patterns', 1, 'cards']);
  });

  it('goBack returns to /patterns/mine for an owner and /patterns/search otherwise', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(nav).toHaveBeenCalledWith(['/patterns/mine']);
    component.pattern.set({ ...mockPattern, isOwner: false });
    component.goBack();
    expect(nav).toHaveBeenCalledWith(['/patterns/search']);
  });

  it('toggleFavorite flips isFavorite and calls the service', async () => {
    await setup(of({ ...mockPattern, isOwner: false, isFavorite: false }));
    component.toggleFavorite();
    expect(component.pattern()!.isFavorite).toBe(true);
    expect(service.addFavorite).toHaveBeenCalledWith(1);
  });

  it('reverts the favourite on service error', async () => {
    await setup(of({ ...mockPattern, isOwner: false, isFavorite: false }));
    service.addFavorite = vi.fn(() => throwError(() => new Error('nope')));
    component.toggleFavorite();
    expect(component.pattern()!.isFavorite).toBe(false);
  });

  it('shows an error state when the pattern fails to load', async () => {
    await setup(throwError(() => new Error('boom')));
    expect(component.error()).toBe('Failed to load pattern.');
    expect(fixture.nativeElement.querySelector('.state-error')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./pattern-detail.component`.

- [ ] **Step 3: Create the component**

`pattern-detail.component.ts`:

```typescript
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { PatternHeroComponent } from '../pattern-hero/pattern-hero.component';
import { PatternTableViewComponent } from '../pattern-table-view/pattern-table-view.component';
import { Pattern, EditablePatternCard } from '../../../models/pattern';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-pattern-detail',
  standalone: true,
  templateUrl: './pattern-detail.component.html',
  styleUrls: ['./pattern-detail.component.css'],
  imports: [CommonModule, NavigationBar, PatternHeroComponent, PatternTableViewComponent],
})
export class PatternDetailComponent implements OnInit {
  readonly pattern = signal<Pattern | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly tableCards = computed<EditablePatternCard[]>(() =>
    (this.pattern()?.cards ?? []).map((c, i) => ({
      id: String(c.id ?? i), text: c.text, order: c.order, x: c.x, y: c.y, rotation: c.rotation,
    }))
  );

  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patternService = inject(PatternService);

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.patternService.getPattern(Number(params['id']))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (pattern) => { this.pattern.set(pattern); this.loading.set(false); },
          error: () => { this.error.set('Failed to load pattern.'); this.loading.set(false); },
        });
    });
  }

  goBack(): void {
    this.router.navigate([this.pattern()?.isOwner ? '/patterns/mine' : '/patterns/search']);
  }

  usePattern(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/table'], { queryParams: { pattern: p.id } });
  }

  editPattern(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/patterns', p.id, 'edit']);
  }

  editQuestions(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/patterns', p.id, 'cards']);
  }

  toggleFavorite(): void {
    const p = this.pattern();
    if (!p) return;
    const next = !p.isFavorite;
    this.pattern.set({ ...p, isFavorite: next });
    const request = next ? this.patternService.addFavorite(p.id) : this.patternService.removeFavorite(p.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        const current = this.pattern();
        if (current) this.pattern.set({ ...current, isFavorite: !next });
      },
    });
  }
}
```

`pattern-detail.component.html`:

```html
<div class="page" *ngIf="pattern() as p; else loadingOrError">
  <navigation-bar>
    <div class="nav-actions">
      <button class="nav-back" (click)="goBack()">← Back</button>
      <span class="nav-sep">/</span>
      <span class="nav-crumb">{{ p.name }}</span>
    </div>
  </navigation-bar>

  <app-pattern-hero
    [name]="p.name"
    [emoji]="p.emoji"
    [description]="p.description"
    [cardCount]="(p.cards ?? []).length"
    [colorIndex]="p.colorIndex"
    [isOwner]="p.isOwner"
    [isFavorite]="p.isFavorite"
    [isLoggedIn]="auth.isLoggedIn()"
    (usePattern)="usePattern()"
    (editPattern)="editPattern()"
    (editQuestions)="editQuestions()"
    (toggleFavorite)="toggleFavorite()"
  ></app-pattern-hero>

  <main class="page-content">
    <h2 class="section-title">Questions</h2>
    <ol class="question-list" *ngIf="(p.cards ?? []).length > 0; else noQuestions">
      <li class="question-view-row" *ngFor="let c of (p.cards ?? [])">
        <span class="question-number">{{ c.order }}</span>
        <span class="question-view-text">{{ c.text }}</span>
      </li>
    </ol>
    <ng-template #noQuestions><p class="state-empty">No questions yet.</p></ng-template>

    <h2 class="section-title">Layout</h2>
    <app-pattern-table-view
      [cards]="tableCards()"
      [cardSizePercent]="p.cardSizePercent ?? 15"
      [tableHeightPercent]="p.tableHeightPercent ?? 60"
    ></app-pattern-table-view>

    <button *ngIf="p.isOwner" class="btn-primary btn-full edit-cta" (click)="editQuestions()">
      📝 Edit questions &amp; layout
    </button>
  </main>
</div>

<ng-template #loadingOrError>
  <div *ngIf="loading()" class="state-loading">Loading pattern…</div>
  <div *ngIf="error()" class="state-error">{{ error() }}</div>
</ng-template>
```

`pattern-detail.component.css`:

```css
.nav-sep   { color: var(--color-border); margin: 0 6px; }
.nav-crumb { font-size: 14px; font-weight: 800; color: var(--color-charcoal); }

.section-title { font-size: 15px; font-weight: 800; margin: 18px 0 12px; }

.question-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.question-view-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-cream, #faf8ff);
  border: 1px solid var(--color-border, #e3dcf5);
  border-radius: 12px;
}

.question-number {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #7b4397;
  color: #fff;
  font-weight: 800;
  font-size: 0.9rem;
}

.question-view-text { font-size: 0.95rem; color: var(--color-charcoal, #333); }

.edit-cta { margin-top: 16px; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (all pattern-detail tests), output pristine.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Pattern/pattern-detail
git commit -m "59: Add pattern-detail page"
```

---

### Task 5: Route + list navigation to the detail page

**Files:**
- Modify: `fortunecards.client/src/app/app.routes.ts`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-list/pattern-list.component.html:22-23`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-list/pattern-list.component.spec.ts`

**Interfaces:**
- Consumes: `PatternDetailComponent` (Task 4).
- Produces: `patterns/:id` route; list cards link to `['/patterns', id]` for all patterns.

- [ ] **Step 1: Write the failing test**

Add to `describe('PatternListComponent (mine)', …)` in the list spec:

```typescript
  it('links each pattern card to its detail page', async () => {
    await setup();
    const anchor = fixture.nativeElement.querySelector('.pattern-card') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/patterns/1');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — the owner card currently links to `/patterns/1/edit` (href mismatch).

- [ ] **Step 3: Update the list link**

In `pattern-list.component.html`, change the anchor's `routerLink` (line 22):

```html
          <a class="pattern-card" [routerLink]="['/patterns', p.id]"
             [style.background]="getGradient(p.colorIndex)" [style.boxShadow]="getShadow(p.colorIndex)">
```

- [ ] **Step 4: Add the route**

In `app.routes.ts`, add this route immediately **after** the `patterns/:id/cards` route and **before** the `table` route:

```typescript
  {
    path: 'patterns/:id',
    loadComponent: () => import('./components/Pattern/pattern-detail/pattern-detail.component').then((c) => c.PatternDetailComponent),
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS, including the new list test and all existing list tests.

- [ ] **Step 6: Verify the production build compiles**

Run: `cd fortunecards.client && ng build`
Expected: build succeeds (confirms the lazy route import path resolves).

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/app.routes.ts fortunecards.client/src/app/components/Pattern/pattern-list
git commit -m "59: Route pattern-list clicks to the detail page"
```

---

### Task 6: Table auto-load from `?pattern=<id>`

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.ts`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/table/table.component.spec.ts`

**Interfaces:**
- Consumes: `PatternService.getPattern`, `ActivatedRoute` (query params), existing `loadPattern(pattern: Pattern)`.
- Produces: on navigation to `/table?pattern=<id>`, the Table fetches the pattern and calls `loadPattern`. No new public API.

- [ ] **Step 1: Update the existing spec setup + add the failing test**

The Table now injects `PatternService` and `ActivatedRoute`, so the existing suite's `TestBed` must provide both (injecting the real `PatternService` would need `HttpClient`). Update the imports and the main `beforeEach` providers, and add a focused describe for the query-param path.

At the top of the spec, extend the imports:

```typescript
import { RouterModule, ActivatedRoute, convertToParamMap } from '@angular/router';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
```

In the **main** `beforeEach` providers array, add:

```typescript
        { provide: PatternService, useValue: { getPattern: vi.fn(() => of(null)) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
```

Then add a new top-level `describe` (sibling to `describe('TableComponent', …)`):

```typescript
describe('TableComponent pattern query-param auto-load', () => {
  const mockPattern: Pattern = {
    id: 7, name: 'Spread', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: true, isOwner: true, isFavorite: false, cardSizePercent: 20, tableHeightPercent: 70,
    cards: [
      { id: 1, text: 'Q1', order: 1, x: 10, y: 10, rotation: 0 },
      { id: 2, text: 'Q2', order: 2, x: 40, y: 20, rotation: 0 },
    ],
  };

  async function setup(queryPattern: string | null): Promise<TableComponent> {
    const query = queryPattern === null ? {} : { pattern: queryPattern };
    const patternService = { getPattern: vi.fn(() => of(mockPattern)) };
    await TestBed.configureTestingModule({
      imports: [TableComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn: signal(false), currentUser: signal(null), login: vi.fn(), logout: vi.fn() } },
        { provide: DeckService, useValue: { getDeck: () => of(null), getMyDecks: () => of([]), getPublicDecks: () => of({ items: [], totalCount: 0, page: 1, pageSize: 12 }) } },
        { provide: PatternService, useValue: patternService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TableComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads the pattern named by ?pattern=<id> onto the table', async () => {
    const component = await setup('7');
    expect(component.patternCards().length).toBe(2);
    expect(component.cardSizePercent()).toBe(20);
  });

  it('loads nothing when no pattern query param is present', async () => {
    const component = await setup(null);
    expect(component.patternCards().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: the two new auto-load tests FAIL (`patternCards` stays empty — no query-param handling yet). The existing Table tests should still pass with the added providers.

- [ ] **Step 3: Implement the query-param auto-load**

In `table.component.ts`, add the imports and `OnInit`:

```typescript
import { AfterViewInit, Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PatternService } from '../../../services/pattern.service';
```

Change the class declaration to also implement `OnInit`:

```typescript
export class TableComponent implements OnInit, AfterViewInit {
```

Add the two injections near the existing `destroyRef` field:

```typescript
  private readonly route = inject(ActivatedRoute);
  private readonly patternService = inject(PatternService);
```

Add `ngOnInit` (place it just above `ngAfterViewInit`):

```typescript
  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('pattern'));
    if (id > 0) {
      this.patternService.getPattern(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (pattern) => this.loadPattern(pattern), error: () => {} });
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — both new auto-load tests and the full existing suite, output pristine.

- [ ] **Step 5: Verify the production build compiles**

Run: `cd fortunecards.client && ng build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/table
git commit -m "59: Auto-load a pattern onto the Table from ?pattern query param"
```

---

## Notes for the implementer

- The whole feature is frontend-only. There are **no** backend or migration steps.
- After the final task, run `cd fortunecards.client && ng test --watch=false` once more for a clean full-suite pass, and `ng build` for a production compile check.
- `takeUntilDestroyed(this.destroyRef)` is passed the explicit `DestroyRef` so it works inside nested subscribe callbacks (outside an injection context) — mirror `deck-detail.component.ts` exactly; don't drop the argument.
