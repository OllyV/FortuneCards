# Split Decks Endpoints (Public Search + Mine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combined `GET /api/decks` with a paginated, user-agnostic public search endpoint and a per-user "mine" endpoint, move all/mine filtering off the client, add page-based pagination to the Decks Search page and deck-selector, and cache public browse pages.

**Architecture:** Backend gains `GetPublicAsync` (paginated + server-side search + 5-min cache with a version-token invalidated on writes) and `GetMineAsync` (owned + favourited, uncached). The public list carries no per-user flags; the client overlays `isOwner`/`isFavorite` from a one-time `getMyDecks()` fetch. A shared `app-pagination` component drives paging on both the search page and the selector modal.

**Tech Stack:** ASP.NET Core 10 (minimal API controllers, EF Core, `IMemoryCache`), Angular 21 standalone components + signals, Vitest.

## Global Constraints

- Backend: ASP.NET Core 10, controllers follow `DecksController` pattern; business logic in `DeckService`. No backend test project — verify with `dotnet build`.
- Frontend: Angular 21, **standalone components only** (register in `TestBed` via `imports:`, never `declarations:`). TypeScript strict mode. Signals for state. `HttpClient` with typed generics.
- Vitest: all spec files compile as **one bundle** — a type error in any spec fails the whole run. Import `CommonModule` only where `*ngIf`/`*ngFor` are used; newer components use `@if`/`@for`.
- Public cache: cache **empty-search** pages only, 5-minute TTL, key `decks:public:v{version}:p{page}:s{pageSize}`; bump `decks:public:version` on Create/Update/Delete/AddCard. `pageSize` clamped `[1,100]`, `page >= 1`. Default `page=1`, `pageSize=20`.
- Verify frontend with `ng test --watch=false` from `fortunecards.client/`.
- Commit after each task.

---

## File Structure

**Backend**
- Modify `FortuneCards.Server/Services/IDeckService.cs` — add `PagedResult<T>`, swap `GetAllAsync` for `GetPublicAsync`/`GetMineAsync`.
- Modify `FortuneCards.Server/Services/DeckService.cs` — implement new methods, version-token cache, remove `AllDecksKey`.
- Modify `FortuneCards.Server/Controllers/DecksController.cs` — add `public`/`mine` routes, remove `GetDecks`, add `{id:int}` constraint.

**Frontend**
- Modify `fortunecards.client/src/app/models/deck.ts` — add `PagedResult<T>`.
- Modify `fortunecards.client/src/app/services/deck.service.ts` (+ `.spec.ts`) — add `getPublicDecks`/`getMyDecks`; remove `getDecks` in final task.
- Create `fortunecards.client/src/app/components/shared/pagination/pagination.component.ts` (+ `.spec.ts`).
- Modify `deck-list.component.ts` / `.html` / `.spec.ts`.
- Modify `deck-selector.component.ts` / `.html` / `.spec.ts`.
- Modify `profile.component.ts`; create `profile.component.spec.ts`.

---

## Task 1: Backend — service, DTOs, caching, controller

The service and controller change together (removing `GetAllAsync` breaks the controller), so they land as one buildable task. Verification is `dotnet build`.

**Files:**
- Modify: `FortuneCards.Server/Services/IDeckService.cs`
- Modify: `FortuneCards.Server/Services/DeckService.cs`
- Modify: `FortuneCards.Server/Controllers/DecksController.cs`

**Interfaces:**
- Produces:
  - `record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize)`
  - `Task<PagedResult<DeckSummary>> GetPublicAsync(string? search, int page, int pageSize)`
  - `Task<IEnumerable<DeckSummary>> GetMineAsync(int userId)`
  - `GET /api/decks/public?search=&page=&pageSize=` → `PagedResult<DeckSummary>`
  - `GET /api/decks/mine` → `DeckSummary[]` (401 if unauthenticated)

- [ ] **Step 1: Update the interface**

In `IDeckService.cs`, add the `PagedResult<T>` record next to `DeckSummary`, and replace the `GetAllAsync` line in `IDeckService`:

```csharp
public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);
```

Replace:
```csharp
        Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null);
```
with:
```csharp
        Task<PagedResult<DeckSummary>> GetPublicAsync(string? search, int page, int pageSize);
        Task<IEnumerable<DeckSummary>> GetMineAsync(int userId);
```

- [ ] **Step 2: Replace cache fields in `DeckService`**

In `DeckService.cs`, replace the `AllDecksKey` field/constant block at the top of the class:

```csharp
        private const string AllDecksKey = "decks:all";
        private static string DeckKey(int id) => $"decks:{id}";
        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);
```
with:
```csharp
        private const string PublicVersionKey = "decks:public:version";
        private static string DeckKey(int id) => $"decks:{id}";
        private static string PublicPageKey(int version, int page, int pageSize) => $"decks:public:v{version}:p{page}:s{pageSize}";
        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);
        private static readonly TimeSpan PublicCacheDuration = TimeSpan.FromMinutes(5);

        private int PublicVersion => _cache.TryGetValue(PublicVersionKey, out int v) ? v : 0;
        private void BumpPublicVersion() => _cache.Set(PublicVersionKey, PublicVersion + 1);
```

- [ ] **Step 3: Replace `GetAllAsync` with `GetPublicAsync` + `GetMineAsync`**

Delete the entire `GetAllAsync` method and insert:

```csharp
        public async Task<PagedResult<DeckSummary>> GetPublicAsync(string? search, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var hasSearch = !string.IsNullOrWhiteSpace(search);

            if (!hasSearch &&
                _cache.TryGetValue(PublicPageKey(PublicVersion, page, pageSize), out PagedResult<DeckSummary>? cached) &&
                cached is not null)
                return cached;

            var query = _db.Decks.Where(d => d.IsPublic);
            if (hasSearch)
            {
                var term = search!.Trim();
                query = query.Where(d => d.Name.Contains(term) || (d.Description != null && d.Description.Contains(term)));
            }

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(d => d.CreatedAt).ThenByDescending(d => d.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, true, false,
                    d.AspectWidth, d.AspectHeight, false))
                .ToListAsync();

            var result = new PagedResult<DeckSummary>(items, total, page, pageSize);
            if (!hasSearch)
                _cache.Set(PublicPageKey(PublicVersion, page, pageSize), result, PublicCacheDuration);
            return result;
        }

        public async Task<IEnumerable<DeckSummary>> GetMineAsync(int userId)
        {
            return await _db.Decks
                .Where(d => d.UserId == userId || d.FavoritedBy.Any(f => f.UserId == userId))
                .OrderByDescending(d => d.CreatedAt).ThenByDescending(d => d.Id)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
                .ToListAsync();
        }
```

- [ ] **Step 4: Swap cache invalidation on writes**

In `DeckService.cs`, replace every `_cache.Remove(AllDecksKey);` with `BumpPublicVersion();` (four sites: `CreateAsync`, `DeleteAsync`, `AddCardAsync`, `UpdateAsync`). Leave every `_cache.Remove(DeckKey(...))` untouched.

- [ ] **Step 5: Update the controller**

In `DecksController.cs`, replace the `GetDecks` action:

```csharp
        [HttpGet]
        public async Task<IActionResult> GetDecks() =>
            Ok(await _decks.GetAllAsync(CurrentUserId));
```
with:
```csharp
        [HttpGet("public")]
        public async Task<IActionResult> GetPublic([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20) =>
            Ok(await _decks.GetPublicAsync(search, page, pageSize));

        [HttpGet("mine")]
        public async Task<IActionResult> GetMine()
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _decks.GetMineAsync(userId));
        }
```

Then change the `GetDeck` route from `[HttpGet("{id}")]` to `[HttpGet("{id:int}")]` so `/public` and `/mine` never bind to the `{id}` action.

- [ ] **Step 6: Build**

Run: `dotnet build`
Expected: Build succeeded, 0 errors. (No references to `GetAllAsync` or `AllDecksKey` remain.)

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/Services/IDeckService.cs FortuneCards.Server/Services/DeckService.cs FortuneCards.Server/Controllers/DecksController.cs
git commit -m "feat(server): split decks into public (paged, cached) and mine endpoints"
```

---

## Task 2: Frontend — service methods + PagedResult model

Adds the new client methods and model. **Keeps `getDecks()`** so existing consumers still compile; it is removed in Task 6 after all consumers migrate.

**Files:**
- Modify: `fortunecards.client/src/app/models/deck.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`
- Test: `fortunecards.client/src/app/services/deck.service.spec.ts`

**Interfaces:**
- Consumes: `PagedResult<T>`, `Deck` from `models/deck`.
- Produces:
  - `getPublicDecks(search: string, page: number, pageSize: number): Observable<PagedResult<Deck>>`
  - `getMyDecks(): Observable<Deck[]>`

- [ ] **Step 1: Add the `PagedResult<T>` model**

In `models/deck.ts`, append:

```ts
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Write failing service tests**

In `deck.service.spec.ts`, add these tests inside the `describe('DeckService', ...)` block (after the existing `it` blocks). Also add `PagedResult` and `Deck` to the import from `../models/deck` if needed — update the import line to `import { CreateDeckPayload, Deck, PagedResult } from '../models/deck';`.

```ts
  it('should GET /api/decks/public with page params (no search) for getPublicDecks', () => {
    const paged: PagedResult<Deck> = { items: [], totalCount: 0, page: 1, pageSize: 20 };
    service.getPublicDecks('', 1, 20).subscribe((r) => expect(r).toEqual(paged));
    const req = httpMock.expectOne((r) => r.url === '/api/decks/public');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(paged);
  });

  it('should include search param when provided', () => {
    service.getPublicDecks('tarot', 2, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/decks/public');
    expect(req.request.params.get('search')).toBe('tarot');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 20 });
  });

  it('should GET /api/decks/mine for getMyDecks', () => {
    service.getMyDecks().subscribe();
    const req = httpMock.expectOne('/api/decks/mine');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd fortunecards.client && npx vitest run src/app/services/deck.service.spec.ts`
Expected: FAIL — `getPublicDecks`/`getMyDecks` do not exist (or compile error).

- [ ] **Step 4: Implement the service methods**

In `deck.service.ts`, add `HttpParams` to the import: `import { HttpClient, HttpParams } from '@angular/common/http';` and `PagedResult` to the models import: `import { CreateDeckPayload, Deck, PagedResult } from '../models/deck';`. Then add these methods (keep `getDecks()` for now):

```ts
  getPublicDecks(search: string, page: number, pageSize: number): Observable<PagedResult<Deck>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PagedResult<Deck>>(`${this.base}/public`, { params });
  }

  getMyDecks(): Observable<Deck[]> {
    return this.http.get<Deck[]>(`${this.base}/mine`);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd fortunecards.client && npx vitest run src/app/services/deck.service.spec.ts`
Expected: PASS (all DeckService tests).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/models/deck.ts fortunecards.client/src/app/services/deck.service.ts fortunecards.client/src/app/services/deck.service.spec.ts
git commit -m "feat(client): add getPublicDecks/getMyDecks service methods"
```

---

## Task 3: Frontend — shared pagination component

**Files:**
- Create: `fortunecards.client/src/app/components/shared/pagination/pagination.component.ts`
- Test: `fortunecards.client/src/app/components/shared/pagination/pagination.component.spec.ts`

**Interfaces:**
- Produces: standalone `PaginationComponent`, selector `app-pagination`, inputs `page`/`pageSize`/`totalCount` (all `input.required<number>()`), output `pageChange: OutputEmitterRef<number>`.

- [ ] **Step 1: Write the failing test**

Create `pagination.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;

  function setup(page: number, totalCount: number, pageSize = 20) {
    TestBed.configureTestingModule({
      imports: [PaginationComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageSize', pageSize);
    fixture.componentRef.setInput('totalCount', totalCount);
    fixture.detectChanges();
  }

  it('computes total pages by ceil(total / pageSize)', () => {
    setup(1, 45, 20);
    expect(fixture.componentInstance.totalPages()).toBe(3);
  });

  it('disables prev on first page and next on last page', () => {
    setup(1, 45, 20);
    expect(fixture.componentInstance.canPrev()).toBe(false);
    expect(fixture.componentInstance.canNext()).toBe(true);
    setup(3, 45, 20);
    expect(fixture.componentInstance.canPrev()).toBe(true);
    expect(fixture.componentInstance.canNext()).toBe(false);
  });

  it('emits the next/prev page number', () => {
    setup(2, 45, 20);
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    fixture.componentInstance.next();
    fixture.componentInstance.prev();
    expect(emitted).toEqual([3, 1]);
  });

  it('does not emit past the boundaries', () => {
    setup(1, 45, 20);
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    fixture.componentInstance.prev();
    expect(emitted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fortunecards.client && npx vitest run src/app/components/shared/pagination/pagination.component.spec.ts`
Expected: FAIL — cannot resolve `./pagination.component`.

- [ ] **Step 3: Implement the component**

Create `pagination.component.ts`:

```ts
import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  template: `
    @if (totalPages() > 1) {
      <nav class="pagination" aria-label="Pagination">
        <button type="button" class="page-btn" [disabled]="!canPrev()" (click)="prev()" aria-label="Previous page">‹</button>
        <span class="page-status">Page {{ page() }} of {{ totalPages() }}</span>
        <button type="button" class="page-btn" [disabled]="!canNext()" (click)="next()" aria-label="Next page">›</button>
      </nav>
    }
  `,
  styles: [`
    .pagination { display: flex; align-items: center; gap: 0.75rem; justify-content: center; margin-top: 1rem; }
    .page-btn { border: none; border-radius: 999px; width: 2rem; height: 2rem; cursor: pointer; font-size: 1.1rem; }
    .page-btn:disabled { opacity: 0.4; cursor: default; }
    .page-status { font-size: 0.9rem; }
  `],
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageChange = output<number>();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
  readonly canPrev = computed(() => this.page() > 1);
  readonly canNext = computed(() => this.page() < this.totalPages());

  prev(): void {
    if (this.canPrev()) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  next(): void {
    if (this.canNext()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fortunecards.client && npx vitest run src/app/components/shared/pagination/pagination.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/shared/pagination/
git commit -m "feat(client): add shared app-pagination component"
```

---

## Task 4: Frontend — deck-list refactor (server search + pagination + overlay)

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.html`
- Test: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.spec.ts`

**Interfaces:**
- Consumes: `getPublicDecks`, `getMyDecks` (Task 2), `PaginationComponent` (Task 3).
- Produces: `DeckListComponent` with public signals `decks`, `loading`, `error`, `mode`, `searchTerm`, `page`, `pageSize`, `totalCount`; methods `onSearchInput`, `onPageChange`, `toggleFavorite`, `loadDecks`.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `deck-list.component.ts` with:

```ts
import { Component, signal, inject, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../../utils/deck-colors';

export type DeckListMode = 'mine' | 'search';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: true,
  imports: [RouterLink, NavigationBar, PaginationComponent],
})
export class DeckListComponent {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  mode = signal<DeckListMode>('mine');
  searchTerm = signal('');
  page = signal(1);
  readonly pageSize = PAGE_SIZE;
  totalCount = signal(0);

  readonly title = () => (this.mode() === 'mine' ? 'My Decks ✨' : 'Search Decks 🔍');

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly searchInput = new Subject<string>();

  private ownedIds = new Set<number>();
  private favoriteIds = new Set<number>();
  private relationsLoaded = false;

  constructor(private deckService: DeckService, private router: Router) {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.mode.set((data['mode'] as DeckListMode) ?? 'mine'));

    this.searchInput
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.page.set(1);
        this.loadDecks();
      });

    effect(() => {
      this.auth.currentUser();
      this.relationsLoaded = false;
      this.ownedIds = new Set();
      this.favoriteIds = new Set();
      this.page.set(1);
      this.loadDecks();
    });
  }

  loadDecks(): void {
    this.loading.set(true);
    this.error.set(null);
    if (this.mode() === 'mine') {
      this.deckService.getMyDecks()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (decks) => { this.decks.set(decks); this.loading.set(false); },
          error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
        });
      return;
    }
    this.ensureRelations(() => this.loadPublicPage());
  }

  private ensureRelations(done: () => void): void {
    if (this.relationsLoaded || !this.auth.isLoggedIn()) { done(); return; }
    this.deckService.getMyDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mine) => {
          this.ownedIds = new Set(mine.filter((d) => d.isOwner).map((d) => d.id));
          this.favoriteIds = new Set(mine.filter((d) => d.isFavorite).map((d) => d.id));
          this.relationsLoaded = true;
          done();
        },
        error: () => { this.relationsLoaded = true; done(); },
      });
  }

  private loadPublicPage(): void {
    this.deckService.getPublicDecks(this.searchTerm(), this.page(), this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.decks.set(result.items.map((d) => this.overlay(d)));
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
      });
  }

  private overlay(deck: Deck): Deck {
    return { ...deck, isOwner: this.ownedIds.has(deck.id), isFavorite: this.favoriteIds.has(deck.id) };
  }

  getDeckGradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  getDeckShadow(colorIndex: number): string { return getDeckShadowStyle(colorIndex); }

  goToNew(): void { this.router.navigate(['/decks', 'new']); }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadPublicPage();
  }

  toggleFavorite(deck: Deck, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = !deck.isFavorite;
    this.setFavorite(deck.id, next);
    const request = next ? this.deckService.addFavorite(deck.id) : this.deckService.removeFavorite(deck.id);
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.setFavorite(deck.id, !next) });
  }

  private setFavorite(id: number, value: boolean): void {
    if (value) { this.favoriteIds.add(id); } else { this.favoriteIds.delete(id); }
    this.decks.update((all) => all.map((d) => (d.id === id ? { ...d, isFavorite: value } : d)));
  }
}
```

- [ ] **Step 2: Update the template**

In `deck-list.component.html`: the grid already iterates `decks()` — but it currently calls `visibleDecks()`, which no longer exists. Replace all three `visibleDecks()` occurrences with `decks()` (lines with `visibleDecks().length` in the subtitle, the `@for (deck of visibleDecks(); ...)`, and the empty-state `@if (visibleDecks().length === 0)`).

Then add the pager after the closing `</div>` of `.deck-grid` and before the empty-state block, only in search mode:

```html
      @if (mode() === 'search' && totalCount() > 0) {
        <app-pagination
          [page]="page()"
          [pageSize]="pageSize"
          [totalCount]="totalCount()"
          (pageChange)="onPageChange($event)" />
      }
```

- [ ] **Step 3: Rewrite the spec**

Replace the entire contents of `deck-list.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DeckListComponent } from './deck-list.component';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck, PagedResult } from '../../../models/deck';

const ownedDeck: Deck = {
  id: 1, name: 'Adventure', description: null, createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 3, isPublic: false, isOwner: true, isFavorite: false,
};
const publicDeck: Deck = {
  id: 2, name: 'Mystic Tarot', description: 'ancient wisdom', createdAt: '2026-01-02', emoji: '🔮', colorIndex: 1,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 5, isPublic: true, isOwner: false, isFavorite: false,
};

function paged(items: Deck[], totalCount = items.length): PagedResult<Deck> {
  return { items, totalCount, page: 1, pageSize: 20 };
}

function configure(mode: 'mine' | 'search', loggedIn = true) {
  const mockDeckService = {
    getMyDecks: vi.fn(() => of([ownedDeck, { ...publicDeck, isFavorite: true }])),
    getPublicDecks: vi.fn(() => of(paged([publicDeck]))),
    addFavorite: vi.fn(() => of(void 0)),
    removeFavorite: vi.fn(() => of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [DeckListComponent, RouterModule.forRoot([]), NavigationBar],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DeckService, useValue: mockDeckService },
      { provide: ActivatedRoute, useValue: { data: of({ mode }) } },
      { provide: AuthService, useValue: { isLoggedIn: signal(loggedIn), currentUser: signal(loggedIn ? { displayName: 'Test', email: 't@e.com' } : null) } },
    ],
  });
  return mockDeckService;
}

describe('DeckListComponent', () => {
  let component: DeckListComponent;
  let fixture: ComponentFixture<DeckListComponent>;

  describe('mine mode', () => {
    it('loads mine decks via getMyDecks and renders them', () => {
      const svc = configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(svc.getMyDecks).toHaveBeenCalled();
      expect(component.decks().map((d) => d.id).sort()).toEqual([1, 2]);
      expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
    });

    it('renders the add tile when logged in', () => {
      configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-tile--add')).not.toBeNull();
    });
  });

  describe('search mode', () => {
    it('loads a public page and renders a search box', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(svc.getPublicDecks).toHaveBeenCalledWith('', 1, 20);
      expect(component.decks().map((d) => d.id)).toEqual([2]);
      expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
    });

    it('overlays favourite state from getMyDecks onto public items', () => {
      configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      // deck 2 is favourited in the mine list, so the overlay marks it favourite
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(true);
    });

    it('onPageChange reloads the requested page', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      svc.getPublicDecks.mockClear();
      component.onPageChange(3);
      expect(component.page()).toBe(3);
      expect(svc.getPublicDecks).toHaveBeenCalledWith('', 3, 20);
    });
  });

  describe('favourites', () => {
    it('toggleFavorite flips isFavorite and calls the service', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const target = component.decks().find((d) => d.id === 2)!;
      const wasFav = target.isFavorite;
      component.toggleFavorite(target, new MouseEvent('click'));
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(!wasFav);
      expect(wasFav ? svc.removeFavorite : svc.addFavorite).toHaveBeenCalledWith(2);
    });
  });
});
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd fortunecards.client && npx vitest run src/app/components/Deck/deck-list/deck-list.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-list/
git commit -m "feat(client): server-side search + pagination on deck-list, favourite overlay"
```

---

## Task 5: Frontend — deck-selector refactor

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.html`
- Test: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`

**Interfaces:**
- Consumes: `getPublicDecks`, `getMyDecks`, `PaginationComponent`.
- Produces: `DeckSelectorComponent` with signals `decks`, `loading`, `error`, `selectError`, `searchTerm`, `page`, `pageSize`, `totalCount`, `isAuthorized`; methods `onSearchInput`, `onPageChange`, `selectDeck`.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `deck-selector.component.ts` with:

```ts
import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

const PAGE_SIZE = 12;

@Component({
  selector: 'deck-selector',
  standalone: true,
  templateUrl: './deck-selector.component.html',
  styleUrl: './deck-selector.component.css',
  imports: [PaginationComponent],
})
export class DeckSelectorComponent {
  private readonly deckService = inject(DeckService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput = new Subject<string>();

  readonly deckSelected = output<Deck>();
  readonly closed = output<void>();

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;
  readonly totalCount = signal(0);
  readonly isAuthorized = computed(() => this.auth.currentUser() !== null);

  constructor() {
    this.searchInput
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.page.set(1);
        this.load();
      });
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    if (this.isAuthorized()) {
      this.deckService.getMyDecks()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (decks) => { this.decks.set(decks); this.loading.set(false); },
          error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
        });
      return;
    }
    this.deckService.getPublicDecks(this.searchTerm(), this.page(), this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => { this.decks.set(result.items); this.totalCount.set(result.totalCount); this.loading.set(false); },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
      });
  }

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  selectDeck(deck: Deck): void {
    this.selectError.set(null);
    this.deckService.getDeck(deck.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => { this.deckSelected.emit(full); this.closed.emit(); },
        error: () => this.selectError.set('Failed to load deck.'),
      });
  }
}
```

Note: the authorized branch shows the full `mine` set (owned + favourited) directly — no client filter needed, since `getMyDecks` returns exactly that set.

- [ ] **Step 2: Update the template**

In `deck-selector.component.html`, the `@for` already iterates `visibleDecks()` — replace it with `decks()`. Replace the empty-state condition `@if (visibleDecks().length === 0)` with `@if (decks().length === 0)`. Then add the pager before the closing `.dialog-panel`'s Close button, only for the anonymous paginated view:

```html
    @if (!isAuthorized() && totalCount() > 0) {
      <app-pagination
        [page]="page()"
        [pageSize]="pageSize"
        [totalCount]="totalCount()"
        (pageChange)="onPageChange($event)" />
    }
```

- [ ] **Step 3: Rewrite the spec**

Replace the entire contents of `deck-selector.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DeckSelectorComponent } from './deck-selector.component';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck, PagedResult } from '../../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

function paged(items: Deck[]): PagedResult<Deck> {
  return { items, totalCount: items.length, page: 1, pageSize: 12 };
}

describe('DeckSelectorComponent', () => {
  let fixture: ComponentFixture<DeckSelectorComponent>;
  const mine = [deck({ id: 1, name: 'Mine', isOwner: true }), deck({ id: 4, name: 'Fav', isFavorite: true, isPublic: true })];
  const publics = [deck({ id: 2, name: 'Public', isPublic: true }), deck({ id: 4, name: 'Fav', isPublic: true })];
  const getDeck = vi.fn((id: number) => of(deck({ id, name: 'Full', isOwner: true })));

  function setup(loggedIn: boolean) {
    const svc = {
      getMyDecks: vi.fn(() => of(mine)),
      getPublicDecks: vi.fn(() => of(paged(publics))),
      getDeck,
    };
    TestBed.configureTestingModule({
      imports: [DeckSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { currentUser: signal(loggedIn ? { id: 1 } : null) } },
      ],
    });
    fixture = TestBed.createComponent(DeckSelectorComponent);
    fixture.detectChanges();
    return svc;
  }

  it('shows the mine set via getMyDecks when authorized, no search box', () => {
    const svc = setup(true);
    expect(svc.getMyDecks).toHaveBeenCalled();
    expect(fixture.componentInstance.decks().map((d) => d.id).sort()).toEqual([1, 4]);
    expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
  });

  it('shows public paged decks with a search box when not authorized', () => {
    const svc = setup(false);
    expect(svc.getPublicDecks).toHaveBeenCalledWith('', 1, 12);
    expect(fixture.componentInstance.decks().map((d) => d.id).sort()).toEqual([2, 4]);
    expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
  });

  it('onPageChange reloads the requested public page', () => {
    const svc = setup(false);
    svc.getPublicDecks.mockClear();
    fixture.componentInstance.onPageChange(2);
    expect(svc.getPublicDecks).toHaveBeenCalledWith('', 2, 12);
  });

  it('fetches the full deck and emits deckSelected + closed on pick', () => {
    setup(true);
    const selected = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.deckSelected.subscribe(selected);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.selectDeck(mine[0]);
    expect(getDeck).toHaveBeenCalledWith(1);
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Full' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('keeps the grid visible and sets selectError (not error) when getDeck fails', () => {
    setup(true);
    getDeck.mockReturnValueOnce(throwError(() => new Error('boom')));
    fixture.componentInstance.selectDeck(mine[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.deck-grid')).not.toBeNull();
    expect(fixture.componentInstance.selectError()).toBeTruthy();
    expect(fixture.componentInstance.error()).toBeNull();
  });
});
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd fortunecards.client && npx vitest run src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/
git commit -m "feat(client): deck-selector uses mine/public endpoints with pagination"
```

---

## Task 6: Frontend — profile refactor + remove getDecks

**Files:**
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.ts`
- Create: `fortunecards.client/src/app/pages/profile/profile.component.spec.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`

**Interfaces:**
- Consumes: `getMyDecks` (Task 2).
- Produces: profile shows owned-only decks; `getDecks()` removed from `DeckService`.

- [ ] **Step 1: Switch profile to getMyDecks**

In `profile.component.ts`, replace the constructor's `getDecks()` call:

```ts
    this.deckService.getDecks()
```
with:
```ts
    this.deckService.getMyDecks()
```

The existing `.subscribe` body already does `this.decks.set(all.filter(d => d.isOwner))`, which correctly keeps owned decks only (dropping favourites) from the mine set. Leave it unchanged.

- [ ] **Step 2: Write the profile spec**

Create `profile.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { Deck } from '../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;

  it('shows only owned decks from getMyDecks', () => {
    const svc = {
      getMyDecks: vi.fn(() => of([deck({ id: 1, isOwner: true }), deck({ id: 2, isFavorite: true, isPublic: true })])),
    };
    TestBed.configureTestingModule({
      imports: [ProfileComponent, RouterModule.forRoot([]), NavigationBar],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { currentUser: signal({ displayName: 'Test', email: 't@e.com' }) } },
      ],
    });
    fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    expect(svc.getMyDecks).toHaveBeenCalled();
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([1]);
  });
});
```

- [ ] **Step 3: Remove the obsolete getDecks method**

In `deck.service.ts`, delete the now-unused method:

```ts
  getDecks(): Observable<Deck[]> {
    return this.http.get<Deck[]>(this.base);
  }
```

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd fortunecards.client && npx vitest run`
Expected: PASS — no remaining references to `getDecks` anywhere in app or specs. (If any spec still references `getDecks`, the single bundle will fail to compile; fix that consumer.)

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/ fortunecards.client/src/app/services/deck.service.ts
git commit -m "feat(client): profile uses getMyDecks; drop obsolete getDecks"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend build**

Run: `dotnet build`
Expected: Build succeeded, 0 errors, 0 warnings introduced by this change.

- [ ] **Step 2: Frontend production build**

Run: `cd fortunecards.client && ng build`
Expected: build completes with no errors (catches template binding errors the unit tests may miss).

- [ ] **Step 3: Full frontend test run**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: all specs pass.

- [ ] **Step 4: Manual smoke check (documented, run if a dev environment is available)**

Start backend + frontend (VS F5 or `dotnet run` + `npm start`). Verify:
- `/decks/search` paginates public decks; searching filters server-side and resets to page 1.
- A logged-in user sees correct star/owner state on public search tiles (overlay).
- `/decks/mine` and `/profile` show owned/favourited decks with no pager.
- The table deck-selector paginates for anonymous users and shows the mine set for authorized users.
- Create a new public deck → it appears on the first public search page immediately (version bump invalidates the cache).

---

## Self-Review

**Spec coverage:**
- Two endpoints (`public` paged, `mine`) → Task 1. ✓
- Server-side search → Task 1 (`GetPublicAsync` `Contains`). ✓
- Page-based pagination UI on search page + selector → Tasks 3, 4, 5. ✓
- User-agnostic public list + client overlay → Task 1 (flags false) + Task 4 (overlay from `getMyDecks`). ✓
- Caching empty-search pages, 5-min TTL, version-token invalidation → Task 1. ✓
- Remove old combined endpoint / `getDecks` → Task 1 (server), Task 6 (client). ✓
- Consumers: deck-list (Task 4), selector (Task 5), profile (Task 6). ✓
- Testing: service/pagination/deck-list/selector/profile specs → Tasks 2–6; build + full run → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; every test step shows assertions. ✓

**Type consistency:** `PagedResult<T>` fields (`items`, `totalCount`, `page`, `pageSize`) match across model, service, and component usage. `getPublicDecks(search, page, pageSize)` / `getMyDecks()` signatures identical in Task 2 definition and Tasks 4–6 usage. `app-pagination` inputs (`page`/`pageSize`/`totalCount`) and output (`pageChange`) match between Task 3 and Tasks 4/5 templates. Backend `GetPublicAsync`/`GetMineAsync` signatures match interface and controller. ✓
