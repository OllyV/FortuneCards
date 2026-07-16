# Blob Storage for Card Images — Design

**Date:** 2026-07-16
**Branch:** 13_BlobStorage

## Goal

Move runtime-uploaded card images off the server's local disk (`wwwroot/images/`) and into **Azure Blob Storage**. New uploads go straight to blob; the browser reads images directly from the public blob container. A temporary endpoint migrates existing local files into blob and rewrites their database URLs.

## Storage choice

- **Azure Blob Storage**, **Block blobs** — the default blob type, purpose-built for upload-once / read-many media. (Not Append blobs, which are for append-only logs; not Page blobs, which back VM disks.)
- **Storage account:** General-purpose v2 (`StorageV2`).
- **Access tier:** **Hot** — card images are read frequently; Hot gives low latency and no per-read retrieval fees (Cool/Cold/Archive add both).
- **Container:** a single container (`images` by default) configured for **public blob read access**. Card images are decorative and not sensitive, so anonymous read is acceptable and avoids SAS signing / URL expiry, keeping stored URLs permanent and clean.

## Configuration

Resolved the same way Application Insights already is in this project:

- **Dev:** `dotnet user-secrets set "BlobStorage:ConnectionString" "<value>"`. May point at a real storage account or the Azurite emulator (`UseDevelopmentStorage=true`).
- **Prod:** Azure App Service application setting for `BlobStorage:ConnectionString`.
- **Container name:** `BlobStorage:Container` (default `images`).

On startup the app creates the `BlobContainerClient` and ensures the container exists with public-blob access (`CreateIfNotExists(PublicAccessType.Blob)`).

With no connection string configured, container-client registration should fail fast at startup (image upload is a core feature — unlike telemetry, it should not silently no-op).

## Service: `ImageStorage` → injectable `IImageStorage`

Today `ImageStorage` is a **static** helper taking `IWebHostEnvironment` and writing to disk. It becomes an **injectable** service holding a `BlobContainerClient`, registered in `Program.cs`. This is cleaner for DI and lets both the domain services and the migration endpoint share one client.

```csharp
public interface IImageStorage
{
    Task<string> SaveAsync(IFormFile file);   // uploads a block blob, returns absolute URL
    Task DeleteAsync(string imageUrl);        // parses blob name from URL, deletes (no-op if absent)
}
```

- **`SaveAsync`** — blob name `{Guid}{ext}`; sets blob `ContentType` from `file.ContentType` so browsers render the image inline; uploads via the container client; returns the **absolute** URL, e.g. `https://{account}.blob.core.windows.net/images/{guid}.ext`.
- **`DeleteAsync`** — extracts the blob name from the stored URL (last path segment) and calls `DeleteIfExistsAsync`.

### Callers updated

- `DeckService.CreateAsync` — `cardBackImageUrl = await ImageStorage.SaveAsync(_env, x)` → `await _imageStorage.SaveAsync(x)`.
- `DeckService.UpdateAsync` — `ImageStorage.Delete(_env, old)` + `SaveAsync(_env, x)` → `await _imageStorage.DeleteAsync(old)` + `await _imageStorage.SaveAsync(x)`.
- `CardService.UpdateAsync` — `ImageStorage.Delete(_env, card.ImageUrl)` + `SaveAsync(_env, image)` → `await _imageStorage.DeleteAsync(...)` + `await _imageStorage.SaveAsync(...)`.
- Both services take `IImageStorage` via constructor injection (they already take `IWebHostEnvironment`; keep or drop `_env` depending on remaining use — drop if no longer referenced).
- `Delete` becomes **async** (`DeleteAsync`); update call sites to `await`.

## Serving

No serving code changes. The database stores absolute Azure URLs (`ImageUrl`, `CardBackImageUrl`); the Angular client fetches images directly from the public blob container. Nothing in the frontend changes.

`app.UseStaticFiles()` stays in place for now — the migration endpoint reads from `wwwroot/images/` on disk. Serving `/images/` as static files becomes unused for images once migration has rewritten all DB rows; it can be removed in a later cleanup.

## Temporary migration endpoint

A `MigrationController`:

- **Route:** `POST /api/admin/migrate-images`.
- **Gating:** mapped/allowed only when config flag `EnableImageMigration` is `true` (mirrors the existing `EnableApiDocs` gating pattern) **and** requires an authenticated user (`HttpContext.Items["UserId"]` present).
- **Behaviour:**
  1. Enumerate every file in `wwwroot/images/`.
  2. Upload each to blob under its existing filename, skipping any blob that already exists (with correct `ContentType` inferred from extension).
  3. Rewrite every `Card.ImageUrl` and `Deck.CardBackImageUrl` whose value starts with `/images/` to the corresponding absolute blob URL, then save.
- **Response:** JSON summary — files uploaded, files skipped, `Card` rows updated, `Deck` rows updated.
- **Lifecycle:** temporary. After it has run once per environment, disable the flag and/or delete the controller.

## Error handling

- Missing/invalid connection string → fail fast at startup with a clear message.
- `SaveAsync` propagates blob SDK exceptions to the caller (existing controller error handling applies).
- `DeleteAsync` is best-effort (`DeleteIfExistsAsync`); a missing blob is not an error.
- Migration endpoint is idempotent: re-running skips already-uploaded blobs and only rewrites rows still pointing at `/images/`.

## Testing / verification

No backend test project exists (per CLAUDE.md), so verification is:

- `dotnet build` — compiles cleanly after the static→injectable refactor.
- Manual run:
  - Upload a card image → lands in the blob container, renders in the UI via its Azure URL.
  - Update a card image → old blob deleted, new blob created.
  - With seeded local files and `EnableImageMigration=true`, `POST /api/admin/migrate-images` → files appear in blob, DB rows rewritten to absolute URLs, images still render.

## Out of scope

- SAS tokens / private container (chosen public access).
- Read-time blob→local fallback (replaced by the one-time migration endpoint).
- Removing `UseStaticFiles` / deleting local files (later cleanup, once migration is confirmed everywhere).
- CDN in front of the blob container.
