# Azure Blob → Cloudflare R2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move runtime-uploaded images from Azure Blob Storage to Cloudflare R2 (S3-compatible), store object **keys** in the database (server builds public URLs at read time), and copy existing images across. Frontend unchanged.

**Architecture:** Swap `BlobImageStorage` for `R2ImageStorage` (AWS S3 SDK against R2's endpoint) behind the unchanged `IImageStorage` seam; rename the entity columns `ImageUrl→ImageKey` / `CardBackImageUrl→CardBackImageKey`; build public URLs from `{R2:PublicBaseUrl}/{key}` when constructing DTOs; migrate existing bytes + rewrite DB rows with a standalone one-off tool.

**Tech Stack:** ASP.NET Core 10, EF Core 9 (Npgsql), `AWSSDK.S3`, Cloudflare R2, PostgreSQL on Aiven.

## Global Constraints

- Target storage is **Cloudflare R2** via the **AWS S3 SDK** (`AWSSDK.S3`), S3 endpoint `https://<R2:AccountId>.r2.cloudflarestorage.com`, `ForcePathStyle = true`, region `auto`.
- The DB stores the **object key** (`{guid}{ext}`), never a URL. DTOs still expose fields named `imageUrl` / `cardBackImageUrl`, now carrying the full public URL `{R2:PublicBaseUrl}/{key}`. **Frontend is unchanged.**
- Config `R2:*` (`AccountId`, `AccessKey`, `SecretKey`, `Bucket`, `PublicBaseUrl`): dev via user-secrets, prod via Azure App Service settings. **Credentials never in committed files.** Fail-fast at startup if incomplete.
- Public URL uses the **r2.dev** subdomain for now (`R2:PublicBaseUrl = https://pub-<hash>.r2.dev`). Switching to a custom domain later is a config-only change.
- No backend test project exists — verify with `dotnet build` (per CLAUDE.md).
- EF migrations here: use the `dotnet ef` CLI (VS Package Manager Console fails on the esproj ProjectReference); `database update` needs `--connection` (design-time factory doesn't read user-secrets). This plan only **scaffolds** the rename migration; applying it to Aiven is an operational step.
- The `ImageMigrator` tool is standalone (`tools/ImageMigrator/`), NOT added to `FortuneCards.slnx` and NOT referenced by the server.
- `tools/DbMigrator/Program.cs` (the completed DB-copy tool) references the pre-rename column names `ImageUrl`/`CardBackImageUrl`. It is defunct (already run once) and intentionally left untouched — do not update it.

---

### Task 1: R2 storage service + config + wiring (replace Azure Blob)

**Files:**
- Modify: `FortuneCards.Server/FortuneCards.Server.csproj` (packages)
- Modify: `FortuneCards.Server/Services/ImageStorage.cs` (interface + remove BlobImageStorage)
- Create: `FortuneCards.Server/Services/R2ImageStorage.cs`
- Create: `FortuneCards.Server/Services/R2Options.cs`
- Modify: `FortuneCards.Server/Program.cs` (swap registration)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `IImageStorage` now exposes `string PublicBaseUrl { get; }`, `Task<string> SaveAsync(IFormFile)` (returns an object **key**), `Task DeleteAsync(string key)`, and `string? PublicUrl(string? key)`. `R2ImageStorage` is the registered implementation. `R2Options` holds the bound `R2:*` config. Task 2 consumes `PublicBaseUrl` / `PublicUrl` in the read path.

- [ ] **Step 1: Swap the storage package in the csproj**

In `FortuneCards.Server/FortuneCards.Server.csproj`, remove:

```xml
    <PackageReference Include="Azure.Storage.Blobs" Version="12.29.1" />
```

and add (alphabetical order near the top of the `ItemGroup`):

```xml
    <PackageReference Include="AWSSDK.S3" Version="3.7.*" />
```

Then check whether `Azure.Identity` is still used anywhere:

```bash
git grep -n "Azure.Identity\|using Azure\b\|DefaultAzureCredential\|ManagedIdentity" -- FortuneCards.Server
```

If that returns no hits in `.cs` files (only the csproj line), also remove:

```xml
    <PackageReference Include="Azure.Identity" Version="1.21.0" />
```

If it does have `.cs` hits, leave `Azure.Identity` in place and note it in your report.

- [ ] **Step 2: Create the R2 options class**

Create `FortuneCards.Server/Services/R2Options.cs`:

```csharp
namespace FortuneCards.Server.Services
{
    public sealed class R2Options
    {
        public string AccountId { get; set; } = "";
        public string AccessKey { get; set; } = "";
        public string SecretKey { get; set; } = "";
        public string Bucket { get; set; } = "";
        public string PublicBaseUrl { get; set; } = "";

        public string ServiceUrl => $"https://{AccountId}.r2.cloudflarestorage.com";
    }
}
```

- [ ] **Step 3: Update the interface and remove BlobImageStorage**

Replace the entire contents of `FortuneCards.Server/Services/ImageStorage.cs` with just the interface (BlobImageStorage moves to R2ImageStorage in the next step):

```csharp
namespace FortuneCards.Server.Services
{
    public interface IImageStorage
    {
        // Base public URL for stored objects, e.g. https://pub-xxxx.r2.dev (no trailing slash).
        string PublicBaseUrl { get; }

        // Uploads the file and returns its object KEY (e.g. "{guid}.png"), not a URL.
        Task<string> SaveAsync(IFormFile file);

        // Deletes by key (tolerates a bare key or a legacy absolute URL). No-op if absent.
        Task DeleteAsync(string key);

        // Builds the absolute public URL for a key; null/empty key -> null.
        string? PublicUrl(string? key);
    }
}
```

- [ ] **Step 4: Create R2ImageStorage**

Create `FortuneCards.Server/Services/R2ImageStorage.cs`:

```csharp
using Amazon.S3;
using Amazon.S3.Model;

namespace FortuneCards.Server.Services
{
    public class R2ImageStorage : IImageStorage
    {
        private readonly IAmazonS3 _s3;
        private readonly string _bucket;

        public string PublicBaseUrl { get; }

        public R2ImageStorage(IAmazonS3 s3, R2Options options)
        {
            _s3 = s3;
            _bucket = options.Bucket;
            PublicBaseUrl = options.PublicBaseUrl.TrimEnd('/');
        }

        public async Task<string> SaveAsync(IFormFile file)
        {
            var ext = Path.GetExtension(file.FileName);
            var key = $"{Guid.NewGuid()}{ext}";
            await using var stream = file.OpenReadStream();
            await _s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = _bucket,
                Key = key,
                InputStream = stream,
                ContentType = file.ContentType,
                DisablePayloadSigning = true // R2 streaming-upload compatibility
            });
            return key;
        }

        public async Task DeleteAsync(string key)
        {
            var name = ExtractKey(key);
            if (name is null) return;
            await _s3.DeleteObjectAsync(_bucket, name);
        }

        public string? PublicUrl(string? key)
            => string.IsNullOrWhiteSpace(key) ? null : $"{PublicBaseUrl}/{key}";

        // Bare key, or the last path segment of a legacy absolute URL.
        public static string? ExtractKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var name = Uri.TryCreate(value, UriKind.Absolute, out var uri)
                ? Path.GetFileName(uri.AbsolutePath)
                : Path.GetFileName(value);
            return string.IsNullOrWhiteSpace(name) ? null : name;
        }
    }
}
```

- [ ] **Step 5: Rewire Program.cs**

In `FortuneCards.Server/Program.cs`, remove the Azure blob `using` lines at the top:

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
```

Remove the entire blob registration block:

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

and replace it with the R2 registration:

```csharp
var r2 = builder.Configuration.GetSection("R2").Get<R2Options>()
    ?? throw new InvalidOperationException("R2 configuration section is missing.");
if (string.IsNullOrWhiteSpace(r2.AccountId) || string.IsNullOrWhiteSpace(r2.AccessKey)
    || string.IsNullOrWhiteSpace(r2.SecretKey) || string.IsNullOrWhiteSpace(r2.Bucket)
    || string.IsNullOrWhiteSpace(r2.PublicBaseUrl))
    throw new InvalidOperationException(
        "R2 configuration is incomplete (need AccountId, AccessKey, SecretKey, Bucket, PublicBaseUrl).");

builder.Services.AddSingleton(r2);
builder.Services.AddSingleton<Amazon.S3.IAmazonS3>(_ =>
    new Amazon.S3.AmazonS3Client(r2.AccessKey, r2.SecretKey, new Amazon.S3.AmazonS3Config
    {
        ServiceURL = r2.ServiceUrl,
        ForcePathStyle = true,
        AuthenticationRegion = "auto"
    }));
builder.Services.AddSingleton<IImageStorage, R2ImageStorage>();
```

The `IImageStorage` namespace is already imported via `using FortuneCards.Server.Services;` (present in Program.cs). Also remove the now-obsolete eager blob resolution line further down:

```csharp
// Resolve the blob container eagerly so an invalid/unreachable storage account or a
// container that cannot be created with public access fails fast at startup, not on
// the first image request.
app.Services.GetRequiredService<Azure.Storage.Blobs.BlobContainerClient>();
```

(Config-presence validation above now provides the fail-fast behavior.)

- [ ] **Step 6: Build**

```bash
dotnet build FortuneCards.Server/FortuneCards.Server.csproj
```

Expected: build succeeds, 0 errors. (`DeckService`/`CardService` still compile — they call `SaveAsync`/`DeleteAsync`, which still exist. Runtime is not yet coherent — the read path is wired in Task 2 — but that is expected mid-plan.)

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/FortuneCards.Server.csproj FortuneCards.Server/Services/ImageStorage.cs FortuneCards.Server/Services/R2ImageStorage.cs FortuneCards.Server/Services/R2Options.cs FortuneCards.Server/Program.cs
git commit -m "feat(server): replace Azure Blob image storage with Cloudflare R2"
```

---

### Task 2: Rename image columns to keys + build public URLs in the read path

**Files:**
- Modify: `FortuneCards.Server/Models/Card.cs` (`ImageUrl` → `ImageKey`)
- Modify: `FortuneCards.Server/Models/Deck.cs` (`CardBackImageUrl` → `CardBackImageKey`)
- Modify: `FortuneCards.Server/Data/FortuneCardsDbContext.cs` (property config references)
- Modify: `FortuneCards.Server/Services/DeckService.cs` (URL building in projections + in-memory)
- Modify: `FortuneCards.Server/Services/CardService.cs` (URL building in-memory)
- Create: `FortuneCards.Server/Migrations/<timestamp>_RenameImageUrlToImageKey.cs` (+ Designer + snapshot update, generated)

**Interfaces:**
- Consumes: `IImageStorage.PublicBaseUrl` and `IImageStorage.PublicUrl(string?)` from Task 1.
- Produces: entities store keys (`Card.ImageKey`, `Deck.CardBackImageKey`); all DTOs return full public URLs. Record DTO field names (`CardDto.ImageUrl`, `DeckSummary.CardBackImageUrl`, `DeckDetail.CardBackImageUrl`) are **unchanged** — frontend contract preserved.

- [ ] **Step 1: Rename the entity properties**

In `FortuneCards.Server/Models/Card.cs`, rename the property `ImageUrl` to `ImageKey`:

```csharp
        public required string ImageKey { get; set; }
```

In `FortuneCards.Server/Models/Deck.cs`, rename `CardBackImageUrl` to `CardBackImageKey`:

```csharp
        public string? CardBackImageKey { get; set; }
```

- [ ] **Step 2: Update the DbContext property config**

In `FortuneCards.Server/Data/FortuneCardsDbContext.cs`, update the two property references:

In the `Deck` entity block, change:

```csharp
                e.Property(d => d.CardBackImageUrl).HasMaxLength(500);
```

to:

```csharp
                e.Property(d => d.CardBackImageKey).HasMaxLength(500);
```

In the `Card` entity block, change:

```csharp
                e.Property(c => c.ImageUrl).HasMaxLength(500).IsRequired();
```

to:

```csharp
                e.Property(c => c.ImageKey).HasMaxLength(500).IsRequired();
```

- [ ] **Step 3: Update DeckService — capture base URL and build URLs in projections + in-memory**

In `FortuneCards.Server/Services/DeckService.cs`:

In `GetPublicAsync`, after `var version = PublicDeckCache.Version(_cache);` (before the cache check), add a local for the base URL, and change the projection's card-back argument. Replace the projection:

```csharp
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, true, false,
                    d.AspectWidth, d.AspectHeight, false))
```

with (note the `baseUrl` local declared just above the `var query = ...` line):

```csharp
            var baseUrl = _imageStorage.PublicBaseUrl;
            var query = _db.Decks.Where(d => d.IsPublic);
```

and the projection becomes:

```csharp
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    true, false,
                    d.AspectWidth, d.AspectHeight, false))
```

In `GetMineAsync`, add `var baseUrl = _imageStorage.PublicBaseUrl;` just before `var decks = await _db.Decks` and change the card-back argument the same way:

```csharp
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    d.IsPublic, d.UserId == userId,
```

In `GetByIdAsync`, add `var baseUrl = _imageStorage.PublicBaseUrl;` just before `var deck = await _db.Decks` and change both the nested card image and the card-back:

```csharp
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description,
                        baseUrl + "/" + c.ImageKey, c.CreatedAt)),
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
```

In `CreateAsync`, the local `cardBackImageUrl` currently holds the value from `SaveAsync` (now a key). Rename it and build the URL for the returned DTO. Change:

```csharp
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
```

to:

```csharp
            string? cardBackImageKey = null;
            if (cardBackImage is { Length: > 0 })
                cardBackImageKey = await _imageStorage.SaveAsync(cardBackImage);

            var deck = new Deck
            {
                Name = name,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageKey = cardBackImageKey,
```

and change the returned `DeckSummary` card-back argument from `deck.CardBackImageUrl` to `_imageStorage.PublicUrl(deck.CardBackImageKey)`:

```csharp
            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, _imageStorage.PublicUrl(deck.CardBackImageKey), deck.IsPublic, true,
                deck.AspectWidth, deck.AspectHeight, false);
```

In `DeleteAsync`, change the null-check + delete to the renamed property:

```csharp
            if (deck.CardBackImageKey is not null)
                await _imageStorage.DeleteAsync(deck.CardBackImageKey);
```

In `AddCardAsync`, change the saved-key handling and the returned DTO:

```csharp
            var imageKey = await _imageStorage.SaveAsync(image);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageKey = imageKey,
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(deckId));
            _cache.Remove(MineKey(userId));

            return new CardDto(card.Id, card.Title, card.Description,
                _imageStorage.PublicUrl(card.ImageKey)!, card.CreatedAt);
```

In `UpdateAsync`, change the card-back replace block to the renamed property:

```csharp
            if (cardBackImage is { Length: > 0 })
            {
                if (deck.CardBackImageKey is not null) await _imageStorage.DeleteAsync(deck.CardBackImageKey);
                deck.CardBackImageKey = await _imageStorage.SaveAsync(cardBackImage);
            }
```

- [ ] **Step 4: Update CardService — renamed property + URL in returned DTO**

In `FortuneCards.Server/Services/CardService.cs`:

In `DeleteAsync`, change:

```csharp
            await _imageStorage.DeleteAsync(card.ImageUrl);
```

to:

```csharp
            await _imageStorage.DeleteAsync(card.ImageKey);
```

In `UpdateAsync`, change the image replace block and the returned DTO:

```csharp
            if (image is { Length: > 0 })
            {
                await _imageStorage.DeleteAsync(card.ImageKey);
                card.ImageKey = await _imageStorage.SaveAsync(image);
            }

            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(card.DeckId));

            return new CardDto(card.Id, card.Title, card.Description,
                _imageStorage.PublicUrl(card.ImageKey)!, card.CreatedAt);
```

- [ ] **Step 5: Build (verifies all references updated)**

```bash
dotnet build FortuneCards.Server/FortuneCards.Server.csproj
```

Expected: 0 errors. A compile error here means a reference to the old `ImageUrl`/`CardBackImageUrl` entity property was missed — fix it. (If the error is in `tools/DbMigrator`, that project is not built by this command; ignore — it is defunct per Global Constraints.)

- [ ] **Step 6: Scaffold the rename migration**

```bash
dotnet ef migrations add RenameImageUrlToImageKey --project FortuneCards.Server --startup-project FortuneCards.Server
```

Expected: a new migration is created. Do NOT run `database update` (no live DB in this task).

- [ ] **Step 7: Rewrite the migration to use RenameColumn (CRITICAL — prevents data loss)**

EF Core does **not** detect property renames; `migrations add` almost always scaffolds `DropColumn` + `AddColumn`, which would **drop the columns and destroy all existing image URLs** when this migration is applied to the real Aiven data. You must hand-edit the generated `<timestamp>_RenameImageUrlToImageKey.cs` so it renames instead.

Replace the body of `Up(...)` with exactly:

```csharp
            migrationBuilder.RenameColumn(
                name: "ImageUrl",
                table: "Cards",
                newName: "ImageKey");

            migrationBuilder.RenameColumn(
                name: "CardBackImageUrl",
                table: "Decks",
                newName: "CardBackImageKey");
```

Replace the body of `Down(...)` with exactly (the reverse):

```csharp
            migrationBuilder.RenameColumn(
                name: "ImageKey",
                table: "Cards",
                newName: "ImageUrl");

            migrationBuilder.RenameColumn(
                name: "CardBackImageKey",
                table: "Decks",
                newName: "CardBackImageUrl");
```

Delete any `DropColumn` / `AddColumn` calls the scaffolder produced. Leave the `.Designer.cs` and `FortuneCardsDbContextModelSnapshot.cs` as generated — they reflect the new model (columns `ImageKey` / `CardBackImageKey`), which is correct. Only the `Up`/`Down` operations in the main migration file are edited.

Confirm the final `Up`/`Down` contain **only** `RenameColumn` calls (two each) and no `DropColumn`/`AddColumn`.

- [ ] **Step 8: Build again (migration compiles)**

```bash
dotnet build FortuneCards.Server/FortuneCards.Server.csproj
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add FortuneCards.Server/Models FortuneCards.Server/Data/FortuneCardsDbContext.cs FortuneCards.Server/Services/DeckService.cs FortuneCards.Server/Services/CardService.cs FortuneCards.Server/Migrations
git commit -m "feat(server): store image object keys and build R2 public URLs at read time"
```

---

### Task 3: Build the one-off ImageMigrator tool

**Files:**
- Create: `tools/ImageMigrator/ImageMigrator.csproj`
- Create: `tools/ImageMigrator/Program.cs`

**Interfaces:**
- Consumes: env vars `AZURE_BLOB_CONNECTION`, `AZURE_BLOB_CONTAINER` (default `images`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `TARGET_CONNECTION` (Aiven).
- Produces: a runnable console app (`dotnet run --project tools/ImageMigrator`) that copies every Azure blob to R2 under the same key (skipping ones already present) and rewrites `Cards.ImageKey` / `Decks.CardBackImageKey` in Aiven from absolute URL → bare key. Prints counts.

- [ ] **Step 1: Create the project file**

Create `tools/ImageMigrator/ImageMigrator.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <!-- Standalone one-off tool: not part of the solution, not referenced by the server. -->
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Azure.Storage.Blobs" Version="12.29.1" />
    <PackageReference Include="AWSSDK.S3" Version="3.7.*" />
    <PackageReference Include="Npgsql" Version="9.*" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Write the migrator program**

Create `tools/ImageMigrator/Program.cs`:

```csharp
using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Azure.Storage.Blobs;
using Npgsql;

// One-off migration: Azure Blob images -> Cloudflare R2, then rewrite Aiven DB
// values from absolute Azure URLs to bare object keys. Idempotent.

static string Env(string name) =>
    Environment.GetEnvironmentVariable(name)
    ?? throw new InvalidOperationException($"Set {name} env var.");

var azureConn = Env("AZURE_BLOB_CONNECTION");
var azureContainer = Environment.GetEnvironmentVariable("AZURE_BLOB_CONTAINER") ?? "images";
var accountId = Env("R2_ACCOUNT_ID");
var accessKey = Env("R2_ACCESS_KEY");
var secretKey = Env("R2_SECRET_KEY");
var bucket = Env("R2_BUCKET");
var target = Env("TARGET_CONNECTION");

var container = new BlobContainerClient(azureConn, azureContainer);
var s3 = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
{
    ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
    ForcePathStyle = true,
    AuthenticationRegion = "auto"
});

// ---- 1. Copy blobs Azure -> R2 (skip ones already in R2) ----
int copied = 0, skipped = 0;
await foreach (var item in container.GetBlobsAsync())
{
    var key = item.Name;

    bool existsInR2 = true;
    try { await s3.GetObjectMetadataAsync(bucket, key); }
    catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound) { existsInR2 = false; }

    if (existsInR2) { skipped++; continue; }

    var blob = container.GetBlobClient(key);
    var download = await blob.DownloadContentAsync();
    using var ms = new MemoryStream(download.Value.Content.ToArray());
    await s3.PutObjectAsync(new PutObjectRequest
    {
        BucketName = bucket,
        Key = key,
        InputStream = ms,
        ContentType = download.Value.Details.ContentType,
        DisablePayloadSigning = true
    });
    copied++;
}
Console.WriteLine($"Blobs copied to R2: {copied}, skipped (already present): {skipped}");

// ---- 2. Rewrite DB values from absolute URL -> bare key (idempotent) ----
static async Task<int> RewriteAsync(NpgsqlConnection db, NpgsqlTransaction tx, string table, string col)
{
    // Strip everything up to and including the last '/', only for rows still holding a URL.
    var sql = $"UPDATE \"{table}\" SET \"{col}\" = regexp_replace(\"{col}\", '^.*/', '') " +
              $"WHERE \"{col}\" LIKE 'http%';";
    await using var cmd = new NpgsqlCommand(sql, db, tx);
    return await cmd.ExecuteNonQueryAsync();
}

await using var dst = new NpgsqlConnection(target);
await dst.OpenAsync();
await using (var tx = await dst.BeginTransactionAsync())
{
    int cardRows = await RewriteAsync(dst, tx, "Cards", "ImageKey");
    int deckRows = await RewriteAsync(dst, tx, "Decks", "CardBackImageKey");
    await tx.CommitAsync();
    Console.WriteLine($"DB rows rewritten to keys — Cards: {cardRows}, Decks: {deckRows}");
}

Console.WriteLine("Image migration complete.");
```

- [ ] **Step 3: Build the tool**

```bash
dotnet build tools/ImageMigrator/ImageMigrator.csproj
```

Expected: 0 errors. (Do NOT add this project to `FortuneCards.slnx`.)

- [ ] **Step 4: Commit**

```bash
git add tools/ImageMigrator/ImageMigrator.csproj tools/ImageMigrator/Program.cs
git commit -m "chore(tools): add one-off ImageMigrator for Azure Blob to R2 copy"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: docs describing R2 object storage + key-based image storage instead of Azure Blob.

- [ ] **Step 1: Update CLAUDE.md persistence description**

In `CLAUDE.md`, replace the image-storage sentence on line 57:

```
Runtime-uploaded images are stored in Azure Blob Storage via `Services/ImageStorage.cs` (`IImageStorage`); absolute blob URLs are persisted on `Card.ImageUrl`/`Deck.CardBackImageUrl` and served directly to the browser from a public-read container.
```

with:

```
Runtime-uploaded images are stored in Cloudflare R2 (S3-compatible) via `Services/R2ImageStorage.cs` (`IImageStorage`); object **keys** are persisted on `Card.ImageKey`/`Deck.CardBackImageKey`, and the server builds absolute public URLs (`{R2:PublicBaseUrl}/{key}`) when returning DTOs, which the browser reads directly.
```

- [ ] **Step 2: Update README.md**

Search README for image-storage references:

```bash
git grep -n -iE "blob|azure storage|object storage" README.md
```

Update any that describe the app's current image storage to say Cloudflare R2 object storage. Leave genuinely historical changelog entries as-is (note any you leave in your report).

- [ ] **Step 3: Verify no stale blob references remain in source**

```bash
git grep -n -iE "BlobImageStorage|BlobContainerClient|BlobStorage:|Azure.Storage.Blobs" -- FortuneCards.Server
```

Expected: no matches in `FortuneCards.Server` (the only remaining `Azure.Storage.Blobs` reference should be in `tools/ImageMigrator`, which is expected).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: describe Cloudflare R2 image storage instead of Azure Blob"
```

---

## Self-Review

**Spec coverage:**
- Storage service swap (R2ImageStorage, AWS S3 SDK, key return) → Task 1. ✓
- Config `R2:*` + fail-fast + Program.cs wiring → Task 1. ✓
- Entity rename to keys → Task 2 (Steps 1–2). ✓
- EF rename migration (RenameColumn, data-preserving) → Task 2 (Steps 6–7). ✓
- Key→URL construction in read path (projections + in-memory) → Task 2 (Steps 3–4). ✓
- Frontend unchanged (DTO field names preserved) → Task 2 keeps `CardDto.ImageUrl` / `DeckSummary.CardBackImageUrl` field names. ✓
- Existing-image migration tool (copy bytes + rewrite DB) → Task 3. ✓
- Docs → Task 4. ✓
- Cutover runbook (apply migration, run tool, smoke test, prod) → operational, out of code scope (design §5).

**Placeholder scan:** connection strings / R2 credentials are intentionally user-supplied (secrets). All code steps contain complete code.

**Type consistency:** `IImageStorage` gains `PublicBaseUrl` / `PublicUrl` in Task 1; Task 2 consumes them. Entity properties `ImageKey` / `CardBackImageKey` used consistently across models, DbContext, DeckService, CardService, and the migration. DTO record fields (`CardDto.ImageUrl`, `DeckSummary.CardBackImageUrl`, `DeckDetail.CardBackImageUrl`) are deliberately NOT renamed. The migrator's `regexp_replace('^.*/','')` yields the same bare key that `R2ImageStorage.SaveAsync` produces and that `PublicUrl` re-expands.
