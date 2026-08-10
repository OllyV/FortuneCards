# Resilient Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survive backend cold starts by retrying transient GET failures, and replace plain-text loading/error with skeleton placeholders and a shared "Try again" error state on the main browse/detail pages.

**Architecture:** A global functional HTTP retry interceptor (registered in `main.ts`) retries transient GETs with exponential backoff. Shared standalone skeleton + error-state components are consumed by deck-list, pattern-list, deck-detail, and pattern-detail. Detail pages get a small `load(id)`/`retry()` refactor that also resets loading/error on an in-place `:id` change.

**Tech Stack:** Angular 21 (standalone, signals, functional HTTP interceptors, `input`/`output`), rxjs (`retry`, `timer`), Vitest.

## Global Constraints

- All components are standalone; register them (and any standalone child they render) in `TestBed` via `imports:`, never `declarations:`.
- Tests run under Vitest with `provideZonelessChangeDetection()`; set inputs via `fixture.componentRef.setInput(...)`; all specs compile as one bundle — a type error in any spec fails the whole run.
- Components using `*ngIf`/`*ngFor` import `CommonModule`; newer ones use `@if`/`@for` and don't.
- Retry policy: **GET only**; transient statuses are `0, 408, 502, 503, 504`; **4 retries**; backoff `RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]` ms. Non-GET and non-transient errors are never retried.
- Skeleton animation must be disabled under `@media (prefers-reduced-motion: reduce)`.
- Run the frontend suite from `fortunecards.client/` with `ng test --watch=false`; run `ng build` where a task says to.

---

### Task 1: HTTP retry interceptor

**Files:**
- Create: `fortunecards.client/src/app/services/http/retry.interceptor.ts`
- Create: `fortunecards.client/src/app/services/http/retry.interceptor.spec.ts`
- Modify: `fortunecards.client/src/main.ts`

**Interfaces:**
- Consumes: nothing internal.
- Produces: `retryInterceptor: HttpInterceptorFn` and `export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]`. Registered via `withInterceptors([retryInterceptor])`.

- [ ] **Step 1: Write the failing test**

Create `retry.interceptor.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { retryInterceptor, RETRY_DELAYS_MS } from './retry.interceptor';

describe('retryInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([retryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    ctrl.verify();
  });

  it('retries a transient 503 GET after the first backoff and then succeeds', async () => {
    let result: unknown;
    http.get('/api/x').subscribe((r) => (result = r));
    ctrl.expectOne('/api/x').flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    ctrl.expectOne('/api/x').flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('does not retry a 404 GET', async () => {
    let status: number | undefined;
    http.get('/api/x').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('nope', { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });

  it('does not retry a non-GET request', async () => {
    let status: number | undefined;
    http.post('/api/x', {}).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    expect(status).toBe(503);
  });

  it('gives up after 4 retries and surfaces the error', async () => {
    let status: number | undefined;
    http.get('/api/x').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('e', { status: 503, statusText: 'x' }); // initial
    for (const delay of RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay);
      ctrl.expectOne('/api/x').flush('e', { status: 503, statusText: 'x' });
    }
    expect(status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./retry.interceptor`.

- [ ] **Step 3: Create the interceptor**

`retry.interceptor.ts`:

```typescript
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';

/** Exponential backoff between GET retries, in ms. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/** Statuses that indicate a transient failure worth retrying (incl. cold start). */
const TRANSIENT_STATUSES = new Set([0, 408, 502, 503, 504]);

/**
 * Retries transient GET failures with exponential backoff so the app survives
 * backend cold starts. Non-GET requests and non-transient errors pass straight
 * through (no duplicated writes, no pointless waiting on real 4xx/500).
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);
  return next(req).pipe(
    retry({
      count: RETRY_DELAYS_MS.length,
      delay: (error, retryCount) => {
        if (!(error instanceof HttpErrorResponse) || !TRANSIENT_STATUSES.has(error.status)) {
          throw error;
        }
        return timer(RETRY_DELAYS_MS[retryCount - 1]);
      },
    }),
  );
};
```

- [ ] **Step 4: Register it in `main.ts`**

Change the `provideHttpClient()` line. Update the import and the provider:

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { retryInterceptor } from './app/services/http/retry.interceptor';
```

```typescript
    provideHttpClient(withInterceptors([retryInterceptor])),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (4 interceptor tests), no regressions, output pristine.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/services/http fortunecards.client/src/main.ts
git commit -m "60: Add transient-GET retry interceptor with backoff"
```

---

### Task 2: Shared skeleton components

**Files:**
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton.component.ts`
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton.component.css`
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton-card-grid.component.ts`
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton-card-grid.component.css`
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton-detail.component.ts`
- Create: `fortunecards.client/src/app/components/shared/skeleton/skeleton-detail.component.css`
- Test: `fortunecards.client/src/app/components/shared/skeleton/skeleton.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SkeletonComponent` — selector `app-skeleton`, inputs `width` (default `'100%'`), `height` (default `'1rem'`), `radius` (default `'8px'`). Renders one shimmer box.
  - `SkeletonCardGridComponent` — selector `app-skeleton-card-grid`, input `count` (default `8`). Renders `count` shimmer tiles in a responsive grid.
  - `SkeletonDetailComponent` — selector `app-skeleton-detail`, no inputs. Renders a hero bar + line placeholders + one large block.

- [ ] **Step 1: Write the failing test**

Create `skeleton.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';
import { SkeletonCardGridComponent } from './skeleton-card-grid.component';
import { SkeletonDetailComponent } from './skeleton-detail.component';

describe('Skeleton components', () => {
  it('SkeletonComponent renders a shimmer box with the given dimensions', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture: ComponentFixture<SkeletonComponent> = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('width', '50%');
    fixture.componentRef.setInput('height', '20px');
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('.skeleton') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.width).toBe('50%');
    expect(box.style.height).toBe('20px');
  });

  it('SkeletonCardGridComponent renders `count` tiles', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonCardGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SkeletonCardGridComponent);
    fixture.componentRef.setInput('count', 5);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-skeleton').length).toBe(5);
  });

  it('SkeletonDetailComponent renders a hero bar and a large block', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonDetailComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SkeletonDetailComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-skeleton').length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./skeleton.component`.

- [ ] **Step 3: Create `SkeletonComponent`**

`skeleton.component.ts`:

```typescript
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `<span class="skeleton" [style.width]="width()" [style.height]="height()" [style.borderRadius]="radius()"></span>`,
  styleUrl: './skeleton.component.css',
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly radius = input('8px');
}
```

`skeleton.component.css`:

```css
:host { display: block; }

.skeleton {
  display: block;
  background: linear-gradient(90deg, #ece8f5 25%, #f6f3fc 37%, #ece8f5 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

@keyframes skeleton-shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
```

- [ ] **Step 4: Create `SkeletonCardGridComponent`**

`skeleton-card-grid.component.ts`:

```typescript
import { Component, computed, input } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-skeleton-card-grid',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="skeleton-grid" aria-hidden="true">
      @for (i of tiles(); track i) {
        <app-skeleton height="100%" radius="var(--radius-lg)" />
      }
    </div>
  `,
  styleUrl: './skeleton-card-grid.component.css',
})
export class SkeletonCardGridComponent {
  readonly count = input(8);
  readonly tiles = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}
```

`skeleton-card-grid.component.css`:

```css
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (min-width: 768px) {
  .skeleton-grid { grid-template-columns: repeat(4, 1fr); }
}

.skeleton-grid app-skeleton { aspect-ratio: 1; }
```

- [ ] **Step 5: Create `SkeletonDetailComponent`**

`skeleton-detail.component.ts`:

```typescript
import { Component } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-skeleton-detail',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="skeleton-detail" aria-hidden="true">
      <app-skeleton class="sk-hero" height="88px" radius="0" />
      <div class="sk-body">
        <app-skeleton width="40%" height="1.1rem" />
        <app-skeleton width="90%" height="1rem" />
        <app-skeleton width="80%" height="1rem" />
        <app-skeleton width="85%" height="1rem" />
        <app-skeleton class="sk-block" height="220px" radius="16px" />
      </div>
    </div>
  `,
  styleUrl: './skeleton-detail.component.css',
})
export class SkeletonDetailComponent {}
```

`skeleton-detail.component.css`:

```css
.sk-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sk-block { margin-top: 8px; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (3 skeleton tests), no regressions, output pristine.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/shared/skeleton
git commit -m "60: Add shared skeleton loading components"
```

---

### Task 3: Shared error-state component

**Files:**
- Create: `fortunecards.client/src/app/components/shared/error-state/error-state.component.ts`
- Create: `fortunecards.client/src/app/components/shared/error-state/error-state.component.css`
- Test: `fortunecards.client/src/app/components/shared/error-state/error-state.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ErrorStateComponent` — selector `app-error-state`, input `message = input.required<string>()`, output `retry = output<void>()`. Renders the message and a "Try again" button that emits `retry`.

- [ ] **Step 1: Write the failing test**

Create `error-state.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ErrorStateComponent } from './error-state.component';

describe('ErrorStateComponent', () => {
  let fixture: ComponentFixture<ErrorStateComponent>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ErrorStateComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('message', 'Failed to load.');
    fixture.detectChanges();
  }

  it('renders the message', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('Failed to load.');
  });

  it('emits retry when the button is clicked', async () => {
    await setup();
    const emit = vi.fn();
    fixture.componentInstance.retry.subscribe(emit);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot resolve `./error-state.component`.

- [ ] **Step 3: Create the component**

`error-state.component.ts`:

```typescript
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <div class="error-state" role="alert">
      <p class="error-message">{{ message() }}</p>
      <button type="button" class="btn-primary" (click)="retry.emit()">Try again</button>
    </div>
  `,
  styleUrl: './error-state.component.css',
})
export class ErrorStateComponent {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
```

`error-state.component.css`:

```css
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.error-message {
  font-size: 14px;
  color: var(--color-muted);
  font-weight: 600;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS (2 error-state tests), no regressions, output pristine.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/shared/error-state
git commit -m "60: Add shared error-state component with retry"
```

---

### Task 4: Wire skeleton + error-state into the list pages

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.html:25-30`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-list/pattern-list.component.ts`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-list/pattern-list.component.html:13-18`
- Test: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.spec.ts`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-list/pattern-list.component.spec.ts`

**Interfaces:**
- Consumes: `SkeletonCardGridComponent` (Task 2), `ErrorStateComponent` (Task 3). Both list components already expose public load methods: `DeckListComponent.loadDecks()` and `PatternListComponent.load()`.
- Produces: no new interface.

- [ ] **Step 1: Write the failing tests**

Add to `deck-list.component.spec.ts` — first extend the imports line at the top:

```typescript
import { of, Subject, throwError } from 'rxjs';
```

Then add this describe block (sibling to the existing ones, inside the top-level `describe('DeckListComponent', …)`):

```typescript
  describe('loading + error UI', () => {
    it('shows the skeleton grid while loading', () => {
      const svc = configure('mine');
      const gate = new Subject<Deck[]>();
      svc.getMyDecks.mockReturnValue(gate);
      fixture = TestBed.createComponent(DeckListComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-skeleton-card-grid')).not.toBeNull();
      gate.next([ownedDeck]);
      gate.complete();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-skeleton-card-grid')).toBeNull();
    });

    it('shows the error state and retries when "Try again" is clicked', () => {
      const svc = configure('mine');
      svc.getMyDecks.mockReturnValueOnce(throwError(() => new Error('cold')));
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
      svc.getMyDecks.mockReturnValue(of([ownedDeck]));
      (fixture.nativeElement.querySelector('app-error-state button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-error-state')).toBeNull();
      expect(component.decks().map((d) => d.id)).toEqual([1]);
    });
  });
```

Add to `pattern-list.component.spec.ts` inside `describe('PatternListComponent (mine)', …)`:

```typescript
  it('shows the error state and retries when "Try again" is clicked', async () => {
    const { service } = await setup();
    service.getMyPatterns.mockReturnValueOnce(of([])); // ensure a clean reload result
    // Force an error state, then verify retry re-invokes the loader.
    fixture.componentInstance.error.set('Failed to load patterns.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
    const spy = vi.spyOn(fixture.componentInstance, 'load');
    (fixture.nativeElement.querySelector('app-error-state button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `app-skeleton-card-grid` / `app-error-state` are unknown elements (not imported / template not updated).

- [ ] **Step 3: Update `DeckListComponent`**

In `deck-list.component.ts`, add the imports and register them:

```typescript
import { SkeletonCardGridComponent } from '../../shared/skeleton/skeleton-card-grid.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
```

```typescript
  imports: [RouterLink, NavigationBar, PaginationComponent, SkeletonCardGridComponent, ErrorStateComponent],
```

In `deck-list.component.html`, replace the loading + error blocks (lines 25-30):

```html
    @if (loading() && decks().length === 0) {
      <app-skeleton-card-grid />
    }
    @if (error()) {
      <app-error-state [message]="error()!" (retry)="loadDecks()" />
    }
```

- [ ] **Step 4: Update `PatternListComponent`**

In `pattern-list.component.ts`, add the imports and register them:

```typescript
import { SkeletonCardGridComponent } from '../../shared/skeleton/skeleton-card-grid.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
```

```typescript
  imports: [RouterLink, NavigationBar, PaginationComponent, SkeletonCardGridComponent, ErrorStateComponent],
```

In `pattern-list.component.html`, replace the loading + error branches (lines 13-18) — keep the empty/grid branches unchanged:

```html
    @if (loading()) {
      <app-skeleton-card-grid />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="load()" />
    } @else if (patterns().length === 0) {
      <p class="state-empty">No patterns yet.</p>
    } @else {
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS, including the new list tests and all existing list tests, output pristine.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-list fortunecards.client/src/app/components/Pattern/pattern-list
git commit -m "60: Use skeleton + error-state on the list pages"
```

---

### Task 5: Wire skeleton + error-state into the detail pages (with load/retry refactor)

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.ts`
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html:62-65`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.ts`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.html:48-51`
- Test: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`
- Test: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.spec.ts`

**Interfaces:**
- Consumes: `SkeletonDetailComponent` (Task 2), `ErrorStateComponent` (Task 3).
- Produces: both detail components gain public `load(id: number)` and `retry()` methods; the `route.params` callback now resets `loading`/`error` (via `load`).

- [ ] **Step 1: Write the failing tests**

In `deck-detail.component.spec.ts`, add these tests inside the top-level `describe('DeckDetailComponent', …)` (the existing `beforeEach` provides a loaded component with `route.params` = `of({ id: '1' })`):

```typescript
  it('shows the skeleton-detail while loading', () => {
    component.deck.set(null);
    component.loading.set(true);
    component.error.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-skeleton-detail')).not.toBeNull();
  });

  it('shows app-error-state on error and retry() reloads', () => {
    component.deck.set(null);
    component.loading.set(false);
    component.error.set('Failed to load deck.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
    const spy = vi.spyOn(component, 'load');
    (fixture.nativeElement.querySelector('app-error-state button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(1);
  });
```

In `pattern-detail.component.spec.ts`:

First, **update the existing error test** (currently asserts `.state-error`) at the "shows an error state when the pattern fails to load" test — change its last assertion line:

```typescript
    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
```

Then add the import for `Subject` (extend the existing rxjs import):

```typescript
import { of, throwError, Subject } from 'rxjs';
```

And add these tests inside `describe('PatternDetailComponent', …)`:

```typescript
  it('shows the skeleton-detail while loading', async () => {
    await setup();
    component.pattern.set(null);
    component.loading.set(true);
    component.error.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-skeleton-detail')).not.toBeNull();
  });

  it('error state retry() reloads via the service', async () => {
    await setup();
    component.pattern.set(null);
    component.loading.set(false);
    component.error.set('Failed to load pattern.');
    fixture.detectChanges();
    const spy = vi.spyOn(component, 'load');
    (fixture.nativeElement.querySelector('app-error-state button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('resets loading and clears a stale error when the route id changes in place', async () => {
    const params = new Subject<{ id: string }>();
    service = { getPattern: vi.fn(() => of(mockPattern)), addFavorite: vi.fn(() => of(void 0)), removeFavorite: vi.fn(() => of(void 0)) };
    await TestBed.configureTestingModule({
      imports: [PatternDetailComponent, CommonModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, currentUser: signal({ id: 2, displayName: 'U', email: 'u@e.com', avatarUrl: null }) } },
        { provide: PatternService, useValue: service },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    params.next({ id: '1' });
    component.error.set('stale');
    component.loading.set(false);

    const gate = new Subject<Pattern>();
    service.getPattern.mockReturnValue(gate);
    params.next({ id: '2' });

    expect(component.loading()).toBe(true);
    expect(component.error()).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `app-skeleton-detail`/`app-error-state` unknown, `component.load` not a function, and the in-place reset assertion fails (state not reset yet).

- [ ] **Step 3: Refactor `DeckDetailComponent`**

In `deck-detail.component.ts`, add the imports and register them:

```typescript
import { SkeletonDetailComponent } from '../../shared/skeleton/skeleton-detail.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
```

```typescript
  imports: [CommonModule, NavigationBar, SkeletonDetailComponent, ErrorStateComponent]
```

Add a `currentId` field and replace `ngOnInit` with a `load`/`retry` pair (keep everything else — `getDeckGradient`, `toggleFavorite`, etc. — unchanged):

```typescript
  private currentId = 0;

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.load(Number(params['id']));
    });
  }

  load(id: number): void {
    this.currentId = id;
    this.loading.set(true);
    this.error.set(null);
    this.deckService.getDeck(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deck) => { this.deck.set(deck); this.loading.set(false); },
        error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); },
      });
  }

  retry(): void {
    this.load(this.currentId);
  }
```

In `deck-detail.component.html`, replace the `#loadingOrError` template (lines 62-65):

```html
<ng-template #loadingOrError>
  <app-skeleton-detail *ngIf="loading()" />
  <app-error-state *ngIf="error()" [message]="error()!" (retry)="retry()" />
</ng-template>
```

- [ ] **Step 4: Refactor `PatternDetailComponent`**

In `pattern-detail.component.ts`, add the imports and register them:

```typescript
import { SkeletonDetailComponent } from '../../shared/skeleton/skeleton-detail.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
```

```typescript
  imports: [CommonModule, NavigationBar, PatternHeroComponent, PatternTableViewComponent, SkeletonDetailComponent, ErrorStateComponent],
```

Add a `currentId` field and replace `ngOnInit` with a `load`/`retry` pair (keep `goBack`, `usePattern`, `editPattern`, `editQuestions`, `toggleFavorite`, `tableCards` unchanged):

```typescript
  private currentId = 0;

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.load(Number(params['id']));
    });
  }

  load(id: number): void {
    this.currentId = id;
    this.loading.set(true);
    this.error.set(null);
    this.patternService.getPattern(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pattern) => { this.pattern.set(pattern); this.loading.set(false); },
        error: () => { this.error.set('Failed to load pattern.'); this.loading.set(false); },
      });
  }

  retry(): void {
    this.load(this.currentId);
  }
```

In `pattern-detail.component.html`, replace the `#loadingOrError` template (lines 48-51):

```html
<ng-template #loadingOrError>
  <app-skeleton-detail *ngIf="loading()" />
  <app-error-state *ngIf="error()" [message]="error()!" (retry)="retry()" />
</ng-template>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — the new detail tests, the updated error assertion, and all existing detail tests (the navigation/favorite/hero tests are unaffected by the `load` refactor), output pristine.

- [ ] **Step 6: Verify the production build compiles**

Run: `cd fortunecards.client && ng build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-detail fortunecards.client/src/app/components/Pattern/pattern-detail
git commit -m "60: Use skeleton + error-state on the detail pages; reset state on in-place id change"
```

---

## Notes for the implementer

- The whole feature is frontend-only; there are **no** backend or migration steps.
- The interceptor test relies on vitest fake timers driving rxjs `timer`; call `vi.useFakeTimers()` before issuing the request and advance by the exact `RETRY_DELAYS_MS[n]` between flushes (as the test code shows). If a genuine environment issue makes fake timers unreliable here, report it as DONE_WITH_CONCERNS rather than weakening the assertions.
- Do not drop the explicit `this.destroyRef` argument to `takeUntilDestroyed` in the detail refactor — the subscription callback runs outside an injection context.
- After the final task, run `cd fortunecards.client && ng test --watch=false` and `ng build` once more for a clean confirmation.
