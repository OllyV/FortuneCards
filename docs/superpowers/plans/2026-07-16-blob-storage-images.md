# Blob Storage for Card Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move runtime-uploaded card/deck images from the server's local disk to Azure Blob Storage, store absolute blob URLs in the database, and provide a temporary endpoint to migrate existing local files.

**Architecture:** A new injectable `IImageStorage` (blob-backed) replaces the static disk-based `ImageStorage`. `DeckService` and `CardService` route every image save/delete through it. Uploads return absolute URLs pointing at a public-read blob container; the browser fetches images directly from Azure (no serving-code changes). A temporary, gated `MigrationController` uploads existing `wwwroot/images/` files under their existing names and rewrites matching DB rows.

**Tech Stack:** ASP.NET Core 10, EF Core (SQL Server), `Azure.Storage.Blobs` (block blobs), Azure Blob Storage (GPv2, Hot tier, public-blob container).

## Global Constraints

- **No backend test project exists** (per CLAUDE.md). Verify every backend task with `dotnet build` plus the manual runtime checks stated in the task. Do not create a backend test project.
- Connection string config mirrors Application Insights: **dev** via `dotnet user-secrets`, **prod** via an Azure App Service application setting. Key: `BlobStorage:ConnectionString`. Container key: `BlobStorage:Container` (default `images`).
- Stored image URLs become **absolute** Azure blob URLs, e.g. `https://{account}.blob.core.windows.net/images/{guid}.ext`.
- Blob type: **block blobs**; container access: **public blob read**; access tier: **Hot**.
- Migration endpoint is **temporary** — gated behind config flag `EnableImageMigration` (default off) **and** requires an authenticated user; removed after use.

---

### Task 1: Blob-backed `IImageStorage` + route all image operations through it

Replace the static disk `ImageStorage` with an injectable blob-backed service, wire up the container client in DI, and route every image save/delete in `DeckService` and `CardService` through the new service. This task ends with a clean build.

**Files:**
- Modify (replace contents): `FortuneCards.Server/Services/ImageStorage.cs`
- Modify: `FortuneCards.Server/Program.cs`
- Modify: `FortuneCards.Server/FortuneCards.Server.csproj` (add NuGet package)
- Modify (replace contents): `FortuneCards.Server/Services/DeckService.cs`
- Modify (replace contents): `FortuneCards.Server/Services/CardService.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface IImageStorage { Task<string> SaveAsync(IFormFile file); Task DeleteAsync(string imageUrl); }`
  - `class BlobImageStorage : IImageStorage` (registered as singleton).
  - `static string? BlobImageStorage.GetBlobName(string imageUrl)` — last path segment of an absolute URL or `/images/{name}` path.
  - A `BlobContainerClient` registered as a singleton in DI (consumed by Task 2).

Six disk touchpoints are being replaced: `DeckService.CreateAsync` (save), `DeckService.AddCardAsync` (inline disk write), `DeckService.UpdateAsync` (delete+save), `DeckService.DeleteAsync` (private `DeleteImage`), `CardService.DeleteAsync` (inline disk delete), `CardService.UpdateAsync` (delete+save).

- [ ] **Step 1: Add the Azure Blob Storage package**

Run from repo root:
```powershell
dotnet add FortuneCards.Server package Azure.Storage.Blobs
```
Expected: package added to `FortuneCards.Server.csproj`, restore succeeds.

- [ ] **Step 2: Replace `ImageStorage.cs` with the interface + blob implementation**

Replace the entire contents of `FortuneCards.Server/Services/ImageStorage.cs` with:

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace FortuneCards.Server.Services
{
    public interface IImageStorage
    {
        Task<string> SaveAsync(IFormFile file);
        Task DeleteAsync(string imageUrl);
    }

    public class BlobImageStorage : IImageStorage
    {
        private readonly BlobContainerClient _container;

        public BlobImageStorage(BlobContainerClient container) => _container = container;

        public async Task<string> SaveAsync(IFormFile file)
        {
            var ext = Path.GetExtension(file.FileName);
            var blobName = $"{Guid.NewGuid()}{ext}";
            var blob = _container.GetBlobClient(blobName);
            await using var stream = file.OpenReadStream();
            await blob.UploadAsync(stream, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = file.ContentType }
            });
            return blob.Uri.ToString();
        }

        public async Task DeleteAsync(string imageUrl)
        {
            var blobName = GetBlobName(imageUrl);
            if (blobName is null) return;
            await _container.DeleteBlobIfExistsAsync(blobName);
        }

        // Last path segment of an absolute blob URL, or of a legacy "/images/{name}" path.
        public static string? GetBlobName(string imageUrl)
        {
            if (string.IsNullOrWhiteSpace(imageUrl)) return null;
            var name = Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri)
                ? Path.GetFileName(uri.AbsolutePath)
                : Path.GetFileName(imageUrl);
            return string.IsNullOrWhiteSpace(name) ? null : name;
        }
    }
}
```

- [ ] **Step 3: Register the container client and service in `Program.cs`**

Add these `using` directives at the top of `FortuneCards.Server/Program.cs` (with the existing usings):
```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
```

Then, immediately after the `builder.Services.AddScoped<IAuthService, AuthService>();` line (before `AddHttpClient`), add:
```csharp
var blobConnection = builder.Configuration["BlobStorage:ConnectionString"]
    ?? throw new InvalidOperationException("BlobStorage:ConnectionString is not configured.");
var blobContainerName = builder.Configuration["BlobStorage:Container"] ?? "images";

builder.Services.AddSingleton(_ =>
{
    var service = new BlobServiceClient(blobConnection);
    var container = service.GetBlobContainerClient(blobContainerName);
    container.CreateIfNotExists(PublicAccessType.Blob);
    return container;
});
builder.Services.AddSingleton<IImageStorage, BlobImageStorage>();
```

- [ ] **Step 4: Set a dev connection string**

Run from repo root (real Azure account recommended for dev; see note below on Azurite):
```powershell
dotnet user-secrets --project FortuneCards.Server set "BlobStorage:ConnectionString" "<your-connection-string>"
```

> **Azurite / mixed-content note:** Azurite serves blobs over `http://127.0.0.1:10000/...`. The Angular dev server runs on **https**, so `<img>` tags pointing at http Azurite URLs are blocked as mixed content and won't render. For a smooth local experience use a real Azure storage account (https URLs). Azurite is fine for verifying uploads/deletes via the API and Azure Storage Explorer, just not for in-browser image rendering.

- [ ] **Step 5: Replace `DeckService.cs` contents**

Replace the entire contents of `FortuneCards.Server/Services/DeckService.cs` with:

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
        private readonly IImageStorage _imageStorage;

        public DeckService(FortuneCardsDbContext db, IMemoryCache cache, IImageStorage imageStorage)
        {
            _db = db;
            _cache = cache;
            _imageStorage = imageStorage;
        }

        public async Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null)
        {
            if (userId == null)
            {
                if (_cache.TryGetValue(AllDecksKey, out IEnumerable<DeckSummary>? cached) && cached is not null)
                    return cached;

                var publicDecks = await _db.Decks
                    .Where(d => d.IsPublic)
                    .Select(d => new DeckSummary(
                        d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                        d.Emoji, d.ColorIndex, d.CardBackImageUrl, true, false))
                    .ToListAsync();

                _cache.Set(AllDecksKey, publicDecks, CacheDuration);
                return publicDecks;
            }

            return await _db.Decks
                .Where(d => d.IsPublic || d.UserId == userId)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId))
                .ToListAsync();
        }

        public async Task<DeckDetail?> GetByIdAsync(int id, int? userId = null)
        {
            if (userId == null && _cache.TryGetValue(DeckKey(id), out DeckDetail? cached) && cached is not null)
                return cached;

            var deck = await _db.Decks
                .Where(d => d.Id == id && (d.IsPublic || d.UserId == userId))
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description, c.ImageUrl, c.CreatedAt)),
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId))
                .FirstOrDefaultAsync();

            if (deck is not null && userId == null)
                _cache.Set(DeckKey(id), deck, CacheDuration);

            return deck;
        }

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int userId)
        {
            string? cardBackImageUrl = null;
            if (cardBackImage is { Length: > 0 })
                cardBackImageUrl = await _imageStorage.SaveAsync(cardBackImage);

            var deck = new Deck
            {
                Name = name,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
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

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null || deck.UserId != userId) return false;

            if (deck.CardBackImageUrl is not null)
                await _imageStorage.DeleteAsync(deck.CardBackImageUrl);

            _db.Decks.Remove(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(id));
            return true;
        }

        public async Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return null;

            var imageUrl = await _imageStorage.SaveAsync(image);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageUrl = imageUrl,
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }

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
                if (deck.CardBackImageUrl is not null) await _imageStorage.DeleteAsync(deck.CardBackImageUrl);
                deck.CardBackImageUrl = await _imageStorage.SaveAsync(cardBackImage);
            }

            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return await GetByIdAsync(deckId, userId);
        }
    }
}
```

- [ ] **Step 6: Replace `CardService.cs` contents**

Replace the entire contents of `FortuneCards.Server/Services/CardService.cs` with:

```csharp
using FortuneCards.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class CardService : ICardService
    {
        private static string DeckKey(int id) => $"decks:{id}";
        private const string AllDecksKey = "decks:all";

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IImageStorage _imageStorage;

        public CardService(FortuneCardsDbContext db, IMemoryCache cache, IImageStorage imageStorage)
        {
            _db = db;
            _cache = cache;
            _imageStorage = imageStorage;
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var card = await _db.Cards
                .Include(c => c.Deck)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (card is null || card.Deck?.UserId != userId) return false;

            await _imageStorage.DeleteAsync(card.ImageUrl);

            var deckId = card.DeckId;
            _db.Cards.Remove(card);
            await _db.SaveChangesAsync();

            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return true;
        }

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
                await _imageStorage.DeleteAsync(card.ImageUrl);
                card.ImageUrl = await _imageStorage.SaveAsync(image);
            }

            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(card.DeckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }
    }
}
```

- [ ] **Step 7: Build**

```powershell
dotnet build
```
Expected: SUCCESS, 0 errors. (`_env` / `IWebHostEnvironment` is no longer referenced by either service — confirm no leftover `using` or field causes a warning; remove any that are now unused.)

- [ ] **Step 8: Manual runtime verification** (requires a configured `BlobStorage:ConnectionString`)

Run the app (`dotnet run --project FortuneCards.Server` + `npm start` in `fortunecards.client`, or F5). Signed in as a deck owner:
1. Create a card with an image → verify the card renders, and the blob appears in the container (Azure Portal / Storage Explorer). The card's image URL in the network tab should be an absolute `...blob.core.windows.net/images/...` URL.
2. Update that card's image → old blob removed, new blob present, new image renders.
3. Delete the card → its blob is removed from the container.
4. Repeat create/delete for a deck **card-back** image (deck create/edit).

Expected: all images stored in and served from blob; no new files written to `wwwroot/images/`.

- [ ] **Step 9: Commit**

```powershell
git add FortuneCards.Server/Services/ImageStorage.cs FortuneCards.Server/Program.cs FortuneCards.Server/FortuneCards.Server.csproj FortuneCards.Server/Services/DeckService.cs FortuneCards.Server/Services/CardService.cs
git commit -m "feat: store deck/card images in Azure Blob Storage via IImageStorage"
```

---

### Task 2: Temporary migration endpoint

Add a gated, temporary controller that uploads existing `wwwroot/images/` files to blob under their existing names and rewrites matching DB rows to absolute blob URLs.

**Files:**
- Create: `FortuneCards.Server/Controllers/MigrationController.cs`
- Modify: `CLAUDE.md` (architecture note)

**Interfaces:**
- Consumes: the registered `BlobContainerClient` (Task 1); `FortuneCardsDbContext`; `IMemoryCache`; `IConfiguration`; `IWebHostEnvironment`.
- Produces: `POST /api/admin/migrate-images` → `200 OK` with `{ uploaded, skipped, cardsUpdated, decksUpdated }`; `401` if unauthenticated; `404` if the `EnableImageMigration` flag is not set.

- [ ] **Step 1: Create the migration controller**

Create `FortuneCards.Server/Controllers/MigrationController.cs` with:

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using FortuneCards.Server.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Controllers
{
    // TEMPORARY: one-time migration of local wwwroot/images files into blob storage.
    // Remove this controller (and the EnableImageMigration flag) after it has been run
    // once per environment.
    [ApiController]
    [Route("api/admin")]
    public class MigrationController : ControllerBase
    {
        private const string AllDecksKey = "decks:all";

        private readonly BlobContainerClient _container;
        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IConfiguration _config;
        private readonly IWebHostEnvironment _env;

        public MigrationController(
            BlobContainerClient container,
            FortuneCardsDbContext db,
            IMemoryCache cache,
            IConfiguration config,
            IWebHostEnvironment env)
        {
            _container = container;
            _db = db;
            _cache = cache;
            _config = config;
            _env = env;
        }

        [HttpPost("migrate-images")]
        public async Task<IActionResult> MigrateImages()
        {
            if (!_config.GetValue<bool>("EnableImageMigration")) return NotFound();
            if (HttpContext.Items["UserId"] is not int) return Unauthorized();

            var imagesDir = Path.Combine(_env.WebRootPath, "images");
            var contentTypes = new FileExtensionContentTypeProvider();
            var urlByFileName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var uploaded = 0;
            var skipped = 0;

            if (Directory.Exists(imagesDir))
            {
                foreach (var path in Directory.EnumerateFiles(imagesDir))
                {
                    var fileName = Path.GetFileName(path);
                    var blob = _container.GetBlobClient(fileName);
                    urlByFileName[fileName] = blob.Uri.ToString();

                    if (await blob.ExistsAsync())
                    {
                        skipped++;
                        continue;
                    }

                    if (!contentTypes.TryGetContentType(fileName, out var contentType))
                        contentType = "application/octet-stream";

                    await using var stream = System.IO.File.OpenRead(path);
                    await blob.UploadAsync(stream, new BlobUploadOptions
                    {
                        HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
                    });
                    uploaded++;
                }
            }

            var affectedDeckIds = new HashSet<int>();

            var cards = await _db.Cards
                .Where(c => c.ImageUrl.StartsWith("/images/"))
                .ToListAsync();
            var cardsUpdated = 0;
            foreach (var card in cards)
            {
                var name = Path.GetFileName(card.ImageUrl);
                if (urlByFileName.TryGetValue(name, out var url))
                {
                    card.ImageUrl = url;
                    affectedDeckIds.Add(card.DeckId);
                    cardsUpdated++;
                }
            }

            var decks = await _db.Decks
                .Where(d => d.CardBackImageUrl != null && d.CardBackImageUrl.StartsWith("/images/"))
                .ToListAsync();
            var decksUpdated = 0;
            foreach (var deck in decks)
            {
                var name = Path.GetFileName(deck.CardBackImageUrl!);
                if (urlByFileName.TryGetValue(name, out var url))
                {
                    deck.CardBackImageUrl = url;
                    affectedDeckIds.Add(deck.Id);
                    decksUpdated++;
                }
            }

            await _db.SaveChangesAsync();

            // Invalidate cached deck data so rewritten URLs are served immediately.
            _cache.Remove(AllDecksKey);
            foreach (var deckId in affectedDeckIds)
                _cache.Remove($"decks:{deckId}");

            return Ok(new { uploaded, skipped, cardsUpdated, decksUpdated });
        }
    }
}
```

- [ ] **Step 2: Build**

```powershell
dotnet build
```
Expected: SUCCESS, 0 errors.

- [ ] **Step 3: Manual runtime verification** (requires a configured `BlobStorage:ConnectionString`)

1. Ensure at least one legacy row exists: an image file in `wwwroot/images/` whose name matches a `Card.ImageUrl` / `Deck.CardBackImageUrl` value of the form `/images/{name}` in the database. (If prior tasks migrated everything to blob, restore a sample file + set a row's URL back to `/images/{name}` to exercise this.)
2. Enable the flag and run the app:
   ```powershell
   dotnet user-secrets --project FortuneCards.Server set "EnableImageMigration" "true"
   ```
3. While signed in, POST to the endpoint (e.g. via the Scalar API UI at `/scalar`, or `curl` with the auth cookie):
   `POST https://localhost:7242/api/admin/migrate-images`
4. Expected response: `{ "uploaded": N, "skipped": M, "cardsUpdated": X, "decksUpdated": Y }`.
5. Verify the files now exist in the blob container and the corresponding DB rows now hold absolute `...blob.core.windows.net/...` URLs; images still render in the UI.
6. Confirm idempotency: POST again → `uploaded` is 0, `skipped` equals the file count, `cardsUpdated`/`decksUpdated` are 0.
7. Verify gating: unset the flag (`dotnet user-secrets --project FortuneCards.Server remove "EnableImageMigration"`), restart, POST again → `404`.

- [ ] **Step 4: Update CLAUDE.md architecture note**

In `CLAUDE.md`, update the backend architecture bullet that reads
`Runtime-uploaded images are saved to \`wwwroot/images/\` via \`Services/ImageStorage.cs\``
to reflect blob storage, e.g.:
`Runtime-uploaded images are stored in Azure Blob Storage via \`Services/ImageStorage.cs\` (\`IImageStorage\`); absolute blob URLs are persisted on \`Card.ImageUrl\`/\`Deck.CardBackImageUrl\` and served directly to the browser from a public-read container.`

- [ ] **Step 5: Commit**

```powershell
git add FortuneCards.Server/Controllers/MigrationController.cs CLAUDE.md
git commit -m "feat: add temporary image migration endpoint (local disk -> blob)"
```

---

## Notes

- **Dev proxy:** `fortunecards.client/src/proxy.conf.js` already forwards `/api` to the backend, so `/api/admin/migrate-images` needs no proxy change. Images are now fetched from absolute Azure URLs, bypassing the `/images` proxy entirely.
- **Post-migration cleanup (out of scope, later):** once every environment has migrated, `app.UseStaticFiles()` no longer serves any images and the `wwwroot/images/` files can be deleted; the `MigrationController` and `EnableImageMigration` flag should be removed.
