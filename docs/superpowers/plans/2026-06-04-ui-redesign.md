# FortuneCards UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FortuneCards Angular + ASP.NET Core app with a playful/whimsical design system — Nunito font, vivid gradient palette, tarot-proportioned cards, and a 3D flip reveal animation on card draw.

**Architecture:** CSS custom properties token file shared across all components; small Deck model extension (emoji, colorIndex, cardBackImageUrl) with EF migration; each Angular component gets a full template + CSS rewrite while business logic is preserved. Create forms become separate routes (`/decks/new`, `/decks/:id/cards/new`).

**Tech Stack:** Angular 21 (NgModule, Jasmine/Karma tests), TypeScript strict, CSS custom properties, ASP.NET Core 10, EF Core + SQL Server

---

## File Map

### New
- `fortunecards.client/src/styles/design-system.css` — all CSS tokens
- `fortunecards.client/src/app/utils/deck-colors.ts` — gradient/accent helpers
- `fortunecards.client/src/app/utils/deck-colors.spec.ts`
- `fortunecards.client/src/app/components/deck-list/deck-list.component.css`
- `fortunecards.client/src/app/components/deck-list/deck-list.component.spec.ts`
- `fortunecards.client/src/app/components/deck-detail/deck-detail.component.css`
- `fortunecards.client/src/app/components/deck-detail/deck-detail.component.spec.ts`
- `fortunecards.client/src/app/components/drawn-card/drawn-card.component.css`
- `fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts`
- `fortunecards.client/src/app/components/create-deck/create-deck.component.css`
- `fortunecards.client/src/app/components/create-deck/create-deck.component.spec.ts`
- `fortunecards.client/src/app/components/create-card/create-card.component.css`
- `fortunecards.client/src/app/components/create-card/create-card.component.spec.ts`

### Modified
- `fortunecards.client/src/index.html`
- `fortunecards.client/src/styles.css`
- `fortunecards.client/src/app/app-routing-module.ts`
- `fortunecards.client/src/app/models/deck.ts`
- `fortunecards.client/src/app/services/deck.service.ts`
- `fortunecards.client/src/app/components/deck-list/deck-list.component.ts`
- `fortunecards.client/src/app/components/deck-list/deck-list.component.html`
- `fortunecards.client/src/app/components/deck-detail/deck-detail.component.ts`
- `fortunecards.client/src/app/components/deck-detail/deck-detail.component.html`
- `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts`
- `fortunecards.client/src/app/components/drawn-card/drawn-card.component.html`
- `fortunecards.client/src/app/components/create-deck/create-deck.component.ts`
- `fortunecards.client/src/app/components/create-deck/create-deck.component.html`
- `fortunecards.client/src/app/components/create-card/create-card.component.ts`
- `fortunecards.client/src/app/components/create-card/create-card.component.html`
- `FortuneCards.Server/Models/Deck.cs`
- `FortuneCards.Server/Data/FortuneCardsDbContext.cs`
- `FortuneCards.Server/Services/IDeckService.cs`
- `FortuneCards.Server/Services/DeckService.cs`
- `FortuneCards.Server/Controllers/DecksController.cs`

---

### Task 1: Design system tokens + Nunito font

**Files:**
- Create: `fortunecards.client/src/styles/design-system.css`
- Modify: `fortunecards.client/src/index.html`
- Modify: `fortunecards.client/src/styles.css`

- [ ] **Step 1: Create the design system token file**

Create `fortunecards.client/src/styles/design-system.css`:

```css
:root {
  /* Brand colors */
  --color-coral: #FF6B6B;
  --color-sunny: #FECA57;
  --color-sky: #48DBFB;
  --color-blush: #FF9FF3;
  --color-lavender: #A29BFE;
  --color-cream: #FFF9F0;
  --color-charcoal: #2C2C2C;
  --color-border: #f0e8dc;
  --color-border-light: #e0d5cc;
  --color-muted: #999;

  /* Deck gradients (indices 0–4) */
  --gradient-0: linear-gradient(135deg, #FF6B6B, #FECA57);
  --gradient-1: linear-gradient(135deg, #48DBFB, #FF9FF3);
  --gradient-2: linear-gradient(135deg, #A29BFE, #48DBFB);
  --gradient-3: linear-gradient(135deg, #FF9FF3, #FECA57);
  --gradient-4: linear-gradient(135deg, #FECA57, #FF6B6B);

  /* Card accent colors (cycle per card position) */
  --accent-0: #FF6B6B;
  --accent-1: #FECA57;
  --accent-2: #48DBFB;
  --accent-3: #FF9FF3;
  --accent-4: #A29BFE;

  /* Typography */
  --font: 'Nunito', sans-serif;

  /* Shape */
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 20px;
  --radius-pill: 100px;

  /* Shadows */
  --shadow-card: 0 3px 12px rgba(0,0,0,0.09);
  --shadow-tile: 0 6px 20px;
  --shadow-btn: 0 4px 14px;
}
```

- [ ] **Step 2: Add Nunito font and import tokens in index.html and styles.css**

Replace `fortunecards.client/src/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FortuneCards</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

Replace `fortunecards.client/src/styles.css` with:

```css
@import './styles/design-system.css';

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  background: var(--color-cream);
  color: var(--color-charcoal);
  min-height: 100vh;
}

/* ── Shared nav bar ─────────────────────────────────── */
.nav-bar {
  background: white;
  border-bottom: 2px solid var(--color-border);
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
}
.nav-title { font-size: 16px; font-weight: 800; color: var(--color-charcoal); }
.nav-back  { font-size: 13px; font-weight: 700; color: var(--color-muted); cursor: pointer; background: none; border: none; font-family: var(--font); }
.nav-actions { display: flex; gap: 8px; align-items: center; }

/* ── Buttons ────────────────────────────────────────── */
.btn-primary {
  background: linear-gradient(135deg, var(--color-coral), var(--color-sunny));
  color: white;
  border: none;
  border-radius: var(--radius-pill);
  padding: 10px 22px;
  font-family: var(--font);
  font-size: 14px;
  font-weight: 800;
  box-shadow: var(--shadow-btn) #FF6B6B44;
  cursor: pointer;
  letter-spacing: 0.3px;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: white;
  color: var(--color-coral);
  border: 2px solid var(--color-coral);
  border-radius: var(--radius-pill);
  padding: 9px 20px;
  font-family: var(--font);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn-ghost {
  background: none;
  border: none;
  color: var(--color-muted);
  font-family: var(--font);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;
}

/* ── Form elements ──────────────────────────────────── */
.form-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.form-label span { font-weight: 400; text-transform: none; color: #bbb; }

.form-input, .form-textarea {
  width: 100%;
  background: white;
  border: 2px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-family: var(--font);
  font-size: 14px;
  color: var(--color-charcoal);
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus, .form-textarea:focus { border-color: var(--color-coral); }
.form-textarea { resize: vertical; min-height: 80px; line-height: 1.5; }

/* ── Page shell ─────────────────────────────────────── */
.page { display: flex; flex-direction: column; min-height: 100vh; }
.page-content { padding: 20px 20px 40px; max-width: 900px; margin: 0 auto; width: 100%; }

/* ── Loading / error states ─────────────────────────── */
.state-loading, .state-error {
  text-align: center;
  padding: 48px 20px;
  font-size: 15px;
  color: var(--color-muted);
  font-weight: 600;
}
.state-error { color: var(--color-coral); }
```

- [ ] **Step 3: Verify styles load**

Run the Angular dev server and backend together (press F5 in Visual Studio, or run each manually). Open `https://127.0.0.1:51313` in a browser and open DevTools → Elements. Confirm `--color-coral` appears in `:root` computed styles and the body font is Nunito.

- [ ] **Step 4: Commit**

```bash
git add fortunecards.client/src/styles/design-system.css fortunecards.client/src/index.html fortunecards.client/src/styles.css
git commit -m "feat: add design system tokens and Nunito font"
```

---

### Task 2: Deck color utility

**Files:**
- Create: `fortunecards.client/src/app/utils/deck-colors.ts`
- Create: `fortunecards.client/src/app/utils/deck-colors.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/utils/deck-colors.spec.ts`:

```typescript
import { getDeckGradientStyle, getDeckShadowStyle, getDeckAccentColor, getCardAccentColor } from './deck-colors';

describe('deck-colors', () => {
  describe('getDeckGradientStyle', () => {
    it('returns coral-sunny gradient for index 0', () => {
      expect(getDeckGradientStyle(0)).toBe('linear-gradient(135deg, #FF6B6B, #FECA57)');
    });
    it('wraps around with modulo for index 5', () => {
      expect(getDeckGradientStyle(5)).toBe(getDeckGradientStyle(0));
    });
  });

  describe('getDeckAccentColor', () => {
    it('returns coral for index 0', () => {
      expect(getDeckAccentColor(0)).toBe('#FF6B6B');
    });
    it('returns lavender for index 4', () => {
      expect(getDeckAccentColor(4)).toBe('#FECA57');
    });
  });

  describe('getCardAccentColor', () => {
    it('cycles through 5 accent colors', () => {
      const a = getCardAccentColor(0);
      const b = getCardAccentColor(5);
      expect(a).toBe(b);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fortunecards.client
ng test --include="**/deck-colors.spec.ts" --watch=false
```

Expected: FAIL — `getDeckGradientStyle` not found.

- [ ] **Step 3: Create the utility**

Create `fortunecards.client/src/app/utils/deck-colors.ts`:

```typescript
const DECK_GRADIENTS = [
  { from: '#FF6B6B', to: '#FECA57', shadow: '#FF6B6B33', accent: '#FF6B6B' },
  { from: '#48DBFB', to: '#FF9FF3', shadow: '#48DBFB33', accent: '#48DBFB' },
  { from: '#A29BFE', to: '#48DBFB', shadow: '#A29BFE33', accent: '#A29BFE' },
  { from: '#FF9FF3', to: '#FECA57', shadow: '#FF9FF333', accent: '#FF9FF3' },
  { from: '#FECA57', to: '#FF6B6B', shadow: '#FECA5733', accent: '#FECA57' },
] as const;

const CARD_ACCENTS = ['#FF6B6B', '#FECA57', '#48DBFB', '#FF9FF3', '#A29BFE'];

export function getDeckGradientStyle(colorIndex: number): string {
  const g = DECK_GRADIENTS[colorIndex % 5];
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}

export function getDeckShadowStyle(colorIndex: number): string {
  return `0 6px 20px ${DECK_GRADIENTS[colorIndex % 5].shadow}`;
}

export function getDeckAccentColor(colorIndex: number): string {
  return DECK_GRADIENTS[colorIndex % 5].accent;
}

export function getCardAccentColor(index: number): string {
  return CARD_ACCENTS[index % CARD_ACCENTS.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ng test --include="**/deck-colors.spec.ts" --watch=false
```

Expected: 4 specs, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/utils/
git commit -m "feat: add deck color gradient utilities"
```

---

### Task 3: Backend — Deck model + EF migration

**Files:**
- Modify: `FortuneCards.Server/Models/Deck.cs`
- Modify: `FortuneCards.Server/Data/FortuneCardsDbContext.cs`

- [ ] **Step 1: Update the Deck model**

Replace `FortuneCards.Server/Models/Deck.cs`:

```csharp
namespace FortuneCards.Server.Models
{
    public class Deck
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string Emoji { get; set; } = "🎴";
        public int ColorIndex { get; set; } = 0;
        public string? CardBackImageUrl { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<Card> Cards { get; set; } = new List<Card>();
    }
}
```

- [ ] **Step 2: Add constraints in DbContext**

In `FortuneCards.Server/Data/FortuneCardsDbContext.cs`, update the `modelBuilder.Entity<Deck>` block:

```csharp
modelBuilder.Entity<Deck>(e =>
{
    e.Property(d => d.Name).HasMaxLength(200).IsRequired();
    e.Property(d => d.Description).HasMaxLength(1000);
    e.Property(d => d.Emoji).HasMaxLength(10).HasDefaultValue("🎴");
    e.Property(d => d.ColorIndex).HasDefaultValue(0);
    e.Property(d => d.CardBackImageUrl).HasMaxLength(500);
});
```

- [ ] **Step 3: Add EF migration**

From the repo root:

```powershell
dotnet ef migrations add AddDeckVisualFields --project FortuneCards.Server
```

Expected output: `Build succeeded` and a new migration file in `FortuneCards.Server/Migrations/`.

- [ ] **Step 4: Verify build**

```powershell
dotnet build FortuneCards.Server
```

Expected: `Build succeeded, 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Models/Deck.cs FortuneCards.Server/Data/FortuneCardsDbContext.cs FortuneCards.Server/Migrations/
git commit -m "feat: add Emoji, ColorIndex, CardBackImageUrl to Deck model"
```

---

### Task 4: Backend — DTOs + DeckService

**Files:**
- Modify: `FortuneCards.Server/Services/IDeckService.cs`
- Modify: `FortuneCards.Server/Services/DeckService.cs`

- [ ] **Step 1: Update IDeckService.cs**

Replace the full file content of `FortuneCards.Server/Services/IDeckService.cs`:

```csharp
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public record DeckSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, string? CardBackImageUrl);

    public record DeckDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<CardDto> Cards,
        string Emoji, int ColorIndex, string? CardBackImageUrl);

    public record CardDto(int Id, string Title, string Description, string ImageUrl, DateTime CreatedAt);

    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync();
        Task<DeckDetail?> GetByIdAsync(int id);
        Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage);
        Task<bool> DeleteAsync(int id);
        Task<CardDto> AddCardAsync(int deckId, string title, string description, IFormFile image);
    }
}
```

- [ ] **Step 2: Update DeckService.cs**

Replace the full file content of `FortuneCards.Server/Services/DeckService.cs`:

```csharp
using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class DeckService : IDeckService
    {
        private const string AllDecksKey = "decks:all";
        private static string DeckKey(int id) => $"decks:{id}";
        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IWebHostEnvironment _env;

        public DeckService(FortuneCardsDbContext db, IMemoryCache cache, IWebHostEnvironment env)
        {
            _db = db;
            _cache = cache;
            _env = env;
        }

        public async Task<IEnumerable<DeckSummary>> GetAllAsync()
        {
            if (_cache.TryGetValue(AllDecksKey, out IEnumerable<DeckSummary>? cached) && cached is not null)
                return cached;

            var decks = await _db.Decks
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl))
                .ToListAsync();

            _cache.Set(AllDecksKey, decks, CacheDuration);
            return decks;
        }

        public async Task<DeckDetail?> GetByIdAsync(int id)
        {
            if (_cache.TryGetValue(DeckKey(id), out DeckDetail? cached) && cached is not null)
                return cached;

            var deck = await _db.Decks
                .Where(d => d.Id == id)
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description, c.ImageUrl, c.CreatedAt)),
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl))
                .FirstOrDefaultAsync();

            if (deck is not null)
                _cache.Set(DeckKey(id), deck, CacheDuration);

            return deck;
        }

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage)
        {
            string? cardBackImageUrl = null;
            if (cardBackImage is { Length: > 0 })
            {
                var imagesDir = Path.Combine(_env.WebRootPath, "images");
                Directory.CreateDirectory(imagesDir);
                var ext = Path.GetExtension(cardBackImage.FileName);
                var fileName = $"{Guid.NewGuid()}{ext}";
                using var stream = File.Create(Path.Combine(imagesDir, fileName));
                await cardBackImage.CopyToAsync(stream);
                cardBackImageUrl = $"/images/{fileName}";
            }

            var deck = new Deck
            {
                Name = name,
                Description = description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageUrl = cardBackImageUrl
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null) return false;
            _db.Decks.Remove(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(id));
            return true;
        }

        public async Task<CardDto> AddCardAsync(int deckId, string title, string description, IFormFile image)
        {
            var imagesDir = Path.Combine(_env.WebRootPath, "images");
            Directory.CreateDirectory(imagesDir);
            var ext = Path.GetExtension(image.FileName);
            var fileName = $"{Guid.NewGuid()}{ext}";
            using (var stream = File.Create(Path.Combine(imagesDir, fileName)))
                await image.CopyToAsync(stream);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageUrl = $"/images/{fileName}",
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }
    }
}
```

- [ ] **Step 3: Verify build**

```powershell
dotnet build FortuneCards.Server
```

Expected: `Build succeeded, 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add FortuneCards.Server/Services/
git commit -m "feat: extend DeckService DTOs and CreateAsync with visual fields"
```

---

### Task 5: Backend — DecksController

**Files:**
- Modify: `FortuneCards.Server/Controllers/DecksController.cs`

- [ ] **Step 1: Update DecksController**

Replace the full file content of `FortuneCards.Server/Controllers/DecksController.cs`:

```csharp
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/decks")]
    public class DecksController : ControllerBase
    {
        private readonly IDeckService _decks;

        public DecksController(IDeckService decks) => _decks = decks;

        [HttpGet]
        public async Task<IActionResult> GetDecks() =>
            Ok(await _decks.GetAllAsync());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetDeck(int id)
        {
            var deck = await _decks.GetByIdAsync(id);
            return deck is null ? NotFound() : Ok(deck);
        }

        [HttpPost]
        public async Task<IActionResult> CreateDeck([FromForm] CreateDeckRequest request)
        {
            var deck = await _decks.CreateAsync(
                request.Name,
                request.Description,
                request.Emoji ?? "🎴",
                request.ColorIndex ?? 0,
                request.CardBackImage);
            return CreatedAtAction(nameof(GetDeck), new { id = deck.Id }, deck);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDeck(int id) =>
            await _decks.DeleteAsync(id) ? NoContent() : NotFound();

        [HttpPost("{id}/cards")]
        public async Task<IActionResult> AddCard(int id, [FromForm] AddCardRequest request)
        {
            var deck = await _decks.GetByIdAsync(id);
            if (deck is null) return NotFound();
            if (request.Image is null || request.Image.Length == 0)
                return BadRequest("Image file is required.");
            var card = await _decks.AddCardAsync(id, request.Title, request.Description, request.Image);
            return CreatedAtAction(nameof(GetDeck), new { id }, card);
        }
    }

    public class CreateDeckRequest
    {
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public IFormFile? CardBackImage { get; set; }
    }

    public class AddCardRequest
    {
        public required string Title { get; set; }
        public required string Description { get; set; }
        public IFormFile? Image { get; set; }
    }
}
```

- [ ] **Step 2: Verify build and run**

```powershell
dotnet build FortuneCards.Server
```

Expected: `Build succeeded, 0 errors`.

Start the backend and test via Scalar UI at `https://localhost:7242/scalar/v1`. POST to `/api/decks` with `Content-Type: multipart/form-data`, fields `Name=Test&Emoji=🌈&ColorIndex=0`. Confirm 201 response includes `emoji`, `colorIndex`, `cardBackImageUrl`.

- [ ] **Step 3: Commit**

```bash
git add FortuneCards.Server/Controllers/DecksController.cs
git commit -m "feat: update DecksController to accept emoji, colorIndex, cardBackImage"
```

---

### Task 6: Frontend models, DeckService, and routing

**Files:**
- Modify: `fortunecards.client/src/app/models/deck.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`
- Modify: `fortunecards.client/src/app/app-routing-module.ts`

- [ ] **Step 1: Update the Deck interface**

Replace `fortunecards.client/src/app/models/deck.ts`:

```typescript
import { Card } from './card';

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  emoji: string;
  colorIndex: number;
  cardBackImageUrl: string | null;
  cardCount?: number;
  cards?: Card[];
}

export interface CreateDeckPayload {
  name: string;
  description: string | null;
  emoji: string;
  colorIndex: number;
  cardBackImage?: File;
}
```

- [ ] **Step 2: Update DeckService.createDeck to use FormData**

Replace `fortunecards.client/src/app/services/deck.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from '../models/card';
import { CreateDeckPayload, Deck } from '../models/deck';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private readonly base = '/api/decks';

  constructor(private http: HttpClient) {}

  getDecks(): Observable<Deck[]> {
    return this.http.get<Deck[]>(this.base);
  }

  getDeck(id: number): Observable<Deck> {
    return this.http.get<Deck>(`${this.base}/${id}`);
  }

  createDeck(payload: CreateDeckPayload): Observable<Deck> {
    const form = new FormData();
    form.append('name', payload.name);
    if (payload.description) form.append('description', payload.description);
    form.append('emoji', payload.emoji);
    form.append('colorIndex', payload.colorIndex.toString());
    if (payload.cardBackImage) {
      form.append('cardBackImage', payload.cardBackImage, payload.cardBackImage.name);
    }
    return this.http.post<Deck>(this.base, form);
  }

  deleteDeck(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addCard(deckId: number, title: string, description: string, image: File): Observable<Card> {
    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    form.append('image', image, image.name);
    return this.http.post<Card>(`${this.base}/${deckId}/cards`, form);
  }
}
```

- [ ] **Step 3: Update routing — add create form routes**

Replace `fortunecards.client/src/app/app-routing-module.ts`:

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { DrawnCardComponent } from './components/drawn-card/drawn-card.component';
import { CreateDeckComponent } from './components/create-deck/create-deck.component';
import { CreateCardComponent } from './components/create-card/create-card.component';

const routes: Routes = [
  { path: '', redirectTo: '/decks', pathMatch: 'full' },
  { path: 'decks/new', component: CreateDeckComponent },
  { path: 'decks/:id/cards/new', component: CreateCardComponent },
  { path: 'decks/:id/draw', component: DrawnCardComponent },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', component: DeckListComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
```

Note: `decks/new` must come before `decks/:id` so Angular's router matches it literally before treating it as an id.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd fortunecards.client
ng build --configuration=development
```

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/models/deck.ts fortunecards.client/src/app/services/deck.service.ts fortunecards.client/src/app/app-routing-module.ts
git commit -m "feat: update frontend Deck model, DeckService FormData, and routing"
```

---

### Task 7: DeckListComponent redesign

**Files:**
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.html`
- Create: `fortunecards.client/src/app/components/deck-list/deck-list.component.css`
- Create: `fortunecards.client/src/app/components/deck-list/deck-list.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/components/deck-list/deck-list.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DeckListComponent } from './deck-list.component';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cardCount: 3
};

describe('DeckListComponent', () => {
  let component: DeckListComponent;
  let fixture: ComponentFixture<DeckListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DeckListComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckListComponent);
    component = fixture.componentInstance;
  });

  it('should render a deck tile for each deck', () => {
    component.decks.set([mockDeck]);
    fixture.detectChanges();
    const tiles = fixture.nativeElement.querySelectorAll('.deck-tile');
    expect(tiles.length).toBe(2); // 1 deck + 1 "add" tile
  });

  it('should apply gradient style to deck tile', () => {
    component.decks.set([mockDeck]);
    fixture.detectChanges();
    const tile = fixture.nativeElement.querySelector('.deck-tile:not(.deck-tile--add)');
    expect(tile.style.background).toContain('#FF6B6B');
  });

  it('should display deck emoji and name', () => {
    component.decks.set([mockDeck]);
    fixture.detectChanges();
    const tile = fixture.nativeElement.querySelector('.deck-tile:not(.deck-tile--add)');
    expect(tile.textContent).toContain('🌈');
    expect(tile.textContent).toContain('Adventure');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fortunecards.client
ng test --include="**/deck-list.component.spec.ts" --watch=false
```

Expected: FAIL — `component.decks` not a signal / `.deck-tile` not found.

- [ ] **Step 3: Implement the component TS**

Replace `fortunecards.client/src/app/components/deck-list/deck-list.component.ts`:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css']
})
export class DeckListComponent implements OnInit {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(private deckService: DeckService, private router: Router) {}

  ngOnInit(): void {
    this.loadDecks();
  }

  loadDecks(): void {
    this.loading.set(true);
    this.deckService.getDecks().subscribe({
      next: (decks) => { this.decks.set(decks); this.loading.set(false); },
      error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); }
    });
  }

  getDeckGradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  getDeckShadow(colorIndex: number): string {
    return getDeckShadowStyle(colorIndex);
  }

  deleteDeck(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this deck and all its cards?')) return;
    this.deckService.deleteDeck(id).subscribe({
      next: () => this.decks.update(decks => decks.filter(d => d.id !== id)),
      error: () => this.error.set('Failed to delete deck.')
    });
  }

  goToNew(): void {
    this.router.navigate(['/decks/new']);
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `fortunecards.client/src/app/components/deck-list/deck-list.component.html`:

```html
<div class="page">
  <nav class="nav-bar">
    <span class="nav-title">🎴 FortuneCards</span>
    <button class="btn-primary" (click)="goToNew()">+ New Deck</button>
  </nav>

  <main class="page-content">
    <div class="list-header">
      <h1 class="list-title">My Decks ✨</h1>
      <p class="list-subtitle" *ngIf="!loading()">
        {{ decks().length }} deck{{ decks().length === 1 ? '' : 's' }}
      </p>
    </div>

    <div *ngIf="loading()" class="state-loading">Loading decks…</div>
    <div *ngIf="error()" class="state-error">{{ error() }}</div>

    <div class="deck-grid" *ngIf="!loading() && !error()">
      <div
        class="deck-tile"
        *ngFor="let deck of decks()"
        [style.background]="getDeckGradient(deck.colorIndex)"
        [style.box-shadow]="getDeckShadow(deck.colorIndex)"
        [routerLink]="['/decks', deck.id]"
      >
        <span class="deck-emoji">{{ deck.emoji }}</span>
        <span class="deck-name">{{ deck.name }}</span>
        <span class="deck-count">{{ deck.cardCount }} card{{ deck.cardCount === 1 ? '' : 's' }}</span>
        <button class="deck-delete" (click)="deleteDeck(deck.id, $event)" title="Delete deck">✕</button>
      </div>

      <div class="deck-tile deck-tile--add" (click)="goToNew()">
        <span class="deck-add-icon">+</span>
        <span class="deck-add-label">New Deck</span>
      </div>
    </div>
  </main>
</div>
```

- [ ] **Step 5: Create the component CSS**

Create `fortunecards.client/src/app/components/deck-list/deck-list.component.css`:

```css
.list-header { margin-bottom: 20px; }
.list-title  { font-size: 24px; font-weight: 800; }
.list-subtitle { font-size: 13px; color: var(--color-muted); font-weight: 600; margin-top: 4px; }

.deck-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (min-width: 768px) {
  .deck-grid { grid-template-columns: repeat(4, 1fr); }
}

.deck-tile {
  aspect-ratio: 1;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s;
  text-decoration: none;
}

.deck-tile:hover { transform: translateY(-2px); }

.deck-emoji  { font-size: 32px; }
.deck-name   { font-size: 13px; font-weight: 800; color: white; text-align: center; padding: 0 8px; }
.deck-count  { font-size: 11px; color: rgba(255,255,255,0.75); font-weight: 600; }

.deck-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,0.2);
  border: none;
  border-radius: 100px;
  width: 22px;
  height: 22px;
  font-size: 10px;
  color: white;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.deck-tile:hover .deck-delete { display: flex; }

.deck-tile--add {
  background: var(--color-cream) !important;
  border: 2px dashed var(--color-border-light);
  box-shadow: none !important;
}

.deck-add-icon  { font-size: 28px; color: var(--color-border-light); }
.deck-add-label { font-size: 12px; font-weight: 700; color: var(--color-muted); }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
ng test --include="**/deck-list.component.spec.ts" --watch=false
```

Expected: 3 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/deck-list/
git commit -m "feat: redesign DeckListComponent with gradient tile grid"
```

---

### Task 8: DeckDetailComponent redesign

**Files:**
- Modify: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.ts`
- Modify: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.html`
- Create: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.css`
- Create: `fortunecards.client/src/app/components/deck-detail/deck-detail.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/components/deck-detail/deck-detail.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DeckDetailComponent } from './deck-detail.component';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cards: []
};

describe('DeckDetailComponent', () => {
  let component: DeckDetailComponent;
  let fixture: ComponentFixture<DeckDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DeckDetailComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckDetailComponent);
    component = fixture.componentInstance;
  });

  it('should render the deck hero banner with emoji and name', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    expect(hero.textContent).toContain('🌈');
    expect(hero.textContent).toContain('Adventure');
  });

  it('should apply gradient to hero banner', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    expect(hero.style.background).toContain('#FF6B6B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include="**/deck-detail.component.spec.ts" --watch=false
```

Expected: FAIL — `.deck-hero` not found.

- [ ] **Step 3: Implement the component TS**

Replace `fortunecards.client/src/app/components/deck-detail/deck-detail.component.ts`:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { CardService } from '../../services/card.service';
import { getDeckGradientStyle, getDeckShadowStyle, getCardAccentColor } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-detail',
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.css']
})
export class DeckDetailComponent implements OnInit {
  deck = signal<Deck | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private cardService: CardService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.deckService.getDeck(Number(params['id'])).subscribe({
        next: (deck) => { this.deck.set(deck); this.loading.set(false); },
        error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
      });
    });
  }

  getDeckGradient(): string {
    return getDeckGradientStyle(this.deck()?.colorIndex ?? 0);
  }

  getDeckShadow(): string {
    return getDeckShadowStyle(this.deck()?.colorIndex ?? 0);
  }

  getCardAccent(index: number): string {
    return getCardAccentColor(index);
  }

  drawCard(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'draw']);
  }

  addCard(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'cards', 'new']);
  }

  goBack(): void {
    this.router.navigate(['/decks']);
  }

  deleteCard(cardId: number): void {
    if (!confirm('Remove this card from the deck?')) return;
    this.cardService.deleteCard(cardId).subscribe({
      next: () => {
        this.deck.update(d => d ? {
          ...d,
          cards: (d.cards ?? []).filter(c => c.id !== cardId)
        } : null);
      },
      error: () => this.error.set('Failed to delete card.')
    });
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `fortunecards.client/src/app/components/deck-detail/deck-detail.component.html`:

```html
<div class="page" *ngIf="deck() as d; else loadingOrError">
  <nav class="nav-bar">
    <div class="nav-actions">
      <button class="nav-back" (click)="goBack()">← My Decks</button>
      <span class="nav-sep">/</span>
      <span class="nav-crumb">{{ d.name }}</span>
    </div>
    <div class="nav-actions">
      <button class="btn-secondary btn-sm" (click)="addCard()">+ Add Card</button>
      <button class="btn-primary btn-sm" (click)="drawCard()">🎴 Draw a Card</button>
    </div>
  </nav>

  <div class="deck-hero" [style.background]="getDeckGradient()">
    <span class="hero-emoji">{{ d.emoji }}</span>
    <div class="hero-info">
      <h1 class="hero-name">{{ d.name }}</h1>
      <p class="hero-meta">
        <span *ngIf="d.description">{{ d.description }} · </span>
        {{ (d.cards ?? []).length }} card{{ (d.cards ?? []).length === 1 ? '' : 's' }}
      </p>
    </div>
  </div>

  <main class="page-content">
    <h2 class="section-title">Cards in this deck</h2>

    <div class="card-grid">
      <div
        class="card-tile"
        *ngFor="let card of (d.cards ?? []); let i = index"
        [style.border-top-color]="getCardAccent(i)"
      >
        <div class="card-image" [style.background]="getCardAccent(i) + '18'">
          <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" />
          <span *ngIf="!card.imageUrl" class="card-placeholder">🃏</span>
        </div>
        <div class="card-body">
          <p class="card-title">{{ card.title }}</p>
          <button class="card-delete" (click)="deleteCard(card.id)" title="Remove card">✕</button>
        </div>
      </div>

      <div class="card-tile card-tile--add" (click)="addCard()">
        <div class="card-image card-image--add">+</div>
      </div>
    </div>
  </main>
</div>

<ng-template #loadingOrError>
  <div *ngIf="loading()" class="state-loading">Loading deck…</div>
  <div *ngIf="error()" class="state-error">{{ error() }}</div>
</ng-template>
```

- [ ] **Step 5: Create the component CSS**

Create `fortunecards.client/src/app/components/deck-detail/deck-detail.component.css`:

```css
.nav-sep   { color: var(--color-border); margin: 0 6px; }
.nav-crumb { font-size: 14px; font-weight: 800; color: var(--color-charcoal); }
.btn-sm    { padding: 8px 16px; font-size: 13px; }

.deck-hero {
  padding: 20px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.hero-emoji { font-size: 48px; }
.hero-name  { font-size: 22px; font-weight: 800; color: white; }
.hero-meta  { font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 4px; }

.section-title { font-size: 15px; font-weight: 800; margin-bottom: 14px; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

@media (min-width: 768px) {
  .card-grid { grid-template-columns: repeat(6, 1fr); }
}

.card-tile {
  aspect-ratio: 2/3;
  background: white;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 3px solid transparent;
  cursor: pointer;
  position: relative;
}

.card-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-image img { width: 100%; height: 100%; object-fit: cover; }

.card-placeholder { font-size: 28px; }

.card-body {
  padding: 6px 8px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
}

.card-title {
  font-size: 9px;
  font-weight: 800;
  color: var(--color-charcoal);
  line-height: 1.3;
  flex: 1;
}

.card-delete {
  background: none;
  border: none;
  font-size: 10px;
  color: var(--color-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
  display: none;
}

.card-tile:hover .card-delete { display: block; }

.card-tile--add { border-top-color: var(--color-border-light) !important; border-top-style: dashed; box-shadow: none; }
.card-image--add { background: var(--color-cream); font-size: 24px; color: var(--color-border-light); font-weight: 400; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
ng test --include="**/deck-detail.component.spec.ts" --watch=false
```

Expected: 2 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/deck-detail/
git commit -m "feat: redesign DeckDetailComponent with hero banner and tarot card grid"
```

---

### Task 9: DrawnCardComponent — 3D flip reveal

**Files:**
- Modify: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts`
- Modify: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.html`
- Create: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.css`
- Create: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DrawnCardComponent } from './drawn-card.component';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';

const mockCard: Card = { id: 1, title: 'The Journey', description: 'Step forward', imageUrl: '', createdAt: '2026-01-01', deckId: 1 };
const mockDeck: Deck = { id: 1, name: 'Adventure', description: null, createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0, cardBackImageUrl: null, cards: [mockCard] };

describe('DrawnCardComponent', () => {
  let component: DrawnCardComponent;
  let fixture: ComponentFixture<DrawnCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DrawnCardComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DrawnCardComponent);
    component = fixture.componentInstance;
  });

  it('should start with flipped = false', () => {
    expect(component.flipped()).toBe(false);
  });

  it('should flip card when flipCard() is called', () => {
    component.deck.set(mockDeck);
    component.drawnCard.set(mockCard);
    fixture.detectChanges();
    component.flipCard();
    fixture.detectChanges();
    expect(component.flipped()).toBe(true);
    const scene = fixture.nativeElement.querySelector('.card-scene');
    expect(scene.classList).toContain('flipped');
  });

  it('should reset flipped when drawAnother() is called', () => {
    component.deck.set(mockDeck);
    component.drawnCard.set(mockCard);
    component.flipped.set(true);
    component.drawAnother();
    expect(component.flipped()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include="**/drawn-card.component.spec.ts" --watch=false
```

Expected: FAIL — `component.flipped` is not a signal.

- [ ] **Step 3: Implement the component TS**

Replace `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts`:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-drawn-card',
  templateUrl: './drawn-card.component.html',
  styleUrls: ['./drawn-card.component.css']
})
export class DrawnCardComponent implements OnInit {
  deck = signal<Deck | null>(null);
  drawnCard = signal<Card | null>(null);
  flipped = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.deckService.getDeck(Number(params['id'])).subscribe({
        next: (deck) => {
          this.deck.set(deck);
          this.pickRandom(deck);
          this.loading.set(false);
        },
        error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
      });
    });
  }

  private pickRandom(deck: Deck): void {
    const cards = deck.cards ?? [];
    if (!cards.length) return;
    this.drawnCard.set(cards[Math.floor(Math.random() * cards.length)]);
    this.flipped.set(false);
  }

  flipCard(): void {
    if (!this.flipped()) this.flipped.set(true);
  }

  drawAnother(): void {
    const d = this.deck();
    if (d) this.pickRandom(d);
  }

  backToDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id]);
  }

  getCardBackGradient(): string {
    return getDeckGradientStyle(this.deck()?.colorIndex ?? 0);
  }

  hasCustomBack(): boolean {
    return !!this.deck()?.cardBackImageUrl;
  }

  getCardBackImageUrl(): string {
    return this.deck()?.cardBackImageUrl ?? '';
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `fortunecards.client/src/app/components/drawn-card/drawn-card.component.html`:

```html
<div class="page" *ngIf="!loading() && !error()">
  <nav class="nav-bar">
    <button class="nav-back" (click)="backToDeck()">← {{ deck()?.name }}</button>
    <span class="nav-title">Draw a Card</span>
    <span></span>
  </nav>

  <main class="draw-scene">
    <p class="draw-hint" [class.hint-hidden]="flipped()">✨ Tap the card to reveal your fortune</p>

    <div
      class="card-scene"
      [class.flipped]="flipped()"
      (click)="flipCard()"
    >
      <div class="card-flipper">

        <!-- Back (face-down) -->
        <div class="card-back">
          <img
            *ngIf="hasCustomBack()"
            [src]="getCardBackImageUrl()"
            class="card-back-img"
            alt="Card back"
          />
          <div
            *ngIf="!hasCustomBack()"
            class="card-back-gradient"
            [style.background]="getCardBackGradient()"
          >
            <div class="card-back-inner">
              <span class="card-back-emoji">🎴</span>
            </div>
          </div>
          <span class="card-back-label">Tap to reveal</span>
        </div>

        <!-- Face (revealed) -->
        <div class="card-face" *ngIf="drawnCard() as card">
          <div class="card-face-image">
            <img *ngIf="card.imageUrl" [src]="card.imageUrl" [alt]="card.title" />
            <span *ngIf="!card.imageUrl" class="card-face-placeholder">🃏</span>
          </div>
          <div class="card-face-body">
            <h2 class="card-face-title">{{ card.title }}</h2>
            <p class="card-face-desc">{{ card.description }}</p>
          </div>
        </div>

      </div>
    </div>

    <div class="draw-actions" [class.actions-visible]="flipped()">
      <button class="btn-primary" (click)="drawAnother()">🎴 Draw Another</button>
      <button class="btn-secondary" (click)="backToDeck()">← Back to Deck</button>
    </div>
  </main>
</div>

<div *ngIf="loading()" class="state-loading">Loading deck…</div>
<div *ngIf="error()" class="state-error">{{ error() }}</div>
```

- [ ] **Step 5: Create the component CSS**

Create `fortunecards.client/src/app/components/drawn-card/drawn-card.component.css`:

```css
.draw-scene {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px 48px;
  gap: 24px;
  min-height: calc(100vh - 58px);
}

.draw-hint {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-muted);
  text-align: center;
  transition: opacity 0.4s;
}

.hint-hidden { opacity: 0; }

/* 3D flip setup */
.card-scene {
  width: 220px;
  height: 330px;
  perspective: 1000px;
  cursor: pointer;
  animation: card-pulse 2s ease-in-out infinite;
}

.card-scene.flipped {
  animation: none;
  cursor: default;
}

@keyframes card-pulse {
  0%, 100% { transform: scale(1);      filter: drop-shadow(0 12px 28px rgba(255,107,107,0.3)); }
  50%       { transform: scale(1.025); filter: drop-shadow(0 18px 36px rgba(255,107,107,0.5)); }
}

.card-flipper {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-scene.flipped .card-flipper { transform: rotateY(180deg); }

.card-back, .card-face {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
}

/* Card back */
.card-back { border: 3px solid rgba(255,255,255,0.3); }

.card-back-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-back-gradient {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-back-inner {
  width: calc(100% - 24px);
  height: calc(100% - 24px);
  border: 2px solid rgba(255,255,255,0.35);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-back-emoji { font-size: 52px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.15)); }

.card-back-label {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 800;
  color: rgba(255,255,255,0.9);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

/* Card face */
.card-face {
  background: white;
  transform: rotateY(180deg);
  display: flex;
  flex-direction: column;
  border: 3px solid var(--color-border);
  border-top: 4px solid var(--color-coral);
  box-shadow: 0 12px 40px rgba(0,0,0,0.12);
}

.card-face-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #FF6B6B12, #FECA5722);
  overflow: hidden;
}

.card-face-image img { width: 100%; height: 100%; object-fit: cover; }
.card-face-placeholder { font-size: 56px; }

.card-face-body {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--color-border);
}

.card-face-title { font-size: 15px; font-weight: 800; text-align: center; margin-bottom: 6px; }
.card-face-desc  { font-size: 11px; color: #777; text-align: center; line-height: 1.5; }

/* Action buttons */
.draw-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 260px;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.4s 0.3s, transform 0.4s 0.3s;
}

.actions-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.draw-actions .btn-primary,
.draw-actions .btn-secondary { width: 100%; text-align: center; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
ng test --include="**/drawn-card.component.spec.ts" --watch=false
```

Expected: 3 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/drawn-card/
git commit -m "feat: redesign DrawnCardComponent with 3D flip reveal animation"
```

---

### Task 10: CreateDeckComponent redesign

**Files:**
- Modify: `fortunecards.client/src/app/components/create-deck/create-deck.component.ts`
- Modify: `fortunecards.client/src/app/components/create-deck/create-deck.component.html`
- Create: `fortunecards.client/src/app/components/create-deck/create-deck.component.css`
- Create: `fortunecards.client/src/app/components/create-deck/create-deck.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/components/create-deck/create-deck.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CreateDeckComponent } from './create-deck.component';

describe('CreateDeckComponent', () => {
  let component: CreateDeckComponent;
  let fixture: ComponentFixture<CreateDeckComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CreateDeckComponent],
      imports: [ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CreateDeckComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be invalid when name is empty', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('should be valid with name, emoji and colorIndex set', () => {
    component.form.get('name')!.setValue('My Deck');
    component.form.get('emoji')!.setValue('🌈');
    component.form.get('colorIndex')!.setValue(0);
    expect(component.form.valid).toBe(true);
  });

  it('should render 5 color swatches', () => {
    const swatches = fixture.nativeElement.querySelectorAll('.color-swatch');
    expect(swatches.length).toBe(5);
  });

  it('should update selectedColor when a swatch is clicked', () => {
    component.selectColor(2);
    expect(component.form.get('colorIndex')!.value).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include="**/create-deck.component.spec.ts" --watch=false
```

Expected: FAIL — `component.form` does not have `emoji` / `colorIndex` controls.

- [ ] **Step 3: Implement the component TS**

Replace `fortunecards.client/src/app/components/create-deck/create-deck.component.ts`:

```typescript
import { Component, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-create-deck',
  templateUrl: './create-deck.component.html',
  styleUrls: ['./create-deck.component.css']
})
export class CreateDeckComponent {
  readonly GRADIENTS = [0, 1, 2, 3, 4];

  form = this.fb.group({
    emoji:       ['🎴', [Validators.required, Validators.maxLength(10)]],
    colorIndex:  [0, Validators.required],
    name:        ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(1000)],
  });

  cardBackFile = signal<File | null>(null);
  cardBackPreview = signal<string | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private deckService: DeckService,
    private router: Router
  ) {}

  getGradientStyle(index: number): string {
    return getDeckGradientStyle(index);
  }

  getSelectedGradient(): string {
    return getDeckGradientStyle(this.form.get('colorIndex')!.value ?? 0);
  }

  selectColor(index: number): void {
    this.form.get('colorIndex')!.setValue(index);
    if (!this.cardBackFile()) this.cardBackPreview.set(null);
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
    this.submitting.set(true);
    const v = this.form.value;
    this.deckService.createDeck({
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🎴',
      colorIndex: v.colorIndex ?? 0,
      cardBackImage: this.cardBackFile() ?? undefined,
    }).subscribe({
      next: (deck) => this.router.navigate(['/decks', deck.id]),
      error: () => { this.error.set('Failed to create deck.'); this.submitting.set(false); }
    });
  }

  cancel(): void {
    this.router.navigate(['/decks']);
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `fortunecards.client/src/app/components/create-deck/create-deck.component.html`:

```html
<div class="form-page">
  <nav class="nav-bar">
    <button class="btn-ghost" (click)="cancel()">✕ Cancel</button>
    <span class="nav-title">New Deck</span>
    <button
      class="btn-ghost btn-ghost--action"
      [disabled]="form.invalid || submitting()"
      (click)="submit()"
    >Create</button>
  </nav>

  <main class="form-content">
    <form (ngSubmit)="submit()" [formGroup]="form">

      <!-- Emoji input -->
      <div class="emoji-section">
        <div class="emoji-preview" [style.background]="getSelectedGradient()">
          <input
            class="emoji-input"
            formControlName="emoji"
            maxlength="10"
            placeholder="🎴"
            aria-label="Deck emoji"
          />
        </div>
        <p class="emoji-hint">Type or paste an emoji</p>
      </div>

      <!-- Color swatches -->
      <div class="form-field">
        <label class="form-label">Color</label>
        <div class="swatch-row">
          <button
            type="button"
            class="color-swatch"
            *ngFor="let i of GRADIENTS"
            [style.background]="getGradientStyle(i)"
            [class.swatch--selected]="form.get('colorIndex')!.value === i"
            (click)="selectColor(i)"
          ></button>
        </div>
      </div>

      <!-- Card back upload -->
      <div class="form-field">
        <label class="form-label">Card Back <span>(optional)</span></label>
        <div class="card-back-row">
          <!-- Preview: custom image or gradient -->
          <div class="card-back-preview">
            <img *ngIf="cardBackPreview()" [src]="cardBackPreview()!" alt="Card back preview" />
            <div
              *ngIf="!cardBackPreview()"
              class="card-back-gradient"
              [style.background]="getSelectedGradient()"
            >
              <span>🎴</span>
            </div>
          </div>
          <!-- Upload / remove -->
          <div class="card-back-actions">
            <p class="card-back-status" *ngIf="cardBackPreview()">✓ Custom back set</p>
            <p class="card-back-status muted" *ngIf="!cardBackPreview()">Using color gradient as default</p>
            <label class="btn-secondary btn-file" *ngIf="!cardBackPreview()">
              📷 Upload Image
              <input type="file" accept="image/*" (change)="onCardBackSelected($event)" hidden />
            </label>
            <button type="button" class="btn-ghost" *ngIf="cardBackPreview()" (click)="removeCardBack()">✕ Remove</button>
          </div>
        </div>
      </div>

      <!-- Name -->
      <div class="form-field">
        <label class="form-label" for="deckName">Deck Name</label>
        <input
          id="deckName"
          class="form-input"
          formControlName="name"
          placeholder="e.g. Adventure Deck"
          maxlength="200"
        />
      </div>

      <!-- Description -->
      <div class="form-field">
        <label class="form-label" for="deckDesc">Description <span>(optional)</span></label>
        <textarea
          id="deckDesc"
          class="form-textarea"
          formControlName="description"
          placeholder="What is this deck about?"
          maxlength="1000"
          rows="3"
        ></textarea>
      </div>

      <div *ngIf="error()" class="state-error">{{ error() }}</div>

      <button
        type="submit"
        class="btn-primary btn-full"
        [disabled]="form.invalid || submitting()"
      >
        {{ submitting() ? 'Creating…' : '✨ Create Deck' }}
      </button>
    </form>
  </main>
</div>
```

- [ ] **Step 5: Create the component CSS**

Create `fortunecards.client/src/app/components/create-deck/create-deck.component.css`:

```css
.form-page { display: flex; flex-direction: column; min-height: 100vh; }

.form-content {
  padding: 24px 20px 48px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.form-content form { display: flex; flex-direction: column; gap: 20px; }

/* Emoji */
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

/* Color swatches */
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

/* Card back */
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
.card-back-status.muted { color: var(--color-muted); font-weight: 600; }

.btn-file {
  display: inline-block;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 13px;
}

/* Nav ghost action */
.btn-ghost--action {
  color: var(--color-coral);
  font-weight: 800;
}

.btn-ghost--action:disabled { opacity: 0.4; }

.btn-full { width: 100%; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
ng test --include="**/create-deck.component.spec.ts" --watch=false
```

Expected: 4 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/create-deck/
git commit -m "feat: redesign CreateDeckComponent with emoji, color swatch, card back upload"
```

---

### Task 11: CreateCardComponent redesign

**Files:**
- Modify: `fortunecards.client/src/app/components/create-card/create-card.component.ts`
- Modify: `fortunecards.client/src/app/components/create-card/create-card.component.html`
- Create: `fortunecards.client/src/app/components/create-card/create-card.component.css`
- Create: `fortunecards.client/src/app/components/create-card/create-card.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `fortunecards.client/src/app/components/create-card/create-card.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CreateCardComponent } from './create-card.component';

describe('CreateCardComponent', () => {
  let component: CreateCardComponent;
  let fixture: ComponentFixture<CreateCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CreateCardComponent],
      imports: [ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CreateCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be invalid when title is empty', () => {
    component.form.get('title')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('should be invalid when image is not selected', () => {
    component.form.get('title')!.setValue('The Journey');
    component.form.get('description')!.setValue('Step forward');
    expect(component.imageFile()).toBeNull();
  });

  it('should render a tarot-proportioned upload area', () => {
    const area = fixture.nativeElement.querySelector('.image-upload-area');
    expect(area).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fortunecards.client
ng test --include="**/create-card.component.spec.ts" --watch=false
```

Expected: FAIL — `.image-upload-area` not found / `component.imageFile` not a signal.

- [ ] **Step 3: Implement the component TS**

Replace `fortunecards.client/src/app/components/create-card/create-card.component.ts`:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DeckService } from '../../services/deck.service';

@Component({
  selector: 'app-create-card',
  templateUrl: './create-card.component.html',
  styleUrls: ['./create-card.component.css']
})
export class CreateCardComponent implements OnInit {
  deckId = signal(0);

  form = this.fb.group({
    title:       ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => this.deckId.set(Number(params['id'])));
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
    if (this.form.invalid || !this.imageFile()) return;
    this.submitting.set(true);
    const v = this.form.value;
    this.deckService.addCard(this.deckId(), v.title!, v.description!, this.imageFile()!).subscribe({
      next: () => this.router.navigate(['/decks', this.deckId()]),
      error: () => { this.error.set('Failed to add card.'); this.submitting.set(false); }
    });
  }

  cancel(): void {
    this.router.navigate(['/decks', this.deckId()]);
  }
}
```

- [ ] **Step 2: Implement the template**

Replace `fortunecards.client/src/app/components/create-card/create-card.component.html`:

```html
<div class="form-page">
  <nav class="nav-bar">
    <button class="btn-ghost" (click)="cancel()">✕ Cancel</button>
    <span class="nav-title">Add Card</span>
    <button
      class="btn-ghost btn-ghost--action"
      [disabled]="form.invalid || !imageFile() || submitting()"
      (click)="submit()"
    >Save</button>
  </nav>

  <main class="form-content">
    <form (ngSubmit)="submit()" [formGroup]="form">

      <!-- Card image upload — tarot proportioned -->
      <div class="form-field image-field">
        <label class="form-label">Card Image</label>
        <div class="image-upload-area" [class.has-image]="imagePreview()">
          <img *ngIf="imagePreview()" [src]="imagePreview()!" class="image-preview" alt="Card preview" />
          <div *ngIf="!imagePreview()" class="image-placeholder">
            <span class="image-placeholder-icon">🖼️</span>
            <p class="image-placeholder-text">Tap to upload card image</p>
            <label class="btn-secondary btn-file">
              + Upload
              <input type="file" accept="image/*" (change)="onImageSelected($event)" hidden />
            </label>
          </div>
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

      <button
        type="submit"
        class="btn-primary btn-full"
        [disabled]="form.invalid || !imageFile() || submitting()"
      >
        {{ submitting() ? 'Adding…' : '🎴 Add Card' }}
      </button>
    </form>
  </main>
</div>
```

- [ ] **Step 3: Create the component CSS**

Create `fortunecards.client/src/app/components/create-card/create-card.component.css`:

```css
.form-page { display: flex; flex-direction: column; min-height: 100vh; }

.form-content {
  padding: 24px 20px 48px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.form-content form { display: flex; flex-direction: column; gap: 20px; }

/* Tarot-proportioned upload area */
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

.image-placeholder-text {
  font-size: 11px;
  color: var(--color-muted);
  font-weight: 600;
  line-height: 1.4;
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

.btn-file { display: inline-block; cursor: pointer; padding: 7px 14px; font-size: 12px; }
.btn-ghost--action { color: var(--color-coral); font-weight: 800; }
.btn-ghost--action:disabled { opacity: 0.4; }
.btn-full { width: 100%; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ng test --include="**/create-card.component.spec.ts" --watch=false
```

Expected: 3 specs, 0 failures.

- [ ] **Step 5: Verify the full app builds**

```bash
cd fortunecards.client
ng build --configuration=development
```

Expected: Build succeeds, 0 errors.

- [ ] **Step 6: Manual smoke test**

Start both servers (F5 in Visual Studio or run `dotnet run` + `npm start`). Walk through the golden path:

1. Open `https://127.0.0.1:51313` — deck grid appears on cream background with Nunito font.
2. Click "+ New Deck" — navigates to `/decks/new` full-screen form. Fill in an emoji, pick a color, optionally upload a card back, enter a name, click "✨ Create Deck".
3. New deck tile appears in grid with correct gradient and emoji.
4. Click the deck tile — deck detail opens with gradient hero banner.
5. Click "+ Add Card" — navigates to `/decks/:id/cards/new`. Upload an image, add title and description, click "🎴 Add Card".
6. Card appears as a portrait tarot-style tile in the deck detail grid.
7. Click "🎴 Draw a Card" — navigate to draw screen. Card pulses face-down. Click it — 3D flip reveals the card. Buttons fade in. Click "🎴 Draw Another" — card resets and flips again.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/create-card/
git commit -m "feat: redesign CreateCardComponent with tarot-proportioned image upload"
```

---

## Post-Implementation

Run the full test suite to confirm all specs pass:

```bash
cd fortunecards.client
ng test --watch=false
```

Expected: All specs pass, 0 failures.

Apply the pending EF migration to the database (only needed if the database already exists):

```powershell
dotnet ef database update --project FortuneCards.Server
```
