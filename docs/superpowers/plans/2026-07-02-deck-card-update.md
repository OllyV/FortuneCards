# Deck & Card Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a deck's owner review and update their deck and its cards through new backend PATCH endpoints and new frontend review/edit pages, with all owner actions (visibility, delete) consolidated onto the create/edit pages.

**Architecture:** Backend adds multipart `PATCH /api/decks/{id}` and `PATCH /api/cards/{id}` mirroring the existing `[FromForm]` create endpoints, backed by new service methods that enforce ownership via `deck.UserId == HttpContext.Items["UserId"]`. Image saving is extracted into a shared `ImageStorage` helper. Frontend adds owner-only `DeckEditComponent` and `CardEditComponent` plus a public `CardDetailComponent`, wires the deck-detail page to them, moves the public/private choice into create/edit forms, and simplifies the deck tile to a badge-only display.

**Tech Stack:** ASP.NET Core 10 (minimal API, EF Core, in-memory cache), Angular 21 (signals, standalone lazy components, reactive forms, `@if`/`@for`), Jasmine + Karma.

## Global Constraints

- **No database migration** — every edited field already exists on `Deck` and `Card`.
- **Ownership check:** current user id is `HttpContext.Items["UserId"] is int id ? id : null`; owner test is `deck.UserId == userId`. Card ownership resolves via `card.Deck.UserId`.
- **Not-found vs. unauthorized are intentionally conflated** — both return `NotFound` (no existence leak). `401` only when unauthenticated.
- **Update endpoints use `[FromForm]` (multipart)** to support image replacement, matching the create endpoints.
- **Cache invalidation** on any deck/card mutation: `_cache.Remove(AllDecksKey)` and `_cache.Remove(DeckKey(deckId))` where `AllDecksKey = "decks:all"` and `DeckKey(id) => $"decks:{id}"`.
- **Images** are stored in `wwwroot/images` with GUID filenames and served under `/images/...`.
- **Frontend:** Angular signals for state, standalone lazy-loaded components for pages, reactive forms, `takeUntilDestroyed(this.destroyRef)` for subscriptions, TypeScript strict mode.
- **Frontend single test run:** `cd fortunecards.client && ng test --watch=false`.
- **Backend build:** `dotnet build` from repo root.

---

## File Structure

**Backend (`FortuneCards.Server/`)**
- Create `Services/ImageStorage.cs` — static helper: save/delete image files.
- Modify `Services/DeckService.cs` + `Services/IDeckService.cs` — add `IsPublic` to create, add `UpdateAsync`, remove `ToggleVisibilityAsync`.
- Modify `Services/CardService.cs` + `Services/ICardService.cs` — add `UpdateAsync`.
- Modify `Controllers/DecksController.cs` — `IsPublic` on create, add `PATCH {id}`, remove `PATCH {id}/visibility` + `ToggleVisibilityRequest`, add `UpdateDeckRequest`.
- Modify `Controllers/CardsController.cs` — add `PATCH {id}` + `UpdateCardRequest`.

**Frontend (`fortunecards.client/src/app/`)**
- Modify `models/deck.ts` — add `isPublic` to `CreateDeckPayload`.
- Modify `services/deck.service.ts` — add `updateDeck`, share form-building, remove `toggleVisibility`.
- Modify `services/card.service.ts` — add `updateCard`.
- Create `services/deck.service.spec.ts`, `services/card.service.spec.ts`.
- Modify `components/create-deck/*` — add public/private choice.
- Modify `components/deck-list/*` — remove owner controls (badge only).
- Create `components/deck-edit/*` — owner-only deck edit page.
- Create `components/card-detail/*` — single-card review page.
- Create `components/card-edit/*` — owner-only card edit page.
- Modify `components/deck-detail/*` — add "Edit deck" button, make cards open card detail, remove per-card delete.
- Modify `app-routing-module.ts` — add three routes.

---

## Task 1: `ImageStorage` helper (backend)

**Files:**
- Create: `FortuneCards.Server/Services/ImageStorage.cs`

**Interfaces:**
- Produces: `static Task<string> ImageStorage.SaveAsync(IWebHostEnvironment env, IFormFile file)` (returns `/images/{guid}{ext}`); `static void ImageStorage.Delete(IWebHostEnvironment env, string imageUrl)`.

- [ ] **Step 1: Create the helper**

```csharp
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public static class ImageStorage
    {
        public static async Task<string> SaveAsync(IWebHostEnvironment env, IFormFile file)
        {
            var imagesDir = Path.Combine(env.WebRootPath, "images");
            Directory.CreateDirectory(imagesDir);
            var ext = Path.GetExtension(file.FileName);
            var fileName = $"{Guid.NewGuid()}{ext}";
            using var stream = File.Create(Path.Combine(imagesDir, fileName));
            await file.CopyToAsync(stream);
            return $"/images/{fileName}";
        }

        public static void Delete(IWebHostEnvironment env, string imageUrl)
        {
            var fileName = Path.GetFileName(imageUrl);
            var path = Path.Combine(env.WebRootPath, "images", fileName);
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add FortuneCards.Server/Services/ImageStorage.cs
git commit -m "feat: add ImageStorage helper for saving/deleting image files"
```

---

## Task 2: Deck backend — create `IsPublic`, update endpoint, remove visibility toggle

**Files:**
- Modify: `FortuneCards.Server/Services/IDeckService.cs`
- Modify: `FortuneCards.Server/Services/DeckService.cs`
- Modify: `FortuneCards.Server/Controllers/DecksController.cs`

**Interfaces:**
- Consumes: `ImageStorage.SaveAsync`, `ImageStorage.Delete` (Task 1).
- Produces: `Task<DeckDetail?> IDeckService.UpdateAsync(int deckId, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, IFormFile? cardBackImage, int userId)`; `CreateAsync` now takes a trailing-independent `bool isPublic` parameter; `ToggleVisibilityAsync` removed. Endpoint `PATCH /api/decks/{id}` returns `200 OK` with `DeckDetail`, `404` if not found/not owner, `401` if unauthenticated.

- [ ] **Step 1: Update `IDeckService.cs`**

Replace the interface body so `CreateAsync` gains `bool isPublic`, add `UpdateAsync`, and remove `ToggleVisibilityAsync`:

```csharp
    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null);
        Task<DeckDetail?> GetByIdAsync(int id, int? userId = null);
        Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int userId);
        Task<bool> DeleteAsync(int id, int userId);
        Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId);
        Task<DeckDetail?> UpdateAsync(int deckId, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, IFormFile? cardBackImage, int userId);
    }
```

- [ ] **Step 2: Update `CreateAsync` in `DeckService.cs`**

Change the signature to accept `bool isPublic` and use it instead of the hardcoded `false`. Replace the whole method:

```csharp
        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int userId)
        {
            string? cardBackImageUrl = null;
            if (cardBackImage is { Length: > 0 })
                cardBackImageUrl = await ImageStorage.SaveAsync(_env, cardBackImage);

            var deck = new Deck
            {
                Name = name,
                Description = description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageUrl = cardBackImageUrl,
                UserId = userId,
                IsPublic = isPublic
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl, deck.IsPublic, true);
        }
```

- [ ] **Step 3: Replace `ToggleVisibilityAsync` with `UpdateAsync` in `DeckService.cs`**

Delete the entire `ToggleVisibilityAsync` method and add `UpdateAsync` in its place:

```csharp
        public async Task<DeckDetail?> UpdateAsync(int deckId, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, IFormFile? cardBackImage, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return null;

            if (!string.IsNullOrWhiteSpace(name)) deck.Name = name;
            if (!string.IsNullOrWhiteSpace(emoji)) deck.Emoji = emoji;
            if (colorIndex.HasValue) deck.ColorIndex = colorIndex.Value;
            if (isPublic.HasValue) deck.IsPublic = isPublic.Value;
            // Edit form always submits the full description; empty clears it.
            deck.Description = string.IsNullOrWhiteSpace(description) ? null : description;

            if (cardBackImage is { Length: > 0 })
            {
                if (deck.CardBackImageUrl is not null) ImageStorage.Delete(_env, deck.CardBackImageUrl);
                deck.CardBackImageUrl = await ImageStorage.SaveAsync(_env, cardBackImage);
            }

            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return await GetByIdAsync(deckId, userId);
        }
```

Note: `GetByIdAsync(deckId, userId)` does not read the cache when `userId` is non-null, so it returns fresh data with the correct `IsOwner`.

- [ ] **Step 4: Update `DecksController.cs`**

Change the `CreateDeck` action to pass `IsPublic`, replace the `ToggleVisibility` action with `UpdateDeck`, and swap the request DTOs. Replace the `CreateDeck` action body call:

```csharp
        [HttpPost]
        public async Task<IActionResult> CreateDeck([FromForm] CreateDeckRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var deck = await _decks.CreateAsync(
                request.Name, request.Description,
                request.Emoji ?? "🎴", request.ColorIndex ?? 0,
                request.IsPublic ?? false,
                request.CardBackImage, userId);
            return CreatedAtAction(nameof(GetDeck), new { id = deck.Id }, deck);
        }
```

Delete the `ToggleVisibility` action (the `[HttpPatch("{id}/visibility")]` method) and add this new action (place it after `AddCard`):

```csharp
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateDeck(int id, [FromForm] UpdateDeckRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var deck = await _decks.UpdateAsync(
                id, request.Name, request.Description, request.Emoji,
                request.ColorIndex, request.IsPublic, request.CardBackImage, userId);
            return deck is null ? NotFound() : Ok(deck);
        }
```

Add `IsPublic` to `CreateDeckRequest`, delete `ToggleVisibilityRequest`, and add `UpdateDeckRequest`:

```csharp
    public class CreateDeckRequest
    {
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
        public IFormFile? CardBackImage { get; set; }
    }

    public class UpdateDeckRequest
    {
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
        public IFormFile? CardBackImage { get; set; }
    }
```

(`AddCardRequest` is unchanged.)

- [ ] **Step 5: Build to verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, 0 errors. (Confirms no remaining references to `ToggleVisibilityAsync`/`ToggleVisibilityRequest`.)

- [ ] **Step 6: Commit**

```bash
git add FortuneCards.Server/Services/IDeckService.cs FortuneCards.Server/Services/DeckService.cs FortuneCards.Server/Controllers/DecksController.cs
git commit -m "feat: add deck PATCH endpoint and IsPublic on create; remove visibility toggle"
```

---

## Task 3: Card backend — update endpoint

**Files:**
- Modify: `FortuneCards.Server/Services/ICardService.cs`
- Modify: `FortuneCards.Server/Services/CardService.cs`
- Modify: `FortuneCards.Server/Controllers/CardsController.cs`

**Interfaces:**
- Consumes: `ImageStorage.SaveAsync`, `ImageStorage.Delete` (Task 1); `CardDto` record.
- Produces: `Task<CardDto?> ICardService.UpdateAsync(int cardId, string? title, string? description, IFormFile? image, int userId)`. Endpoint `PATCH /api/cards/{id}` returns `200 OK` with `CardDto`, `404` if not found/not owner, `401` if unauthenticated.

- [ ] **Step 1: Update `ICardService.cs`**

```csharp
namespace FortuneCards.Server.Services
{
    public record CardDto(int Id, string Title, string Description, string ImageUrl, DateTime CreatedAt);

    public interface ICardService
    {
        Task<bool> DeleteAsync(int id, int userId);
        Task<CardDto?> UpdateAsync(int cardId, string? title, string? description, IFormFile? image, int userId);
    }
}
```

- [ ] **Step 2: Add `UpdateAsync` to `CardService.cs`**

Add this method after `DeleteAsync` (it reuses the existing `_db`, `_cache`, `_env` fields):

```csharp
        public async Task<CardDto?> UpdateAsync(int cardId, string? title, string? description, IFormFile? image, int userId)
        {
            var card = await _db.Cards
                .Include(c => c.Deck)
                .FirstOrDefaultAsync(c => c.Id == cardId);

            if (card is null || card.Deck?.UserId != userId) return null;

            if (!string.IsNullOrWhiteSpace(title)) card.Title = title;
            if (!string.IsNullOrWhiteSpace(description)) card.Description = description;

            if (image is { Length: > 0 })
            {
                ImageStorage.Delete(_env, card.ImageUrl);
                card.ImageUrl = await ImageStorage.SaveAsync(_env, image);
            }

            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(card.DeckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }
```

- [ ] **Step 3: Add the endpoint to `CardsController.cs`**

Add the action after `DeleteCard`, and add the `UpdateCardRequest` class inside the namespace:

```csharp
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateCard(int id, [FromForm] UpdateCardRequest request)
        {
            if (HttpContext.Items["UserId"] is not int userId) return Unauthorized();
            var card = await _cards.UpdateAsync(id, request.Title, request.Description, request.Image, userId);
            return card is null ? NotFound() : Ok(card);
        }
```

```csharp
    public class UpdateCardRequest
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public IFormFile? Image { get; set; }
    }
```

(Add `using Microsoft.AspNetCore.Http;` if `IFormFile` is not already resolved — it is available via the SDK's implicit usings in this project, so a build check confirms.)

- [ ] **Step 4: Build to verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Services/ICardService.cs FortuneCards.Server/Services/CardService.cs FortuneCards.Server/Controllers/CardsController.cs
git commit -m "feat: add card PATCH endpoint"
```

---

## Task 4: Frontend models + service methods

**Files:**
- Modify: `fortunecards.client/src/app/models/deck.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`
- Modify: `fortunecards.client/src/app/services/card.service.ts`
- Create: `fortunecards.client/src/app/services/deck.service.spec.ts`
- Create: `fortunecards.client/src/app/services/card.service.spec.ts`

**Interfaces:**
- Produces: `CreateDeckPayload` now has `isPublic: boolean`; `DeckService.updateDeck(id: number, payload: CreateDeckPayload): Observable<Deck>`; `CardService.updateCard(id: number, title: string, description: string, image?: File): Observable<Card>`. `DeckService.toggleVisibility` removed. `DeckService.deleteDeck` unchanged (still present).

- [ ] **Step 1: Write failing service specs**

Create `fortunecards.client/src/app/services/deck.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DeckService } from './deck.service';
import { CreateDeckPayload } from '../models/deck';

describe('DeckService', () => {
  let service: DeckService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        DeckService,
      ],
    });
    service = TestBed.inject(DeckService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should PATCH /api/decks/:id with FormData including isPublic', () => {
    const payload: CreateDeckPayload = {
      name: 'Updated', description: 'New desc', emoji: '🌟', colorIndex: 2, isPublic: true,
    };
    service.updateDeck(7, payload).subscribe();

    const req = httpMock.expectOne('/api/decks/7');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('name')).toBe('Updated');
    expect(body.get('isPublic')).toBe('true');
    expect(body.get('colorIndex')).toBe('2');
    req.flush({});
  });
});
```

Create `fortunecards.client/src/app/services/card.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CardService } from './card.service';

describe('CardService', () => {
  let service: CardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CardService,
      ],
    });
    service = TestBed.inject(CardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should PATCH /api/cards/:id with title and description', () => {
    service.updateCard(3, 'The Star', 'Hope').subscribe();
    const req = httpMock.expectOne('/api/cards/3');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('The Star');
    expect(body.get('description')).toBe('Hope');
    req.flush({});
  });
});
```

- [ ] **Step 2: Run specs to verify they fail**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `updateDeck`/`updateCard` do not exist / `isPublic` missing from `CreateDeckPayload` (TypeScript compile error).

- [ ] **Step 3: Add `isPublic` to `CreateDeckPayload` in `models/deck.ts`**

```typescript
export interface CreateDeckPayload {
  name: string;
  description: string | null;
  emoji: string;
  colorIndex: number;
  isPublic: boolean;
  cardBackImage?: File;
}
```

- [ ] **Step 4: Update `deck.service.ts`**

Replace `createDeck` and `toggleVisibility` with a shared form builder + `updateDeck` (keep `getDecks`, `getDeck`, `deleteDeck`, `addCard` as they are):

```typescript
  createDeck(payload: CreateDeckPayload): Observable<Deck> {
    return this.http.post<Deck>(this.base, this.buildDeckForm(payload));
  }

  updateDeck(id: number, payload: CreateDeckPayload): Observable<Deck> {
    return this.http.patch<Deck>(`${this.base}/${id}`, this.buildDeckForm(payload));
  }

  private buildDeckForm(payload: CreateDeckPayload): FormData {
    const form = new FormData();
    form.append('name', payload.name);
    form.append('description', payload.description ?? '');
    form.append('emoji', payload.emoji);
    form.append('colorIndex', payload.colorIndex.toString());
    form.append('isPublic', payload.isPublic.toString());
    if (payload.cardBackImage) {
      form.append('cardBackImage', payload.cardBackImage, payload.cardBackImage.name);
    }
    return form;
  }
```

Delete the old `toggleVisibility` method entirely.

- [ ] **Step 5: Add `updateCard` to `card.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from '../models/card';

@Injectable({ providedIn: 'root' })
export class CardService {
  constructor(private http: HttpClient) {}

  deleteCard(id: number): Observable<void> {
    return this.http.delete<void>(`/api/cards/${id}`);
  }

  updateCard(id: number, title: string, description: string, image?: File): Observable<Card> {
    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    if (image) form.append('image', image, image.name);
    return this.http.patch<Card>(`/api/cards/${id}`, form);
  }
}
```

- [ ] **Step 6: Run specs to verify they pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — new `DeckService`/`CardService` specs green; existing suite still green.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/models/deck.ts fortunecards.client/src/app/services/deck.service.ts fortunecards.client/src/app/services/card.service.ts fortunecards.client/src/app/services/deck.service.spec.ts fortunecards.client/src/app/services/card.service.spec.ts
git commit -m "feat: add updateDeck/updateCard services and isPublic payload; remove toggleVisibility"
```

---

## Task 5: Create-deck page — public/private choice

**Files:**
- Modify: `fortunecards.client/src/app/components/create-deck/create-deck.component.ts`
- Modify: `fortunecards.client/src/app/components/create-deck/create-deck.component.html`
- Modify: `fortunecards.client/src/app/components/create-deck/create-deck.component.css`

**Interfaces:**
- Consumes: `CreateDeckPayload.isPublic` (Task 4).
- Produces: create form now has an `isPublic` control (default `false`) sent in the create payload.

- [ ] **Step 1: Add the `isPublic` control and include it in the payload (`create-deck.component.ts`)**

In the `this.form = this.fb.group({...})` block, add the control:

```typescript
    this.form = this.fb.group({
      emoji:       ['🎴', [Validators.required, Validators.maxLength(10)]],
      colorIndex:  [0, Validators.required],
      name:        ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)],
      isPublic:    [false],
    });
```

In `submit()`, add `isPublic` to the object passed to `createDeck`:

```typescript
    this.deckService.createDeck({
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🎴',
      colorIndex: v.colorIndex ?? 0,
      isPublic: v.isPublic ?? false,
      cardBackImage: this.cardBackFile() ?? undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef))
```

- [ ] **Step 2: Add the visibility field to `create-deck.component.html`**

Insert this block immediately before the `<!-- Name -->` field:

```html
      <!-- Visibility -->
      <div class="form-field">
        <label class="form-label">Visibility</label>
        <div class="visibility-row">
          <button type="button" class="visibility-btn"
                  [class.visibility-btn--active]="!form.get('isPublic')!.value"
                  (click)="form.get('isPublic')!.setValue(false)">🔒 Private</button>
          <button type="button" class="visibility-btn"
                  [class.visibility-btn--active]="form.get('isPublic')!.value"
                  (click)="form.get('isPublic')!.setValue(true)">🌐 Public</button>
        </div>
      </div>
```

- [ ] **Step 3: Add visibility styles to `create-deck.component.css`**

Append:

```css
.visibility-row { display: flex; gap: 10px; margin-top: 6px; }

.visibility-btn {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-muted);
  background: white;
  border: 2px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.visibility-btn--active {
  color: var(--color-coral);
  border-color: var(--color-coral);
}
```

- [ ] **Step 4: Run the suite to verify nothing broke**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — existing `CreateDeckComponent` specs still green (the new control has no validators that would invalidate a previously-valid form).

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/create-deck/
git commit -m "feat: add public/private choice to create-deck form"
```

---

## Task 6: Deck list — badge-only tile

**Files:**
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.html`
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.css`

**Interfaces:**
- Produces: `DeckListComponent` no longer has `deleteDeck`/`toggleVisibility` methods; tile shows only the visibility badge.

- [ ] **Step 1: Remove owner-control methods from `deck-list.component.ts`**

Delete the entire `deleteDeck(...)` and `toggleVisibility(...)` methods. The `AuthService`/`DestroyRef` fields and the `effect` remain. Resulting class keeps: `loadDecks`, `getDeckGradient`, `getDeckShadow`, `goToNew`.

- [ ] **Step 2: Remove the owner-controls block from `deck-list.component.html`**

Delete this block (the `@if (deck.isOwner) { <div class="deck-owner-controls"> ... </div> }`):

```html
            @if (deck.isOwner) {
              <div class="deck-owner-controls">
                @if (deck.isPublic) {
                  <button class="deck-toggle-btn" (click)="toggleVisibility(deck, false, $event)" title="Make private">🔒 Make private</button>
                } @else {
                  <button class="deck-toggle-btn" (click)="toggleVisibility(deck, true, $event)" title="Make public">🌐 Make public</button>
                }
                <button class="deck-delete" (click)="deleteDeck(deck.id, $event)" title="Delete deck">✕</button>
              </div>
            }
```

Keep the badge block (`@if (deck.isOwner) { @if (deck.isPublic) { ...public... } @else { ...private... } }`) exactly as it is.

- [ ] **Step 3: Remove now-unused styles from `deck-list.component.css`**

Delete the `.deck-delete`, `.deck-owner-controls`, `.deck-toggle-btn`, and `.deck-toggle-btn:hover` rules. Keep `.deck-badge`, `.deck-badge.public`, `.deck-badge.private`, and all layout styles.

- [ ] **Step 4: Run the suite**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — `DeckListComponent` specs (tile count, gradient, emoji/name) still green; no reference to the removed methods remains.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/components/deck-list/
git commit -m "feat: simplify deck tile to visibility badge only"
```

---

## Task 7: `DeckEditComponent` (owner-only) + route

**Files:**
- Create: `fortunecards.client/src/app/components/deck-edit/deck-edit.component.ts`
- Create: `fortunecards.client/src/app/components/deck-edit/deck-edit.component.html`
- Create: `fortunecards.client/src/app/components/deck-edit/deck-edit.component.css`
- Create: `fortunecards.client/src/app/components/deck-edit/deck-edit.component.spec.ts`
- Modify: `fortunecards.client/src/app/app-routing-module.ts`

**Interfaces:**
- Consumes: `DeckService.getDeck`, `DeckService.updateDeck`, `DeckService.deleteDeck` (Task 4); `getDeckGradientStyle`.
- Produces: route `decks/:id/edit` → `DeckEditComponent`.

- [ ] **Step 1: Write the failing spec**

Create `deck-edit.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DeckEditComponent } from './deck-edit.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const ownerDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 3,
  cardBackImageUrl: null, isPublic: true, isOwner: true,
};

describe('DeckEditComponent', () => {
  let component: DeckEditComponent;
  let fixture: ComponentFixture<DeckEditComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(ownerDeck) };
    await TestBed.configureTestingModule({
      imports: [DeckEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should prefill the form from the loaded deck', () => {
    expect(component.form.get('name')!.value).toBe('Adventure');
    expect(component.form.get('colorIndex')!.value).toBe(3);
    expect(component.form.get('isPublic')!.value).toBe(true);
  });

  it('should be invalid when name is cleared', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `DeckEditComponent` does not exist.

- [ ] **Step 3: Create `deck-edit.component.ts`**

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle } from '../../utils/deck-colors';
import { NavigationBar } from '../navigation-bar/navigation-bar';

@Component({
  selector: 'app-deck-edit',
  templateUrl: './deck-edit.component.html',
  styleUrls: ['./deck-edit.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar],
})
export class DeckEditComponent implements OnInit {
  readonly GRADIENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  form: FormGroup;
  deckId = signal(0);
  currentBackUrl = signal<string | null>(null);
  cardBackFile = signal<File | null>(null);
  cardBackPreview = signal<string | null>(null);
  submitting = signal(false);
  deleting = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {
    this.form = this.fb.group({
      emoji:       ['🎴', [Validators.required, Validators.maxLength(10)]],
      colorIndex:  [0, Validators.required],
      name:        ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)],
      isPublic:    [false],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = Number(params['id']);
      this.deckId.set(id);
      this.deckService.getDeck(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            if (!deck.isOwner) { this.router.navigate(['/decks', id]); return; }
            this.form.patchValue({
              emoji: deck.emoji,
              colorIndex: deck.colorIndex,
              name: deck.name,
              description: deck.description ?? '',
              isPublic: deck.isPublic,
            });
            this.currentBackUrl.set(deck.cardBackImageUrl);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
        });
    });
  }

  getGradientStyle(index: number): string {
    return getDeckGradientStyle(index);
  }

  getSelectedGradient(): string {
    return getDeckGradientStyle(this.form.get('colorIndex')!.value ?? 0);
  }

  selectColor(index: number): void {
    this.form.get('colorIndex')!.setValue(index);
  }

  onCardBackSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.cardBackFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.cardBackPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeCardBack(): void {
    this.cardBackFile.set(null);
    this.cardBackPreview.set(null);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.deckService.updateDeck(this.deckId(), {
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🎴',
      colorIndex: v.colorIndex ?? 0,
      isPublic: v.isPublic ?? false,
      cardBackImage: this.cardBackFile() ?? undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks', this.deckId()]),
        error: () => { this.error.set('Failed to save deck.'); this.submitting.set(false); }
      });
  }

  deleteDeck(): void {
    if (!confirm('Delete this deck and all its cards?')) return;
    this.deleting.set(true);
    this.deckService.deleteDeck(this.deckId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks']),
        error: () => { this.error.set('Failed to delete deck.'); this.deleting.set(false); }
      });
  }

  cancel(): void {
    this.router.navigate(['/decks', this.deckId()]);
  }
}
```

- [ ] **Step 4: Create `deck-edit.component.html`**

```html
<div class="form-page">
  <navigation-bar>
    <button class="btn-ghost" (click)="cancel()">✕ Cancel</button>
    <span class="nav-title-centered">Edit Deck</span>
    <button class="btn-ghost btn-ghost--action"
            [disabled]="form.invalid || submitting()"
            (click)="submit()">
      Save
    </button>
  </navigation-bar>

  <main class="form-content">
    <form (ngSubmit)="submit()" [formGroup]="form">

      <!-- Emoji input -->
      <div class="emoji-section">
        <div class="emoji-preview" [style.background]="getSelectedGradient()">
          <input class="emoji-input"
                 formControlName="emoji"
                 maxlength="10"
                 placeholder="🎴"
                 aria-label="Deck emoji" />
        </div>
        <p class="emoji-hint">Type or paste an emoji</p>
      </div>

      <!-- Color swatches -->
      <div class="form-field">
        <label class="form-label">Color</label>
        <div class="swatch-row">
          <button type="button"
                  class="color-swatch"
                  *ngFor="let i of GRADIENTS"
                  [style.background]="getGradientStyle(i)"
                  [class.swatch--selected]="form.get('colorIndex')!.value === i"
                  (click)="selectColor(i)"></button>
        </div>
      </div>

      <!-- Card back upload -->
      <div class="form-field">
        <label class="form-label">Card Back <span>(optional)</span></label>
        <div class="card-back-row">
          <div class="card-back-preview">
            <img *ngIf="cardBackPreview()" [src]="cardBackPreview()!" alt="Card back preview" />
            <img *ngIf="!cardBackPreview() && currentBackUrl()" [src]="currentBackUrl()!" alt="Current card back" />
            <div *ngIf="!cardBackPreview() && !currentBackUrl()"
                 class="card-back-gradient"
                 [style.background]="getSelectedGradient()">
              <span>🎴</span>
            </div>
          </div>
          <div class="card-back-actions">
            <p class="card-back-status" *ngIf="cardBackPreview()">✓ New back selected</p>
            <label class="btn-secondary btn-file">
              📷 {{ (cardBackPreview() || currentBackUrl()) ? 'Replace Image' : 'Upload Image' }}
              <input type="file" accept="image/*" (change)="onCardBackSelected($event)" hidden />
            </label>
            <button type="button" class="btn-ghost" *ngIf="cardBackPreview()" (click)="removeCardBack()">✕ Undo</button>
          </div>
        </div>
      </div>

      <!-- Name -->
      <div class="form-field">
        <label class="form-label" for="deckName">Deck Name</label>
        <input id="deckName"
               class="form-input"
               formControlName="name"
               placeholder="e.g. Adventure Deck"
               maxlength="200" />
      </div>

      <!-- Description -->
      <div class="form-field">
        <label class="form-label" for="deckDesc">Description <span>(optional)</span></label>
        <textarea id="deckDesc"
                  class="form-textarea"
                  formControlName="description"
                  placeholder="What is this deck about?"
                  maxlength="1000"
                  rows="3"></textarea>
      </div>

      <!-- Visibility -->
      <div class="form-field">
        <label class="form-label">Visibility</label>
        <div class="visibility-row">
          <button type="button" class="visibility-btn"
                  [class.visibility-btn--active]="!form.get('isPublic')!.value"
                  (click)="form.get('isPublic')!.setValue(false)">🔒 Private</button>
          <button type="button" class="visibility-btn"
                  [class.visibility-btn--active]="form.get('isPublic')!.value"
                  (click)="form.get('isPublic')!.setValue(true)">🌐 Public</button>
        </div>
      </div>

      <div *ngIf="error()" class="state-error">{{ error() }}</div>

      <button type="submit"
              class="btn-primary btn-full"
              [disabled]="form.invalid || submitting()">
        {{ submitting() ? 'Saving…' : '💾 Save Changes' }}
      </button>

      <button type="button"
              class="btn-danger btn-full"
              [disabled]="deleting()"
              (click)="deleteDeck()">
        {{ deleting() ? 'Deleting…' : '🗑 Delete Deck' }}
      </button>
    </form>
  </main>
</div>
```

- [ ] **Step 5: Create `deck-edit.component.css`**

```css
.form-page { display: flex; flex-direction: column; min-height: 100vh; }

.form-content {
  padding: 24px 20px 48px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.form-content form { display: flex; flex-direction: column; gap: 20px; }

.emoji-section { display: flex; flex-direction: column; align-items: center; gap: 8px; }

.emoji-preview {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}

.emoji-input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 36px;
  width: 48px;
  text-align: center;
  cursor: text;
}

.emoji-hint { font-size: 11px; color: var(--color-muted); font-weight: 600; }

.form-field { display: flex; flex-direction: column; }

.swatch-row { display: flex; gap: 10px; margin-top: 6px; }

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.swatch--selected {
  box-shadow: 0 0 0 3px white, 0 0 0 5px var(--color-coral);
  transform: scale(1.1);
}

.card-back-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 6px;
}

.card-back-preview {
  width: 60px;
  height: 90px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
}

.card-back-preview img { width: 100%; height: 100%; object-fit: cover; }

.card-back-gradient {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.card-back-actions { display: flex; flex-direction: column; gap: 6px; }

.card-back-status { font-size: 12px; font-weight: 700; color: var(--color-charcoal); }

.btn-file { display: inline-block; cursor: pointer; padding: 8px 16px; font-size: 13px; }
.btn-ghost--action { color: var(--color-coral); font-weight: 800; }
.btn-ghost--action:disabled { opacity: 0.4; }
.btn-full { width: 100%; }

.visibility-row { display: flex; gap: 10px; margin-top: 6px; }

.visibility-btn {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-muted);
  background: white;
  border: 2px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.visibility-btn--active { color: var(--color-coral); border-color: var(--color-coral); }

.btn-danger {
  background: none;
  border: 2px solid #e0b4b4;
  color: #c0392b;
  border-radius: var(--radius-pill);
  padding: 12px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
.btn-danger:disabled { opacity: 0.4; }
```

- [ ] **Step 6: Add the route in `app-routing-module.ts`**

Add this route entry immediately before the `{ path: 'decks/:id/draw', ... }` entry:

```typescript
  {
    path: 'decks/:id/edit',
    loadComponent: () => import('./components/deck-edit/deck-edit.component').then((c) => c.DeckEditComponent),
    canActivate: [authGuard]
  },
```

- [ ] **Step 7: Run spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — `DeckEditComponent` prefill + validation specs green.

- [ ] **Step 8: Commit**

```bash
git add fortunecards.client/src/app/components/deck-edit/ fortunecards.client/src/app/app-routing-module.ts
git commit -m "feat: add owner-only deck edit page with visibility and delete"
```

---

## Task 8: `CardDetailComponent` (review) + route

**Files:**
- Create: `fortunecards.client/src/app/components/card-detail/card-detail.component.ts`
- Create: `fortunecards.client/src/app/components/card-detail/card-detail.component.html`
- Create: `fortunecards.client/src/app/components/card-detail/card-detail.component.css`
- Create: `fortunecards.client/src/app/components/card-detail/card-detail.component.spec.ts`
- Modify: `fortunecards.client/src/app/app-routing-module.ts`

**Interfaces:**
- Consumes: `DeckService.getDeck` (Task 4); `Deck`, `Card` models.
- Produces: route `decks/:id/cards/:cardId` → `CardDetailComponent`. Public methods `editCard()`, `goBack()`, `isOwner()`.

- [ ] **Step 1: Write the failing spec**

Create `card-detail.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CardDetailComponent } from './card-detail.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const deckWithCard: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, isPublic: true, isOwner: true,
  cards: [{ id: 5, title: 'The Star', description: 'Hope and renewal', imageUrl: '/images/x.png', createdAt: '2026-01-01', deckId: 1 }],
};

describe('CardDetailComponent', () => {
  let component: CardDetailComponent;
  let fixture: ComponentFixture<CardDetailComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(deckWithCard) };
    await TestBed.configureTestingModule({
      imports: [CardDetailComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1', cardId: '5' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should load and display the card title and description', () => {
    expect(component.card()?.title).toBe('The Star');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('The Star');
    expect(text).toContain('Hope and renewal');
  });

  it('should expose isOwner from the loaded deck', () => {
    expect(component.isOwner()).toBe(true);
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `CardDetailComponent` does not exist.

- [ ] **Step 3: Create `card-detail.component.ts`**

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';
import { DeckService } from '../../services/deck.service';
import { NavigationBar } from '../navigation-bar/navigation-bar';

@Component({
  selector: 'app-card-detail',
  templateUrl: './card-detail.component.html',
  styleUrls: ['./card-detail.component.css'],
  standalone: true,
  imports: [CommonModule, NavigationBar],
})
export class CardDetailComponent implements OnInit {
  deckId = signal(0);
  cardId = signal(0);
  deck = signal<Deck | null>(null);
  card = signal<Card | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const deckId = Number(params['id']);
      const cardId = Number(params['cardId']);
      this.deckId.set(deckId);
      this.cardId.set(cardId);
      this.deckService.getDeck(deckId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            this.deck.set(deck);
            this.card.set((deck.cards ?? []).find(c => c.id === cardId) ?? null);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load card.'); this.loading.set(false); }
        });
    });
  }

  isOwner(): boolean {
    return this.deck()?.isOwner ?? false;
  }

  editCard(): void {
    this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId(), 'edit']);
  }

  goBack(): void {
    this.router.navigate(['/decks', this.deckId()]);
  }
}
```

- [ ] **Step 4: Create `card-detail.component.html`**

```html
<div class="page">
  <navigation-bar>
    <div class="nav-actions">
      <button class="nav-back" (click)="goBack()">← Back to deck</button>
    </div>
  </navigation-bar>

  <main class="page-content">
    <div *ngIf="card() as c; else notFoundOrLoading" class="card-detail">
      <div class="card-figure">
        <img *ngIf="c.imageUrl" [src]="c.imageUrl" [alt]="c.title" />
        <span *ngIf="!c.imageUrl" class="card-figure-placeholder">🃏</span>
      </div>
      <h1 class="card-detail-title">{{ c.title }}</h1>
      <p class="card-detail-desc">{{ c.description }}</p>

      <button *ngIf="isOwner()" class="btn-primary btn-full" (click)="editCard()">✏️ Edit Card</button>
    </div>

    <ng-template #notFoundOrLoading>
      <div *ngIf="loading()" class="state-loading">Loading card…</div>
      <div *ngIf="!loading() && error()" class="state-error">{{ error() }}</div>
      <div *ngIf="!loading() && !error()" class="state-error">Card not found.</div>
    </ng-template>
  </main>
</div>
```

- [ ] **Step 5: Create `card-detail.component.css`**

```css
.page { display: flex; flex-direction: column; min-height: 100vh; }

.page-content {
  padding: 24px 20px 48px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.nav-back { background: none; border: none; font-size: 14px; font-weight: 700; color: var(--color-charcoal); cursor: pointer; }

.card-detail { display: flex; flex-direction: column; align-items: center; gap: 16px; }

.card-figure {
  aspect-ratio: 2/3;
  width: 220px;
  max-width: 70%;
  background: white;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-figure img { width: 100%; height: 100%; object-fit: cover; }
.card-figure-placeholder { font-size: 48px; }

.card-detail-title { font-size: 22px; font-weight: 800; text-align: center; }
.card-detail-desc { font-size: 14px; color: var(--color-charcoal); line-height: 1.6; text-align: center; white-space: pre-wrap; }

.btn-full { width: 100%; margin-top: 8px; }
```

- [ ] **Step 6: Add the route in `app-routing-module.ts`**

Add both card routes immediately before the `{ path: 'decks/:id/edit', ... }` entry, ordered so the static `cards/new` and the `.../edit` routes match before the generic `cards/:cardId`. Final relevant order (top to bottom): `decks/new`, `decks/:id/cards/new`, `decks/:id/cards/:cardId/edit`, `decks/:id/cards/:cardId`, `decks/:id/edit`, `decks/:id/draw`, `decks/:id`, `decks`. For this task add only the review route (the `.../edit` route is added in Task 9):

```typescript
  {
    path: 'decks/:id/cards/:cardId',
    loadComponent: () => import('./components/card-detail/card-detail.component').then((c) => c.CardDetailComponent)
  },
```

Place it after `decks/:id/cards/new` and before `decks/:id/edit`.

- [ ] **Step 7: Run spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — `CardDetailComponent` specs green.

- [ ] **Step 8: Commit**

```bash
git add fortunecards.client/src/app/components/card-detail/ fortunecards.client/src/app/app-routing-module.ts
git commit -m "feat: add single-card review page"
```

---

## Task 9: `CardEditComponent` (owner-only) + route

**Files:**
- Create: `fortunecards.client/src/app/components/card-edit/card-edit.component.ts`
- Create: `fortunecards.client/src/app/components/card-edit/card-edit.component.html`
- Create: `fortunecards.client/src/app/components/card-edit/card-edit.component.css`
- Create: `fortunecards.client/src/app/components/card-edit/card-edit.component.spec.ts`
- Modify: `fortunecards.client/src/app/app-routing-module.ts`

**Interfaces:**
- Consumes: `DeckService.getDeck` (Task 4); `CardService.updateCard`, `CardService.deleteCard` (Task 4); `Deck`, `Card` models.
- Produces: route `decks/:id/cards/:cardId/edit` → `CardEditComponent`.

- [ ] **Step 1: Write the failing spec**

Create `card-edit.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CardEditComponent } from './card-edit.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const deckWithCard: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, isPublic: true, isOwner: true,
  cards: [{ id: 5, title: 'The Star', description: 'Hope', imageUrl: '/images/x.png', createdAt: '2026-01-01', deckId: 1 }],
};

describe('CardEditComponent', () => {
  let component: CardEditComponent;
  let fixture: ComponentFixture<CardEditComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(deckWithCard) };
    await TestBed.configureTestingModule({
      imports: [CardEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1', cardId: '5' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should prefill the form from the loaded card', () => {
    expect(component.form.get('title')!.value).toBe('The Star');
    expect(component.form.get('description')!.value).toBe('Hope');
    expect(component.currentImageUrl()).toBe('/images/x.png');
  });

  it('should be invalid when title is cleared', () => {
    component.form.get('title')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `CardEditComponent` does not exist.

- [ ] **Step 3: Create `card-edit.component.ts`**

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DeckService } from '../../services/deck.service';
import { CardService } from '../../services/card.service';
import { NavigationBar } from '../navigation-bar/navigation-bar';

@Component({
  selector: 'app-card-edit',
  templateUrl: './card-edit.component.html',
  styleUrls: ['./card-edit.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar],
})
export class CardEditComponent implements OnInit {
  deckId = signal(0);
  cardId = signal(0);
  form: FormGroup;

  currentImageUrl = signal<string | null>(null);
  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  submitting = signal(false);
  deleting = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private cardService: CardService
  ) {
    this.form = this.fb.group({
      title:       ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.maxLength(2000)]],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const deckId = Number(params['id']);
      const cardId = Number(params['cardId']);
      this.deckId.set(deckId);
      this.cardId.set(cardId);
      this.deckService.getDeck(deckId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            if (!deck.isOwner) { this.router.navigate(['/decks', deckId, 'cards', cardId]); return; }
            const card = (deck.cards ?? []).find(c => c.id === cardId);
            if (!card) { this.error.set('Card not found.'); this.loading.set(false); return; }
            this.form.patchValue({ title: card.title, description: card.description });
            this.currentImageUrl.set(card.imageUrl);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load card.'); this.loading.set(false); }
        });
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.imageFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.imageFile.set(null);
    this.imagePreview.set(null);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.cardService.updateCard(this.cardId(), v.title!, v.description!, this.imageFile() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId()]),
        error: () => { this.error.set('Failed to save card.'); this.submitting.set(false); }
      });
  }

  deleteCard(): void {
    if (!confirm('Remove this card from the deck?')) return;
    this.deleting.set(true);
    this.cardService.deleteCard(this.cardId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks', this.deckId()]),
        error: () => { this.error.set('Failed to delete card.'); this.deleting.set(false); }
      });
  }

  cancel(): void {
    this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId()]);
  }
}
```

- [ ] **Step 4: Create `card-edit.component.html`**

```html
<div class="form-page">
  <navigation-bar>
    <button class="btn-ghost" (click)="cancel()">✕ Cancel</button>
    <span class="nav-title-centered">Edit Card</span>
    <button class="btn-ghost btn-ghost--action"
            [disabled]="form.invalid || submitting()"
            (click)="submit()">
      Save
    </button>
  </navigation-bar>

  <main class="form-content">
    <form (ngSubmit)="submit()" [formGroup]="form">

      <!-- Card image -->
      <div class="form-field image-field">
        <label class="form-label">Card Image</label>
        <div class="image-upload-area" [class.has-image]="imagePreview() || currentImageUrl()">
          <img *ngIf="imagePreview()" [src]="imagePreview()" class="image-preview" alt="Card preview" />
          <img *ngIf="!imagePreview() && currentImageUrl()" [src]="currentImageUrl()!" class="image-preview" alt="Current card image" />
          <div *ngIf="!imagePreview() && !currentImageUrl()" class="image-placeholder">
            <span class="image-placeholder-icon">🖼️</span>
            <p class="image-placeholder-text">Tap to upload card image</p>
          </div>
          <label class="image-replace btn-secondary btn-file">
            {{ (imagePreview() || currentImageUrl()) ? 'Replace' : '+ Upload' }}
            <input type="file" accept="image/*" (change)="onImageSelected($event)" hidden />
          </label>
          <button type="button" class="image-remove" *ngIf="imagePreview()" (click)="removeImage()">✕</button>
        </div>
      </div>

      <!-- Title -->
      <div class="form-field">
        <label class="form-label" for="cardTitle">Card Title</label>
        <input
          id="cardTitle"
          class="form-input"
          formControlName="title"
          placeholder="e.g. The Journey Begins"
          maxlength="200"
        />
      </div>

      <!-- Description -->
      <div class="form-field">
        <label class="form-label" for="cardDesc">Meaning / Description</label>
        <textarea
          id="cardDesc"
          class="form-textarea"
          formControlName="description"
          placeholder="What does this card mean?"
          maxlength="2000"
          rows="4"
        ></textarea>
      </div>

      <div *ngIf="error()" class="state-error">{{ error() }}</div>

      <button type="submit" class="btn-primary btn-full" [disabled]="form.invalid || submitting()">
        {{ submitting() ? 'Saving…' : '💾 Save Changes' }}
      </button>

      <button type="button" class="btn-danger btn-full" [disabled]="deleting()" (click)="deleteCard()">
        {{ deleting() ? 'Deleting…' : '🗑 Delete Card' }}
      </button>
    </form>
  </main>
</div>
```

- [ ] **Step 5: Create `card-edit.component.css`**

```css
.form-page { display: flex; flex-direction: column; min-height: 100vh; }

.form-content {
  padding: 24px 20px 48px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.form-content form { display: flex; flex-direction: column; gap: 20px; }

.image-upload-area {
  aspect-ratio: 2/3;
  max-width: 180px;
  margin: 6px auto 0;
  background: white;
  border: 2px dashed var(--color-border-light);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.image-upload-area.has-image { border-style: solid; border-color: var(--color-border); }

.image-preview { width: 100%; height: 100%; object-fit: cover; }

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}

.image-placeholder-icon { font-size: 28px; }
.image-placeholder-text { font-size: 11px; color: var(--color-muted); font-weight: 600; line-height: 1.4; }

.image-replace {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.image-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,0.45);
  border: none;
  border-radius: 100px;
  width: 24px;
  height: 24px;
  color: white;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-file { display: inline-block; cursor: pointer; }
.btn-ghost--action { color: var(--color-coral); font-weight: 800; }
.btn-ghost--action:disabled { opacity: 0.4; }
.btn-full { width: 100%; }

.btn-danger {
  background: none;
  border: 2px solid #e0b4b4;
  color: #c0392b;
  border-radius: var(--radius-pill);
  padding: 12px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
.btn-danger:disabled { opacity: 0.4; }
```

- [ ] **Step 6: Add the route in `app-routing-module.ts`**

Add immediately before the `decks/:id/cards/:cardId` route so `.../edit` matches first:

```typescript
  {
    path: 'decks/:id/cards/:cardId/edit',
    loadComponent: () => import('./components/card-edit/card-edit.component').then((c) => c.CardEditComponent),
    canActivate: [authGuard]
  },
```

- [ ] **Step 7: Run spec to verify it passes**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — `CardEditComponent` prefill + validation specs green.

- [ ] **Step 8: Commit**

```bash
git add fortunecards.client/src/app/components/card-edit/ fortunecards.client/src/app/app-routing-module.ts
git commit -m "feat: add owner-only card edit page with delete"
```

---

## Task 10: Deck-detail wiring — edit button, clickable cards, remove per-card delete

**Files:**
- Modify: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.ts`
- Modify: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.html`

**Interfaces:**
- Consumes: routes `decks/:id/edit` (Task 7) and `decks/:id/cards/:cardId` (Task 8).
- Produces: `DeckDetailComponent` gains `editDeck()` and `openCard(cardId)`; loses `deleteCard()` and its `CardService` dependency.

- [ ] **Step 1: Update `deck-detail.component.ts`**

Remove the `CardService` import and constructor parameter, remove `deleteCard`, and add `editDeck` + `openCard`. Replace the imports/constructor and the `deleteCard` method:

Change the imports block to drop `CardService`:

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle, getDeckShadowStyle, getCardAccentColor } from '../../utils/deck-colors';
```

Change the constructor to drop `CardService`:

```typescript
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}
```

Delete the entire `deleteCard(cardId: number)` method and add these two methods (e.g. after `addCard`):

```typescript
  editDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'edit']);
  }

  openCard(cardId: number): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'cards', cardId]);
  }
```

- [ ] **Step 2: Update `deck-detail.component.html`**

Add an owner-only "Edit deck" button in `.hero-actions` (before the Add Card button):

```html
    <div class="hero-actions">
      <button *ngIf="d.isOwner" class="hero-btn" [style.background]="getDeckGradient()" (click)="editDeck()">✏️ Edit deck</button>
      <button *ngIf="d.isOwner" class="hero-btn" [style.background]="getDeckGradient()" (click)="addCard()">+ Add Card</button>
      <button class="hero-btn" [style.background]="getDeckGradient()" (click)="drawCard()">🎴 Draw a Card</button>
    </div>
```

Make each card tile open the card detail page and remove the per-card delete button. Replace the card tile block:

```html
      <div class="card-tile"
           *ngFor="let card of (d.cards ?? []); let i = index"
           [style.border-top-color]="getCardAccent(i)"
           (click)="openCard(card.id)">
        <div class="card-image" [style.background]="getCardAccent(i) + '18'">
          <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" />
          <span *ngIf="!card.imageUrl" class="card-placeholder">🃏</span>
        </div>
        <div class="card-body">
          <p class="card-title">{{ card.title }}</p>
        </div>
      </div>
```

(The `.card-delete` CSS rule in `deck-detail.component.css` becomes unused; leave it or remove it — no behavioral effect. For tidiness you may delete the `.card-delete` and `.card-tile:hover .card-delete` rules.)

- [ ] **Step 3: Run the suite**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS — existing `DeckDetailComponent` specs (hero emoji/name, gradient) still green; component compiles without `CardService`.

- [ ] **Step 4: Commit**

```bash
git add fortunecards.client/src/app/components/deck-detail/
git commit -m "feat: wire deck detail to edit page and single-card review; remove inline card delete"
```

---

## Task 11: Full-stack verification

**Files:** none (verification only).

- [ ] **Step 1: Build the backend**

Run: `dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: All specs pass (previous 21 + the new service and component specs).

- [ ] **Step 3: Production build of the frontend**

Run: `cd fortunecards.client && ng build`
Expected: Build completes with no errors (confirms lazy-route imports resolve and no unused-symbol/type errors).

- [ ] **Step 4: Manual smoke test (run backend + frontend, log in as a deck owner)**

Verify each:
- On `/decks`, owner tiles show only the 🌐/🔒 badge — no toggle/delete buttons.
- Create a deck: the public/private choice is present and respected (new deck appears with the chosen badge).
- Open an owned deck (`/decks/:id`): an "✏️ Edit deck" button shows; clicking a card opens `/decks/:id/cards/:cardId`.
- Card detail shows title + description + image; owner sees "Edit Card".
- Edit deck: change name/description/color/emoji, toggle visibility, and replace the card-back image → changes persist after redirect; delete deck returns to `/decks` and the deck is gone.
- Edit card: change title/description and replace the image → changes persist; delete card returns to the deck without that card.
- As a non-owner viewing a public deck: no edit buttons; navigating directly to `/decks/:id/edit` or `/decks/:id/cards/:cardId/edit` redirects to the detail page.

- [ ] **Step 5: Commit (only if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix: address issues found during deck/card update verification"
```
