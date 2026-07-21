# Favourite Decks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user favourite public decks they don't own, and surface those favourites alongside their own decks in "My Decks" and the table deck-selector, with a star toggle on each deck tile and in the deck hero.

**Architecture:** A new `FavoriteDeck` join entity records `(UserId, DeckId)` pairs. `DeckSummary`/`DeckDetail` gain an `IsFavorite` flag computed per requesting user. Two idempotent endpoints (`PUT`/`DELETE /api/decks/{id}/favorite`) mutate favourites. The Angular deck-list and deck-detail views render a star toggle (only when logged in and not the owner) that optimistically updates local signal state; the "mine" list and table selector include favourites via an `isOwner || isFavorite` filter.

**Tech Stack:** ASP.NET Core 10 (minimal API + controllers), EF Core (SQL Server), Angular 21 standalone components + signals, Vitest.

## Global Constraints

- Backend has **no test project** — verify every backend task with `dotnet build` (from repo root).
- Frontend tests run under **Vitest**: `cd fortunecards.client && ng test --watch=false`. All spec files compile as **one bundle** — a type error in any spec fails the whole run.
- All Angular components are **standalone**; register components in `TestBed` via `imports:`, never `declarations:`.
- Ownership/visibility rule: a favourite may only be created for a **public deck the user does not own**. Endpoints require auth (return `Unauthorized` if `HttpContext.Items["UserId"]` is absent).
- The favourite star control renders **only when `auth.isLoggedIn()` and `!deck.isOwner`**.
- EF migrations in this repo: use the **`dotnet ef` CLI** (VS Package Manager Console fails due to the esproj ProjectReference). `migrations add` works via the existing `DesignTimeDbContextFactory`; `database update` needs a real connection string (see Task 1 Step 6).
- Current git branch: `14_FavouriteDecks`.

---

### Task 1: `FavoriteDeck` entity, DbContext mapping, and migration

**Files:**
- Create: `FortuneCards.Server/Models/FavoriteDeck.cs`
- Modify: `FortuneCards.Server/Models/User.cs`
- Modify: `FortuneCards.Server/Models/Deck.cs`
- Modify: `FortuneCards.Server/Data/FortuneCardsDbContext.cs`
- Generated: `FortuneCards.Server/Migrations/*_AddFavoriteDecks.cs`

**Interfaces:**
- Produces: `FavoriteDeck { int UserId; int DeckId; DateTime CreatedAt; User? User; Deck? Deck; }`; `FortuneCardsDbContext.FavoriteDecks` (`DbSet<FavoriteDeck>`); `User.FavoriteDecks` and `Deck.FavoritedBy` (`ICollection<FavoriteDeck>`).

- [ ] **Step 1: Create the `FavoriteDeck` model**

Create `FortuneCards.Server/Models/FavoriteDeck.cs`:

```csharp
namespace FortuneCards.Server.Models
{
    public class FavoriteDeck
    {
        public int UserId { get; set; }
        public int DeckId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public User? User { get; set; }
        public Deck? Deck { get; set; }
    }
}
```

- [ ] **Step 2: Add navigation collections to `User` and `Deck`**

In `FortuneCards.Server/Models/User.cs`, add after the `Decks` property:

```csharp
        public ICollection<FavoriteDeck> FavoriteDecks { get; set; } = [];
```

In `FortuneCards.Server/Models/Deck.cs`, add after the `User` property:

```csharp
        public ICollection<FavoriteDeck> FavoritedBy { get; set; } = new List<FavoriteDeck>();
```

- [ ] **Step 3: Register the DbSet and configure the entity**

In `FortuneCards.Server/Data/FortuneCardsDbContext.cs`, add the DbSet next to the others:

```csharp
        public DbSet<FavoriteDeck> FavoriteDecks => Set<FavoriteDeck>();
```

Then add this entity configuration inside `OnModelCreating`, after the `Card` block:

```csharp
            modelBuilder.Entity<FavoriteDeck>(e =>
            {
                e.HasKey(f => new { f.UserId, f.DeckId });
                e.HasOne(f => f.User)
                 .WithMany(u => u.FavoriteDecks)
                 .HasForeignKey(f => f.UserId)
                 .OnDelete(DeleteBehavior.Cascade);
                e.HasOne(f => f.Deck)
                 .WithMany(d => d.FavoritedBy)
                 .HasForeignKey(f => f.DeckId)
                 .OnDelete(DeleteBehavior.Cascade);
            });
```

- [ ] **Step 4: Build the backend**

Run: `dotnet build`
Expected: `Build succeeded` with 0 errors.

- [ ] **Step 5: Generate the migration**

Run from repo root:

```powershell
dotnet ef migrations add AddFavoriteDecks --project FortuneCards.Server --startup-project FortuneCards.Server
```

Expected: a new `Migrations/<timestamp>_AddFavoriteDecks.cs` creating a `FavoriteDecks` table with composite PK `(UserId, DeckId)` and two cascade FKs. Open it and confirm both FKs and the composite key are present.

- [ ] **Step 6: Apply the migration to the dev database**

Run from repo root (reads the connection string from Development user-secrets, which the `dotnet ef` host otherwise can't see):

```powershell
$conn = (dotnet user-secrets list --project FortuneCards.Server |
         Where-Object { $_ -like 'ConnectionStrings:DefaultConnection = *' }) -replace '^ConnectionStrings:DefaultConnection = '
dotnet ef database update --project FortuneCards.Server --startup-project FortuneCards.Server --connection $conn
```

Expected: `Done.` and the `FavoriteDecks` table created. If no database is reachable, generate a script instead and note it for manual apply:
`dotnet ef migrations script --idempotent --project FortuneCards.Server --startup-project FortuneCards.Server -o migrate.sql`

- [ ] **Step 7: Commit**

```powershell
git add FortuneCards.Server/Models/FavoriteDeck.cs FortuneCards.Server/Models/User.cs FortuneCards.Server/Models/Deck.cs FortuneCards.Server/Data/FortuneCardsDbContext.cs FortuneCards.Server/Migrations
git commit -m "feat(server): add FavoriteDeck entity and migration"
```

---

### Task 2: `IsFavorite` DTO field and favourite service methods

**Files:**
- Modify: `FortuneCards.Server/Services/IDeckService.cs`
- Modify: `FortuneCards.Server/Services/DeckService.cs`

**Interfaces:**
- Consumes: `FortuneCardsDbContext.FavoriteDecks`, `Deck.FavoritedBy` (Task 1).
- Produces: `DeckSummary`/`DeckDetail` records with a trailing `bool IsFavorite`; `IDeckService.AddFavoriteAsync(int deckId, int userId): Task<bool>`; `IDeckService.RemoveFavoriteAsync(int deckId, int userId): Task<bool>`.

- [ ] **Step 1: Add `IsFavorite` to the DTOs and declare the new methods**

In `FortuneCards.Server/Services/IDeckService.cs`, add `bool IsFavorite` as the final positional field of both records:

```csharp
    public record DeckSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner, int AspectWidth, int AspectHeight, bool IsFavorite);

    public record DeckDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<CardDto> Cards,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner, int AspectWidth, int AspectHeight, bool IsFavorite);
```

Add these two members to the `IDeckService` interface:

```csharp
        Task<bool> AddFavoriteAsync(int deckId, int userId);
        Task<bool> RemoveFavoriteAsync(int deckId, int userId);
```

- [ ] **Step 2: Populate `IsFavorite` in `GetAllAsync`**

In `FortuneCards.Server/Services/DeckService.cs`, in the **anonymous** branch of `GetAllAsync` (the `userId == null` block), append `false` as the final `DeckSummary` argument:

```csharp
                var publicDecks = await _db.Decks
                    .Where(d => d.IsPublic)
                    .Select(d => new DeckSummary(
                        d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                        d.Emoji, d.ColorIndex, d.CardBackImageUrl, true, false,
                        d.AspectWidth, d.AspectHeight, false))
                    .ToListAsync();
```

In the **logged-in** branch (the trailing `return await _db.Decks...`), compute the flag with a translatable subquery:

```csharp
            return await _db.Decks
                .Where(d => d.IsPublic || d.UserId == userId)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
                .ToListAsync();
```

- [ ] **Step 3: Populate `IsFavorite` in `GetByIdAsync`**

In `GetByIdAsync`, append the same subquery as the final `DeckDetail` argument. (`userId` is `null` for the cached anonymous path, so `Any(f => f.UserId == userId)` yields `false` there.)

```csharp
            var deck = await _db.Decks
                .Where(d => d.Id == id && (d.IsPublic || d.UserId == userId))
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description, c.ImageUrl, c.CreatedAt)),
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
                .FirstOrDefaultAsync();
```

- [ ] **Step 4: Fix the `CreateAsync` `DeckSummary` return**

`CreateAsync` constructs a `DeckSummary` literal; a freshly created deck is never a favourite of its owner. Append `false`:

```csharp
            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl, deck.IsPublic, true,
                deck.AspectWidth, deck.AspectHeight, false);
```

- [ ] **Step 5: Implement `AddFavoriteAsync` and `RemoveFavoriteAsync`**

Add these methods to `DeckService` (e.g. after `UpdateAsync`):

```csharp
        public async Task<bool> AddFavoriteAsync(int deckId, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || !deck.IsPublic || deck.UserId == userId) return false;

            var exists = await _db.FavoriteDecks
                .AnyAsync(f => f.UserId == userId && f.DeckId == deckId);
            if (!exists)
            {
                _db.FavoriteDecks.Add(new FavoriteDeck { UserId = userId, DeckId = deckId });
                await _db.SaveChangesAsync();
            }
            return true;
        }

        public async Task<bool> RemoveFavoriteAsync(int deckId, int userId)
        {
            var favorite = await _db.FavoriteDecks
                .FirstOrDefaultAsync(f => f.UserId == userId && f.DeckId == deckId);
            if (favorite is null) return false;

            _db.FavoriteDecks.Remove(favorite);
            await _db.SaveChangesAsync();
            return true;
        }
```

Ensure `using FortuneCards.Server.Models;` is present (it already is).

- [ ] **Step 6: Build**

Run: `dotnet build`
Expected: `Build succeeded`, 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add FortuneCards.Server/Services/IDeckService.cs FortuneCards.Server/Services/DeckService.cs
git commit -m "feat(server): compute IsFavorite and add favourite service methods"
```

---

### Task 3: Favourite controller endpoints

**Files:**
- Modify: `FortuneCards.Server/Controllers/DecksController.cs`

**Interfaces:**
- Consumes: `IDeckService.AddFavoriteAsync`, `IDeckService.RemoveFavoriteAsync` (Task 2).
- Produces: `PUT /api/decks/{id}/favorite` and `DELETE /api/decks/{id}/favorite`.

- [ ] **Step 1: Add the two endpoints**

In `DecksController`, add after `UpdateDeck`:

```csharp
        [HttpPut("{id}/favorite")]
        public async Task<IActionResult> AddFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _decks.AddFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }

        [HttpDelete("{id}/favorite")]
        public async Task<IActionResult> RemoveFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _decks.RemoveFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
```

- [ ] **Step 2: Build**

Run: `dotnet build`
Expected: `Build succeeded`, 0 errors.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Controllers/DecksController.cs
git commit -m "feat(server): add PUT/DELETE favourite endpoints"
```

---

### Task 4: Frontend model, service methods, and keep the spec bundle compiling

**Files:**
- Modify: `fortunecards.client/src/app/models/deck.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.spec.ts`
- Modify (add `isFavorite: false` to the base `Deck` literal in each): `deck-list.component.spec.ts`, `deck-detail.component.spec.ts`, `deck-edit.component.spec.ts`, `deck-selector.component.spec.ts`, `drawn-card.component.spec.ts`, `create-card.component.spec.ts`, `card-edit.component.spec.ts`, `card-detail.component.spec.ts`, and `table.component.spec.ts`.

**Interfaces:**
- Produces: `Deck.isFavorite: boolean`; `DeckService.addFavorite(id: number): Observable<void>`; `DeckService.removeFavorite(id: number): Observable<void>`.

- [ ] **Step 1: Write the failing service spec**

Append to `fortunecards.client/src/app/services/deck.service.spec.ts` (inside the `describe`):

```typescript
  it('should PUT /api/decks/:id/favorite for addFavorite', () => {
    service.addFavorite(5).subscribe();
    const req = httpMock.expectOne('/api/decks/5/favorite');
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  it('should DELETE /api/decks/:id/favorite for removeFavorite', () => {
    service.removeFavorite(5).subscribe();
    const req = httpMock.expectOne('/api/decks/5/favorite');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
```

- [ ] **Step 2: Run the service spec to verify it fails**

Run: `cd fortunecards.client && npx vitest run src/app/services/deck.service.spec.ts`
Expected: FAIL — `addFavorite`/`removeFavorite` do not exist on `DeckService` (compile error).

- [ ] **Step 3: Add `isFavorite` to the `Deck` model**

In `fortunecards.client/src/app/models/deck.ts`, add to the `Deck` interface after `isOwner`:

```typescript
  isFavorite: boolean;
```

- [ ] **Step 4: Add the service methods**

In `fortunecards.client/src/app/services/deck.service.ts`, add inside the class:

```typescript
  addFavorite(id: number): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/favorite`, {});
  }

  removeFavorite(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/favorite`);
  }
```

- [ ] **Step 5: Add `isFavorite: false` to every existing `Deck` literal so the bundle compiles**

Because `isFavorite` is now required and all specs compile as one bundle, add `isFavorite: false` to each base `Deck` object literal below (spread-derived literals like `nonOwnerDeck` inherit it automatically — do not touch those):

- `components/Deck/deck-list/deck-list.component.spec.ts` — `ownedDeck` (~line 17) and `publicDeck` (~line 22).
- `components/Deck/deck-detail/deck-detail.component.spec.ts` — `mockDeck` (~line 15).
- `components/Deck/deck-edit/deck-edit.component.spec.ts` — `ownerDeck` (~line 16).
- `components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts` — the defaults object in the `deck()` factory (~line 12).
- `components/Cards/drawn-card/drawn-card.component.spec.ts` — `mockDeck` (~line 14).
- `components/Cards/create-card/create-card.component.spec.ts` — the deck literal (~line 15).
- `components/Cards/card-edit/card-edit.component.spec.ts` — both deck literals (~line 16 and ~line 23).
- `components/Cards/card-detail/card-detail.component.spec.ts` — the deck literal (~line 14).
- `components/TableFortuneTelling/table/table.component.spec.ts` — the deck literal (~line 352).

Each edit inserts `isFavorite: false` alongside the existing `isOwner` field, e.g.:

```typescript
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 3, isPublic: false, isOwner: true, isFavorite: false
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — all specs (including the two new service tests) green, no type errors.

- [ ] **Step 7: Commit**

```powershell
git add fortunecards.client/src/app/models/deck.ts fortunecards.client/src/app/services/deck.service.ts fortunecards.client/src/app
git commit -m "feat(client): add isFavorite model field and favourite service methods"
```

---

### Task 5: Favourite star toggle on deck-list tiles

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.html`
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.css`
- Modify: `fortunecards.client/src/app/components/Deck/deck-list/deck-list.component.spec.ts`

**Interfaces:**
- Consumes: `DeckService.addFavorite`/`removeFavorite` (Task 4), `AuthService.isLoggedIn` (existing).
- Produces: `DeckListComponent.toggleFavorite(deck: Deck, event: Event): void`.

- [ ] **Step 1: Write the failing tests**

In `deck-list.component.spec.ts`: (a) update the two mock decks so `publicDeck` can be favourited, and (b) add tests. First extend `mockDeckService` in `configure()` to include favourite methods:

```typescript
  const mockDeckService = {
    getDecks: () => of([ownedDeck, publicDeck]),
    deleteDeck: () => of(void 0),
    addFavorite: vi.fn(() => of(void 0)),
    removeFavorite: vi.fn(() => of(void 0)),
  };
```

Then add a new `describe` block:

```typescript
  describe('favourites', () => {
    it('shows a star on non-owned decks in search mode when logged in', async () => {
      await configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-fav')).not.toBeNull();
    });

    it('toggleFavorite flips isFavorite and calls the service', async () => {
      await configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.loading.set(false);
      fixture.detectChanges();
      const svc = TestBed.inject(DeckService) as unknown as { addFavorite: ReturnType<typeof vi.fn> };
      const target = component.decks().find((d) => d.id === 2)!;
      component.toggleFavorite(target, new MouseEvent('click'));
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(true);
      expect(svc.addFavorite).toHaveBeenCalledWith(2);
    });

    it('mine mode includes favourited non-owned decks', async () => {
      await configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.decks.set([
        { ...ownedDeck },
        { ...publicDeck, isFavorite: true },
      ]);
      component.loading.set(false);
      expect(component.visibleDecks().map((d) => d.id).sort()).toEqual([1, 2]);
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd fortunecards.client && npx vitest run src/app/components/Deck/deck-list/deck-list.component.spec.ts`
Expected: FAIL — `toggleFavorite` is not a function / `.deck-fav` not found.

- [ ] **Step 3: Update the "mine" filter and add `toggleFavorite`**

In `deck-list.component.ts`, change the `visibleDecks` "mine" branch:

```typescript
    if (this.mode() === 'mine') {
      return all.filter((d) => d.isOwner || d.isFavorite);
    }
```

Add the method to the class (imports `takeUntilDestroyed`, `DestroyRef`, `Deck` are already present):

```typescript
  toggleFavorite(deck: Deck, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = !deck.isFavorite;
    this.setFavorite(deck.id, next);
    const request = next
      ? this.deckService.addFavorite(deck.id)
      : this.deckService.removeFavorite(deck.id);
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.setFavorite(deck.id, !next) });
  }

  private setFavorite(id: number, value: boolean): void {
    this.decks.update((all) =>
      all.map((d) => (d.id === id ? { ...d, isFavorite: value } : d)));
  }
```

- [ ] **Step 4: Add the star button to the template**

In `deck-list.component.html`, inside the `.deck-tile` element (after the `deck-count` span, before the owner badge block):

```html
          @if (auth.isLoggedIn() && !deck.isOwner) {
          <button
            type="button"
            class="deck-fav"
            [class.is-fav]="deck.isFavorite"
            [attr.aria-pressed]="deck.isFavorite"
            [attr.aria-label]="deck.isFavorite ? 'Remove from favourites' : 'Add to favourites'"
            (click)="toggleFavorite(deck, $event)">
            {{ deck.isFavorite ? '★' : '☆' }}
          </button>
          }
```

- [ ] **Step 5: Add the star styling**

Append to `deck-list.component.css`:

```css
.deck-fav {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  padding: 2px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.deck-fav.is-fav { color: #ffd54a; }
```

- [ ] **Step 6: Run the deck-list spec**

Run: `cd fortunecards.client && npx vitest run src/app/components/Deck/deck-list/deck-list.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add fortunecards.client/src/app/components/Deck/deck-list
git commit -m "feat(client): favourite star toggle on deck-list tiles"
```

---

### Task 6: Favourite star in the deck-detail hero

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.ts`
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.html`
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.css`
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`

**Interfaces:**
- Consumes: `DeckService.addFavorite`/`removeFavorite` (Task 4), `AuthService` (new injection here).
- Produces: `DeckDetailComponent.toggleFavorite(): void`; `DeckDetailComponent.auth` (public, for the template).

- [ ] **Step 1: Write the failing tests**

In `deck-detail.component.spec.ts`, add `AuthService` + a favourite-capable `DeckService` to the providers. Replace the `providers` array with:

```typescript
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, currentUser: signal({ id: 1 }) } },
        { provide: DeckService, useValue: { getDeck: () => of(mockDeck), addFavorite: vi.fn(() => of(void 0)), removeFavorite: vi.fn(() => of(void 0)) } },
      ],
```

Add the imports at the top: `import { signal } from '@angular/core';` (extend the existing `@angular/core` import), `import { AuthService } from '../../../services/auth.service';`, and `import { DeckService } from '../../../services/deck.service';`. Then add tests:

```typescript
  it('shows the hero favourite star for a non-owned deck when logged in', () => {
    component.deck.set({ ...mockDeck, isOwner: false });
    component.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-fav')).not.toBeNull();
  });

  it('hides the hero favourite star when the user owns the deck', () => {
    component.deck.set({ ...mockDeck, isOwner: true });
    component.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
  });

  it('toggleFavorite flips isFavorite and calls the service', () => {
    component.deck.set({ ...mockDeck, isOwner: false, isFavorite: false });
    const svc = TestBed.inject(DeckService) as unknown as { addFavorite: ReturnType<typeof vi.fn> };
    component.toggleFavorite();
    expect(component.deck()!.isFavorite).toBe(true);
    expect(svc.addFavorite).toHaveBeenCalledWith(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd fortunecards.client && npx vitest run src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`
Expected: FAIL — `toggleFavorite` not a function / `.hero-fav` not found.

- [ ] **Step 3: Inject `AuthService` and add `toggleFavorite`**

In `deck-detail.component.ts`, add the import `import { AuthService } from '../../../services/auth.service';` and inject it as a public field so the template can read it:

```typescript
  protected readonly auth = inject(AuthService);
```

Add the method:

```typescript
  toggleFavorite(): void {
    const d = this.deck();
    if (!d) return;
    const next = !d.isFavorite;
    this.deck.set({ ...d, isFavorite: next });
    const request = next
      ? this.deckService.addFavorite(d.id)
      : this.deckService.removeFavorite(d.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        const current = this.deck();
        if (current) this.deck.set({ ...current, isFavorite: !next });
      },
    });
  }
```

(`inject`, `takeUntilDestroyed`, and `destroyRef` are already imported/available in this file.)

- [ ] **Step 4: Add the hero star button to the template**

In `deck-detail.component.html`, inside the `.hero-actions` div, add as the first child:

```html
      <button *ngIf="auth.isLoggedIn() && !d.isOwner"
              class="hero-btn hero-fav"
              [class.is-fav]="d.isFavorite"
              [attr.aria-pressed]="d.isFavorite"
              [attr.aria-label]="d.isFavorite ? 'Remove from favourites' : 'Add to favourites'"
              [style.background]="getDeckGradient()"
              (click)="toggleFavorite()">{{ d.isFavorite ? '★ Favourited' : '☆ Favourite' }}</button>
```

- [ ] **Step 5: Add the styling**

Append to `deck-detail.component.css`:

```css
.hero-fav.is-fav { color: #ffd54a; }
```

- [ ] **Step 6: Run the deck-detail spec**

Run: `cd fortunecards.client && npx vitest run src/app/components/Deck/deck-detail/deck-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add fortunecards.client/src/app/components/Deck/deck-detail
git commit -m "feat(client): favourite star in deck-detail hero"
```

---

### Task 7: Include favourites in the table deck-selector

**Files:**
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.ts`
- Modify: `fortunecards.client/src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`

**Interfaces:**
- Consumes: `Deck.isFavorite` (Task 4).

- [ ] **Step 1: Write the failing test**

In `deck-selector.component.spec.ts`, add a favourited non-owned deck to the `decks` array:

```typescript
  const decks = [
    deck({ id: 1, name: 'Mine', isOwner: true, isPublic: false }),
    deck({ id: 2, name: 'Public', isOwner: false, isPublic: true }),
    deck({ id: 3, name: 'Other', isOwner: false, isPublic: false }),
    deck({ id: 4, name: 'Fav', isOwner: false, isPublic: true, isFavorite: true }),
  ];
```

Update the existing authorized test to expect owned **and** favourited decks, and add a dedicated assertion:

```typescript
  it('shows owned and favourited decks when authorized', () => {
    setup(true);
    expect(fixture.componentInstance.visibleDecks().map((d) => d.id).sort()).toEqual([1, 4]);
  });
```

Remove/replace the old `'shows only owned decks when authorized'` test (its `[1]` expectation is now `[1, 4]`); keep its `.deck-search` null assertion inside the new test if desired:

```typescript
    expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
```

- [ ] **Step 2: Run to verify failure**

Run: `cd fortunecards.client && npx vitest run src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`
Expected: FAIL — `visibleDecks()` returns `[1]`, expected `[1, 4]`.

- [ ] **Step 3: Update the authorized filter**

In `deck-selector.component.ts`, change the authorized branch of `visibleDecks`:

```typescript
    if (this.isAuthorized()) return all.filter((d) => d.isOwner || d.isFavorite);
```

- [ ] **Step 4: Run the deck-selector spec**

Run: `cd fortunecards.client && npx vitest run src/app/components/TableFortuneTelling/deck-selector/deck-selector.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite and build the backend**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: all specs PASS.
Run: `dotnet build` (from repo root)
Expected: `Build succeeded`.

- [ ] **Step 6: Commit**

```powershell
git add fortunecards.client/src/app/components/TableFortuneTelling/deck-selector
git commit -m "feat(client): include favourites in table deck-selector"
```

---

## Self-Review

**Spec coverage:**
- Data model / migration → Task 1. ✓
- `IsFavorite` DTO + service compute + Add/Remove → Task 2. ✓
- `PUT`/`DELETE` endpoints → Task 3. ✓
- Model field + service methods → Task 4. ✓
- deck-list star (visibility, toggle, mine-filter) → Task 5. ✓
- deck-detail hero star → Task 6. ✓
- deck-selector includes favourites → Task 7. ✓
- Logged-in-only + not-owner visibility rule → enforced in Tasks 5/6 templates. ✓
- Mixed-together display → no separate section; favourite tiles simply show a filled star (Tasks 5/6). ✓

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and exact commands. ✓

**Type consistency:** `IsFavorite` is the trailing positional field on both `DeckSummary` and `DeckDetail`, matched in all four literals/projections (Task 2 Steps 2–4). Frontend `isFavorite: boolean`, `addFavorite(id)`/`removeFavorite(id)` returning `Observable<void>`, and `toggleFavorite` signatures (`(deck, event)` in list, `()` in detail) are consistent across Tasks 4–7. ✓
