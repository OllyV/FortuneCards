# Profile Page Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the profile page into a route-based tabbed shell (Decks, Patterns, Comments, Account settings), each tab a focused component loading its own data.

**Architecture:** `ProfileComponent` becomes a thin shell (nav bar + persistent header + tab bar + `<router-outlet>`); four child routes under `/profile` render the tab panels. Three new small components (decks/patterns/comments) plus the existing `AccountSettingsComponent` (refactored to drop its own nav bar) fill the outlet.

**Tech Stack:** Angular 21 standalone components + signals, Angular Router (child routes, `routerLink`/`routerLinkActive`), Transloco i18n, Vitest.

## Global Constraints

- Angular standalone components; state via `signal()`; register components/directives in `@Component.imports` (never `declarations`).
- Control flow uses `@if`/`@for` (no `CommonModule` needed unless `*ngIf`/`*ngFor` is used).
- Templates use `*transloco="let t"` for i18n; every user-facing string is a Transloco key.
- Vitest specs compile as ONE bundle — a type error in any spec fails the whole run. Specs use `provideZonelessChangeDetection()`; components that use Router in tests import `RouterModule.forRoot([])`; the Transloco test module is `getTranslocoTestingModule()` from `src/testing/transloco-testing` (path from `pages/profile/tabs/*` is `../../../../testing/transloco-testing`; from `pages/profile/*` is `../../../testing/transloco-testing`).
- Style with design tokens from `src/styles/design-system.css` (`--color-coral`, `--color-sunny`, `--color-cream`, `--color-charcoal`, `--color-border`, `--color-border-light`, `--color-label`, `--color-muted`, `--color-coral-wash`, `--color-coral-ink`, `--font`, `--radius-md`, `--radius-pill`, `--shadow-card`). Reuse the global `.btn-primary` class (coral→sunny gradient pill) for primary buttons. No legacy hardcoded dark colors.
- Deck AND pattern cards use `getDeckGradientStyle(colorIndex)` from `utils/deck-colors` for their background.
- `PatternService.getMyPatterns()` and `DeckService.getMyDecks()` both return owned + favorited items; filter to `isOwner` for the profile.
- Run the whole frontend suite with `cd fortunecards.client && ng test --watch=false`; it must stay green (currently 294) and pristine (no NG8107; only use `?.` on genuinely nullable values).

---

## File Structure

New (each one responsibility):
- `pages/profile/tabs/profile-decks.component.{ts,html,css,spec.ts}` — my decks grid + add-tile.
- `pages/profile/tabs/profile-patterns.component.{ts,html,css,spec.ts}` — my patterns grid + add-tile.
- `pages/profile/tabs/profile-comments.component.{ts,html,css,spec.ts}` — my comments list.

Modified:
- `pages/profile/profile.component.{ts,html,css,spec.ts}` — becomes the shell.
- `pages/account-settings/account-settings.component.html` — drop nav bar + back button.
- `pages/account-settings/account-settings.component.ts` — drop the now-unused `NavigationBar` import.
- `app.routes.ts` — `/profile` gains children; standalone `/profile/settings` route folded in.
- `public/i18n/*.json` — tab labels + pattern title/button/error keys.

---

## Task 1: ProfileDecksComponent

**Files:**
- Create: `fortunecards.client/src/app/pages/profile/tabs/profile-decks.component.ts`
- Create: `.../profile-decks.component.html`
- Create: `.../profile-decks.component.css`
- Create: `.../profile-decks.component.spec.ts`

**Interfaces:**
- Consumes: `DeckService.getMyDecks(): Observable<Deck[]>`, `getDeckGradientStyle(colorIndex: number): string`.
- Produces: `ProfileDecksComponent` (selector `app-profile-decks`) with `readonly decks = signal<Deck[]>([])`, `loading`, `error` signals; methods `gradient(colorIndex)`, `newDeck()`, `openDeck(id)`.

- [ ] **Step 1: Write the failing spec**

`profile-decks.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileDecksComponent } from './profile-decks.component';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🎴', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

function render(svc: Partial<DeckService>) {
  TestBed.configureTestingModule({
    imports: [ProfileDecksComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: DeckService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfileDecksComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfileDecksComponent', () => {
  it('keeps only owned decks and renders a card each plus the add-tile', () => {
    const fixture = render({
      getMyDecks: vi.fn(() => of([deck({ id: 1, isOwner: true }), deck({ id: 2, isFavorite: true })])),
    });
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([1]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(1);
    expect(el.querySelector('.add')).not.toBeNull();
  });

  it('shows an error state when loading fails', () => {
    const fixture = render({ getMyDecks: vi.fn(() => throwError(() => new Error('x'))) });
    expect(fixture.componentInstance.error()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.state.error')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot find `./profile-decks.component`.

- [ ] **Step 3: Create `profile-decks.component.ts`**

```typescript
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-profile-decks',
  standalone: true,
  templateUrl: './profile-decks.component.html',
  styleUrl: './profile-decks.component.css',
  imports: [TranslocoDirective],
})
export class ProfileDecksComponent {
  private readonly deckService = inject(DeckService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.deckService.getMyDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => { this.decks.set(all.filter((d) => d.isOwner)); this.loading.set(false); },
        error: () => { this.error.set(this.transloco.translate('errors.decksLoadFailed')); this.loading.set(false); },
      });
  }

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  newDeck(): void { this.router.navigate(['/decks/new']); }
  openDeck(id: number): void { this.router.navigate(['/decks', id]); }
}
```

- [ ] **Step 4: Create `profile-decks.component.html`**

```html
<ng-container *transloco="let t">
  <div class="tab-head">
    <h2>{{ t('pages.myDecksTitle') }}</h2>
    <button class="btn-primary" (click)="newDeck()">{{ t('pages.newDeckButton') }}</button>
  </div>

  @if (loading()) {
    <p class="state">{{ t('pages.loadingDecksState') }}</p>
  } @else if (error()) {
    <p class="state error">{{ error() }}</p>
  } @else {
    <div class="grid">
      @for (deck of decks(); track deck.id) {
        <div class="card" [style.background]="gradient(deck.colorIndex)" (click)="openDeck(deck.id)">
          <span class="emoji">{{ deck.emoji }}</span>
          <span class="name">{{ deck.name }}</span>
          <span class="badge" [class.public]="deck.isPublic" [class.private]="!deck.isPublic">
            {{ deck.isPublic ? t('pages.publicBadge') : t('pages.privateBadge') }}
          </span>
        </div>
      }
      <div class="add" (click)="newDeck()">+</div>
    </div>
  }
</ng-container>
```

- [ ] **Step 5: Create `profile-decks.component.css`**

```css
.tab-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-head h2 { margin: 0; font-size: 18px; font-weight: 800; }
.grid { display: flex; flex-wrap: wrap; gap: 14px; }
.card { width: 140px; border-radius: var(--radius-md); padding: 14px; cursor: pointer;
  display: flex; flex-direction: column; gap: 6px; transition: transform .15s; box-shadow: var(--shadow-card); }
.card:hover { transform: translateY(-2px); }
.emoji { font-size: 22px; }
.name { font-size: 13px; font-weight: 800; color: #2C2C2C; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: var(--radius-pill); font-weight: 700; width: fit-content; }
.badge.public { background: #E7F7EC; color: #1E7A3F; }
.badge.private { background: var(--color-coral-wash); color: var(--color-coral-ink); }
.add { width: 140px; min-height: 88px; border-radius: var(--radius-md); border: 2px dashed var(--color-border-light);
  display: flex; align-items: center; justify-content: center; font-size: 28px; color: var(--color-muted); cursor: pointer; }
.add:hover { border-color: var(--color-coral); color: var(--color-coral); }
.state { color: var(--color-label); font-size: 14px; }
.state.error { color: var(--color-coral); }
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS; whole run green.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/tabs/profile-decks.component.*
git commit -m "71: ProfileDecksComponent (my decks tab)"
```

---

## Task 2: ProfilePatternsComponent

**Files:**
- Create: `fortunecards.client/src/app/pages/profile/tabs/profile-patterns.component.ts`
- Create: `.../profile-patterns.component.html`
- Create: `.../profile-patterns.component.css`
- Create: `.../profile-patterns.component.spec.ts`
- Modify: `fortunecards.client/public/i18n/*.json` (7 files)

**Interfaces:**
- Consumes: `PatternService.getMyPatterns(): Observable<Pattern[]>`, `getDeckGradientStyle(colorIndex)`.
- Produces: `ProfilePatternsComponent` (selector `app-profile-patterns`) with `patterns`, `loading`, `error` signals; `gradient()`, `newPattern()`, `openPattern(id)`.

- [ ] **Step 1: Add i18n keys**

In `public/i18n/en.json`, inside the existing `pages` object add:

```json
    "myPatternsTitle": "My patterns",
    "newPatternButton": "New pattern",
    "loadingPatternsState": "Loading patterns…",
```

In `public/i18n/en.json`, inside the existing `errors` object add:

```json
    "patternsLoadFailed": "Couldn't load your patterns.",
```

Copy these same four keys (identical English values) into the `pages` / `errors` objects of `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, `uk.json` (deferred-translation convention — other locales copy English).

- [ ] **Step 2: Write the failing spec**

`profile-patterns.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfilePatternsComponent } from './profile-patterns.component';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function pattern(over: Partial<Pattern>): Pattern {
  return {
    id: 1, name: 'P', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: false, isOwner: false, isFavorite: false, cardSizePercent: 15, tableHeightPercent: 60, cards: [], ...over,
  };
}

function render(svc: Partial<PatternService>) {
  TestBed.configureTestingModule({
    imports: [ProfilePatternsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: PatternService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfilePatternsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfilePatternsComponent', () => {
  it('keeps only owned patterns and renders a card each plus the add-tile', () => {
    const fixture = render({
      getMyPatterns: vi.fn(() => of([pattern({ id: 1, isOwner: true }), pattern({ id: 2, isFavorite: true })])),
    });
    expect(fixture.componentInstance.patterns().map((p) => p.id)).toEqual([1]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(1);
    expect(el.querySelector('.add')).not.toBeNull();
  });

  it('shows the empty state when there are no owned patterns', () => {
    const fixture = render({ getMyPatterns: vi.fn(() => of([])) });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(0);
    expect(el.querySelector('.add')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot find `./profile-patterns.component`.

- [ ] **Step 4: Create `profile-patterns.component.ts`**

```typescript
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-profile-patterns',
  standalone: true,
  templateUrl: './profile-patterns.component.html',
  styleUrl: './profile-patterns.component.css',
  imports: [TranslocoDirective],
})
export class ProfilePatternsComponent {
  private readonly patternService = inject(PatternService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly patterns = signal<Pattern[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.patternService.getMyPatterns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => { this.patterns.set(all.filter((p) => p.isOwner)); this.loading.set(false); },
        error: () => { this.error.set(this.transloco.translate('errors.patternsLoadFailed')); this.loading.set(false); },
      });
  }

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  newPattern(): void { this.router.navigate(['/patterns/new']); }
  openPattern(id: number): void { this.router.navigate(['/patterns', id]); }
}
```

- [ ] **Step 5: Create `profile-patterns.component.html`**

```html
<ng-container *transloco="let t">
  <div class="tab-head">
    <h2>{{ t('pages.myPatternsTitle') }}</h2>
    <button class="btn-primary" (click)="newPattern()">{{ t('pages.newPatternButton') }}</button>
  </div>

  @if (loading()) {
    <p class="state">{{ t('pages.loadingPatternsState') }}</p>
  } @else if (error()) {
    <p class="state error">{{ error() }}</p>
  } @else {
    <div class="grid">
      @for (pattern of patterns(); track pattern.id) {
        <div class="card" [style.background]="gradient(pattern.colorIndex)" (click)="openPattern(pattern.id)">
          <span class="emoji">{{ pattern.emoji }}</span>
          <span class="name">{{ pattern.name }}</span>
          <span class="badge" [class.public]="pattern.isPublic" [class.private]="!pattern.isPublic">
            {{ pattern.isPublic ? t('pages.publicBadge') : t('pages.privateBadge') }}
          </span>
        </div>
      }
      <div class="add" (click)="newPattern()">+</div>
    </div>
  }
</ng-container>
```

- [ ] **Step 6: Create `profile-patterns.component.css`** (identical card styling to the decks tab)

```css
.tab-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-head h2 { margin: 0; font-size: 18px; font-weight: 800; }
.grid { display: flex; flex-wrap: wrap; gap: 14px; }
.card { width: 140px; border-radius: var(--radius-md); padding: 14px; cursor: pointer;
  display: flex; flex-direction: column; gap: 6px; transition: transform .15s; box-shadow: var(--shadow-card); }
.card:hover { transform: translateY(-2px); }
.emoji { font-size: 22px; }
.name { font-size: 13px; font-weight: 800; color: #2C2C2C; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: var(--radius-pill); font-weight: 700; width: fit-content; }
.badge.public { background: #E7F7EC; color: #1E7A3F; }
.badge.private { background: var(--color-coral-wash); color: var(--color-coral-ink); }
.add { width: 140px; min-height: 88px; border-radius: var(--radius-md); border: 2px dashed var(--color-border-light);
  display: flex; align-items: center; justify-content: center; font-size: 28px; color: var(--color-muted); cursor: pointer; }
.add:hover { border-color: var(--color-coral); color: var(--color-coral); }
.state { color: var(--color-label); font-size: 14px; }
.state.error { color: var(--color-coral); }
```

- [ ] **Step 7: Run the spec + verify JSON valid**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS; whole run green.

- [ ] **Step 8: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/tabs/profile-patterns.component.* fortunecards.client/public/i18n/
git commit -m "71: ProfilePatternsComponent (my patterns tab) + i18n"
```

---

## Task 3: ProfileCommentsComponent

**Files:**
- Create: `fortunecards.client/src/app/pages/profile/tabs/profile-comments.component.ts`
- Create: `.../profile-comments.component.html`
- Create: `.../profile-comments.component.css`
- Create: `.../profile-comments.component.spec.ts`

**Interfaces:**
- Consumes: `CommentService.listMine(page, pageSize): Observable<PagedResult<MyCommentDto>>`, `Router.navigateByUrl(route)`.
- Produces: `ProfileCommentsComponent` (selector `app-profile-comments`) with `myComments = signal<MyCommentDto[]>([])`; `openComment(route)`.

- [ ] **Step 1: Write the failing spec**

`profile-comments.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfileCommentsComponent } from './profile-comments.component';
import { CommentService } from '../../../services/comment.service';
import { CommentTargetType, MyCommentDto } from '../../../models/comment';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function myComment(over: Partial<MyCommentDto>): MyCommentDto {
  return {
    id: 1, targetType: CommentTargetType.Deck, targetId: 5, body: 'nice', isDeleted: false,
    createdAt: '', editedAt: null, targetLabel: 'My Deck', targetRoute: '/decks/5', ...over,
  };
}

function render(svc: Partial<CommentService>) {
  TestBed.configureTestingModule({
    imports: [ProfileCommentsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: CommentService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfileCommentsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfileCommentsComponent', () => {
  it('lists my comments with a link to each target', () => {
    const fixture = render({
      listMine: vi.fn(() => of({ items: [myComment({ id: 1, targetLabel: 'My Deck' })], totalCount: 1, page: 1, pageSize: 20 })),
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('li').length).toBe(1);
    expect(el.querySelector('.link')!.textContent).toContain('My Deck');
  });

  it('shows the empty state when there are no comments', () => {
    const fixture = render({ listMine: vi.fn(() => of({ items: [], totalCount: 0, page: 1, pageSize: 20 })) });
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — cannot find `./profile-comments.component`.

- [ ] **Step 3: Create `profile-comments.component.ts`**

```typescript
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentService } from '../../../services/comment.service';
import { MyCommentDto } from '../../../models/comment';

@Component({
  selector: 'app-profile-comments',
  standalone: true,
  templateUrl: './profile-comments.component.html',
  styleUrl: './profile-comments.component.css',
  imports: [TranslocoDirective],
})
export class ProfileCommentsComponent {
  private readonly commentService = inject(CommentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly myComments = signal<MyCommentDto[]>([]);

  constructor() {
    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
  }

  openComment(route: string): void { this.router.navigateByUrl(route); }
}
```

- [ ] **Step 4: Create `profile-comments.component.html`**

```html
<ng-container *transloco="let t">
  <h2 class="tab-title">{{ t('comments.myComments') }}</h2>
  @if (myComments().length === 0) {
    <p class="empty">{{ t('comments.myCommentsEmpty') }}</p>
  } @else {
    <ul>
      @for (c of myComments(); track c.id) {
        <li>
          <button class="link" (click)="openComment(c.targetRoute)">{{ c.targetLabel }}</button>
          <span class="body">{{ c.isDeleted ? t('comments.deletedPlaceholder') : c.body }}</span>
        </li>
      }
    </ul>
  }
</ng-container>
```

- [ ] **Step 5: Create `profile-comments.component.css`**

```css
.tab-title { margin: 0 0 16px; font-size: 18px; font-weight: 800; }
.empty { color: var(--color-label); font-size: 14px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
li { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: #fff;
  border: 1.5px solid var(--color-border); border-radius: var(--radius-md); }
.link { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-family: var(--font); font-weight: 800; font-size: 13.5px; color: var(--color-coral-ink); }
.body { font-size: 14px; color: var(--color-charcoal); }
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS; whole run green.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/tabs/profile-comments.component.*
git commit -m "71: ProfileCommentsComponent (my comments tab)"
```

---

## Task 4: Refactor AccountSettingsComponent into a tab panel

**Files:**
- Modify: `fortunecards.client/src/app/pages/account-settings/account-settings.component.html`
- Modify: `fortunecards.client/src/app/pages/account-settings/account-settings.component.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AccountSettingsComponent` with the same public API (`nickname`, `save()`, `deleteAccount()`, `goBack()`, etc.) but no rendered nav bar / back button — it now lives inside the profile shell.

- [ ] **Step 1: Remove the nav bar + back button from `account-settings.component.html`**

Replace the top of the template (the `<navigation-bar></navigation-bar>` line and the `.settings-header` block containing the back button and page title) so the file begins its `<main>` directly. The full replacement for lines 1–8:

Change:

```html
<ng-container *transloco="let t">
<navigation-bar></navigation-bar>

<main class="settings-page">
  <div class="settings-header">
    <button class="back-btn" (click)="goBack()">← {{ t('common.back') }}</button>
    <h1>{{ t('pages.accountSettingsPageTitle') }}</h1>
  </div>
```

to:

```html
<ng-container *transloco="let t">
<main class="settings-page">
```

Leave the rest of the template (the three `<section class="settings-section">` blocks and the closing `</main></ng-container>`) unchanged. `goBack()` stays in the `.ts` (still referenced by nothing in the template now, but harmless and keeps the delete-account navigation logic intact — do not remove the method).

- [ ] **Step 2: Drop the unused `NavigationBar` import from `account-settings.component.ts`**

In the `@Component.imports` array change:

```typescript
  imports: [CommonModule, FormsModule, NavigationBar, TranslocoDirective],
```

to:

```typescript
  imports: [CommonModule, FormsModule, TranslocoDirective],
```

and remove the now-unused import line:

```typescript
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
```

- [ ] **Step 3: Run the tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS. The existing `account-settings.component.spec.ts` does not assert the nav bar or back button, so its save/photo/delete tests still pass. Output pristine.

- [ ] **Step 4: Commit**

```bash
git add fortunecards.client/src/app/pages/account-settings/account-settings.component.html fortunecards.client/src/app/pages/account-settings/account-settings.component.ts
git commit -m "71: AccountSettings becomes a tab panel (drop own nav bar)"
```

---

## Task 5: Profile shell + child routes + tab i18n

**Files:**
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.ts`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.html`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.css`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.spec.ts`
- Modify: `fortunecards.client/src/app/app.routes.ts`
- Modify: `fortunecards.client/public/i18n/*.json` (7 files)

**Interfaces:**
- Consumes: `ProfileDecksComponent`, `ProfilePatternsComponent`, `ProfileCommentsComponent` (Tasks 1–3), `AccountSettingsComponent` (Task 4), `AuthService.currentUser()`.
- Produces: `ProfileComponent` shell (header + tab bar + `<router-outlet>`); `/profile` route with four children + redirect.

- [ ] **Step 1: Add tab-label i18n keys**

In `public/i18n/en.json` add a new top-level `profile` object (alongside `pages`, `comments`, etc.):

```json
  "profile": {
    "tabs": {
      "decks": "Decks",
      "patterns": "Patterns",
      "comments": "Comments",
      "settings": "Settings"
    }
  },
```

Copy the same `profile` object (identical English values) into `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, `uk.json`.

- [ ] **Step 2: Rewrite `profile.component.spec.ts` to test the shell**

Replace the whole file with:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../services/auth.service';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing';

function renderWithUser(user: any) {
  TestBed.configureTestingModule({
    imports: [ProfileComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal(user) } },
    ],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProfileComponent (shell)', () => {
  it('renders the header, four tab links and a router outlet', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(el.querySelector('h1')!.textContent).toContain('Nick');
    expect(el.querySelector('.profile-email')!.textContent).toContain('t@e.com');
    expect(el.querySelectorAll('.tab').length).toBe(4);
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('renders the avatar image when avatarUrl is set, else the letter fallback', () => {
    const withImg = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: null, avatarUrl: 'https://img/x.png' });
    expect((withImg.querySelector('.profile-avatar-img') as HTMLImageElement | null)?.src).toContain('https://img/x.png');
    const withLetter = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(withLetter.querySelector('.profile-avatar-img')).toBeNull();
    expect(withLetter.querySelector('.profile-avatar')!.textContent).toContain('N');
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — the current `ProfileComponent` template has no `.tab` links / `router-outlet`.

- [ ] **Step 4: Rewrite `profile.component.ts` as the shell**

```typescript
import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  imports: [NavigationBar, TranslocoDirective, RouterOutlet, RouterLink, RouterLinkActive],
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  goBack(): void { this.router.navigate(['/decks']); }
}
```

- [ ] **Step 5: Rewrite `profile.component.html` as the shell**

```html
<ng-container *transloco="let t">
<navigation-bar>
  <button class="back-btn" (click)="goBack()">← {{ t('pages.decksLink') }}</button>
</navigation-bar>

<main class="profile-page">
  @if (auth.currentUser(); as user) {
    <section class="profile-header">
      <div class="profile-avatar">
        @if (user.avatarUrl) {
          <img class="profile-avatar-img" [src]="user.avatarUrl" [alt]="user.nickname || user.displayName" />
        } @else {
          {{ (user.nickname || user.displayName)[0] }}
        }
      </div>
      <div class="profile-info">
        <h1>{{ user.nickname || user.displayName }}</h1>
        <p class="profile-email">{{ user.email }}</p>
      </div>
    </section>
  }

  <nav class="tab-bar">
    <a class="tab" routerLink="decks" routerLinkActive="active">{{ t('profile.tabs.decks') }}</a>
    <a class="tab" routerLink="patterns" routerLinkActive="active">{{ t('profile.tabs.patterns') }}</a>
    <a class="tab" routerLink="comments" routerLinkActive="active">{{ t('profile.tabs.comments') }}</a>
    <a class="tab" routerLink="settings" routerLinkActive="active">{{ t('profile.tabs.settings') }}</a>
  </nav>

  <router-outlet></router-outlet>
</main>
</ng-container>
```

- [ ] **Step 6: Rewrite `profile.component.css` as the shell (brand-styled)**

```css
.back-btn { background: none; border: none; color: var(--color-muted); font-size: 14px;
  cursor: pointer; padding: 0; font-family: var(--font); }
.back-btn:hover { color: var(--color-charcoal); }

.profile-page { max-width: 860px; margin: 32px auto 60px; padding: 0 20px; }

.profile-header { display: flex; align-items: center; gap: 20px;
  padding-bottom: 20px; border-bottom: 1px solid var(--color-border); margin-bottom: 4px; }
.profile-avatar { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: 800;
  background: linear-gradient(135deg, var(--color-coral), var(--color-sunny)); }
.profile-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.profile-info h1 { margin: 0 0 4px; font-size: 22px; font-weight: 800; }
.profile-email { color: var(--color-label); margin: 0; font-size: 14px; }

.tab-bar { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--color-border);
  margin: 20px 0 24px; }
.tab { flex: 0 0 auto; padding: 10px 16px; font-family: var(--font); font-weight: 800; font-size: 14px;
  color: var(--color-label); text-decoration: none; border-bottom: 3px solid transparent; white-space: nowrap; }
.tab:hover { color: var(--color-charcoal); }
.tab.active { color: var(--color-coral-ink); border-bottom-color: var(--color-coral); }
```

- [ ] **Step 7: Wire child routes in `app.routes.ts`**

Replace the two existing profile routes:

```typescript
  {
    path: 'profile/settings',
    loadComponent: () => import('./pages/account-settings/account-settings.component').then((c) => c.AccountSettingsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then((c) => c.ProfileComponent),
    canActivate: [authGuard]
  },
```

with:

```typescript
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then((c) => c.ProfileComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'decks' },
      { path: 'decks', loadComponent: () => import('./pages/profile/tabs/profile-decks.component').then((c) => c.ProfileDecksComponent) },
      { path: 'patterns', loadComponent: () => import('./pages/profile/tabs/profile-patterns.component').then((c) => c.ProfilePatternsComponent) },
      { path: 'comments', loadComponent: () => import('./pages/profile/tabs/profile-comments.component').then((c) => c.ProfileCommentsComponent) },
      { path: 'settings', loadComponent: () => import('./pages/account-settings/account-settings.component').then((c) => c.AccountSettingsComponent) },
    ],
  },
```

- [ ] **Step 8: Run the whole suite + build**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: whole run green (the rewritten profile spec passes; Tasks 1–4 specs pass).
Run: `cd fortunecards.client && ng build`
Expected: build succeeds (invalid JSON or a bad lazy import would fail it).

- [ ] **Step 9: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/ fortunecards.client/src/app/app.routes.ts fortunecards.client/public/i18n/
git commit -m "71: Profile tabbed shell + child routes + tab i18n"
```

---

## Final verification

- [ ] `cd fortunecards.client && ng test --watch=false` — all green, pristine.
- [ ] `cd fortunecards.client && ng build` — succeeds.
- [ ] **Manual smoke (F5, logged in):** open `/profile` → redirects to `/profile/decks`; the four tabs switch panels and the URL updates (`/profile/patterns`, `/profile/comments`, `/profile/settings`); the active tab is underlined; the header (avatar/name/email) stays put; deep-linking to `/profile/settings` shows the settings form inside the shell; the add-tiles navigate to new deck/pattern; saving a nickname/photo still works.
