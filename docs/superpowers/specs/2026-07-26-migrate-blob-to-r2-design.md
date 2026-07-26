# Migration Design: Azure Blob Storage → Cloudflare R2

**Date:** 2026-07-26
**Branch:** `17_MigrateBlobToR2` (stacked on `16_MigrateDBToAvien`)
**Status:** Approved

## Goal

Move runtime-uploaded images (card images + deck card-backs) off **Azure Blob
Storage** onto **Cloudflare R2** (S3-compatible object storage), behind the
existing `IImageStorage` seam. Existing images are copied Azure → R2 and the
database is switched to storing **object keys** (not absolute URLs), so future
storage/domain changes are config-only. The frontend is unchanged.

## Context

- `IImageStorage` (`FortuneCards.Server/Services/ImageStorage.cs`) exposes
  `SaveAsync(IFormFile) → string` and `DeleteAsync(string)`. Only `DeckService`
  and `CardService` call it.
- `BlobImageStorage` uploads `{guid}{ext}` to Azure and returns an **absolute
  URL** persisted on `Card.ImageUrl` / `Deck.CardBackImageUrl`, served directly
  to the browser from a public-read container. Config: `BlobStorage:*`, wired in
  `Program.cs`.
- Read paths return DTOs built inside EF projections (`DeckSummary`,
  `DeckDetail`, `CardDto` — see `DeckService.GetPublicAsync`/`GetByIdAsync`),
  plus two in-memory DTO builds (`CreateAsync`, `AddCardAsync`).
- The Aiven database already holds **absolute Azure blob URLs** for the migrated
  decks/cards (~150 card images + a few card-backs), so existing images must be
  handled, not just new uploads.
- R2 is S3-compatible; buckets are private by default. Public read is exposed via
  an **r2.dev** subdomain (chosen for now) or a custom domain later.

## Decisions

| Decision | Choice |
|----------|--------|
| Target storage | Cloudflare R2 (S3 API via AWS SDK for .NET) |
| Existing images | Migrate (copy bytes Azure → R2) |
| Public access | r2.dev subdomain for now (custom domain later = config-only) |
| DB stores | Object **key** only; server builds URL at read time |
| Entity naming | Rename `ImageUrl → ImageKey`, `CardBackImageUrl → CardBackImageKey` (EF column-rename migration); DTO fields stay `imageUrl`/`cardBackImageUrl` (full URL) |
| Migration mechanism | Standalone one-off tool `tools/ImageMigrator/` |
| Environment scope | Single shared DB/storage; repoint dev + prod |

## Design

### 1. Storage service — `R2ImageStorage : IImageStorage`

Replace `BlobImageStorage` with `R2ImageStorage` using `AWSSDK.S3`:
- `AmazonS3Client` configured with `ServiceURL =
  https://<R2:AccountId>.r2.cloudflarestorage.com`, `ForcePathStyle = true`,
  region `auto`, credentials from `R2:AccessKey` / `R2:SecretKey`.
- `SaveAsync(IFormFile)` → key `{Guid}{ext}`; `PutObjectRequest` with
  `ContentType = file.ContentType` and `DisablePayloadSigning = true` (R2
  streaming-upload compatibility); **returns the key** (not a URL).
- `DeleteAsync(string keyOrUrl)` → `DeleteObjectAsync`; keeps the existing
  "last path segment" extraction so it tolerates a bare key or any legacy
  absolute URL (best-effort; missing object is not an error).

The interface signature is unchanged (`Task<string> SaveAsync`, `Task
DeleteAsync`); only the semantics change (returns/accepts a key).

### 2. Key-based storage + read path

- **Entity rename:** `Card.ImageKey` (was `ImageUrl`), `Deck.CardBackImageKey`
  (was `CardBackImageUrl`). One EF migration renames the columns (values
  unchanged by the rename; the migration tool rewrites values). `HasMaxLength`
  config stays (keys are short and fit the existing length).
- **URL construction:** a small helper builds `key → {R2:PublicBaseUrl}/{key}`
  (null/empty key → null). Applied in every DTO build:
  - EF projections (`GetPublicAsync`, `GetMineAsync`, `GetByIdAsync`) — the key
    field is projected and the base URL prepended (EF-translatable concat, or
    post-materialization mapping — the plan picks the cleanest per method).
  - In-memory builds (`CreateAsync`, `AddCardAsync`) — use the helper directly.
- **DTOs unchanged in shape:** fields stay named `imageUrl` /
  `cardBackImageUrl`, now carrying the full public URL. **Frontend unchanged.**

### 3. Configuration

New `R2:*`, resolved like `BlobStorage:*` today:
- `R2:AccountId`, `R2:AccessKey`, `R2:SecretKey`, `R2:Bucket`,
  `R2:PublicBaseUrl` (e.g. `https://pub-<hash>.r2.dev`).
- **Dev:** user-secrets. **Prod:** Azure App Service application settings.
- **Credentials never in committed files.**
- Fail-fast at startup on missing/invalid config (mirrors the current blob
  eager-validation): image upload is a core feature, not a silent no-op.
- `Program.cs`: remove the `BlobServiceClient` / `BlobContainerClient`
  registration and `BlobImageStorage`; register the R2 S3 client + singleton
  `R2ImageStorage`.

### 4. Existing-image migration tool (`tools/ImageMigrator/`)

Standalone console app (like `DbMigrator`), not added to the solution:
1. List every blob in the Azure `images` container (via `Azure.Storage.Blobs`).
2. Copy each to R2 under the **same key** with its `ContentType` (via
   `AWSSDK.S3`), skipping objects already present in R2 (`HeadObject` →
   idempotent).
3. Rewrite Aiven rows (via `Npgsql`): every `Card.ImageKey` /
   `Deck.CardBackImageKey` holding an absolute Azure URL → its bare key (last
   path segment). Idempotent: values already a bare key are left as-is.
- Reads connection info from env vars: `AZURE_BLOB_CONNECTION`, `R2_ACCOUNT_ID`
  / `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET`, `TARGET_CONNECTION` (Aiven).
- Prints per-step counts (blobs copied, blobs skipped, Card rows rewritten, Deck
  rows rewritten).

### 5. Cutover runbook (user's live steps)

1. **User:** create the R2 bucket; enable its r2.dev public URL; create an R2 API
   token (Access Key + Secret); note the account ID.
2. Set `R2:*` in dev user-secrets.
3. Apply the column-rename EF migration to Aiven (`dotnet ef database update`
   with `--connection`).
4. Run `ImageMigrator` (copies bytes Azure → R2 + rewrites DB values to keys).
5. **Local smoke test:** existing images render via r2.dev; upload lands in R2
   and renders; delete removes the object.
6. **Prod cutover:** set `R2:*` App Service settings, deploy this branch; keep
   Azure Blob as fallback until confident, decommission later.

### 6. Verification

- `dotnet build` clean (server + tool); no backend test project (per CLAUDE.md).
- R2 object count == Azure blob count after migration.
- App smoke test: existing images render; new upload → object in R2, renders via
  r2.dev URL; delete → object removed.
- Frontend untouched (DTOs still return absolute URLs).

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| R2 streaming upload signing quirk | `DisablePayloadSigning = true` on `PutObject`. |
| r2.dev rate limits / not-for-prod | Acceptable for now; custom domain later is a config-only change (keys, not URLs, stored). |
| Deploy-sequencing: key-based read path needs keys in DB + bytes in R2 first | Run the rename migration + `ImageMigrator` before the new code serves prod reads; keep Azure Blob as fallback. |
| Stale image URLs during transition | DTO builds keep robust null handling; `DeleteAsync` tolerates key or URL. |
| Column rename vs existing data | Rename preserves values; migrator rewrites values separately; both idempotent. |

## Out of scope / constraints

- Provisioning R2 and supplying secret credentials are the user's steps (cannot
  create cloud resources or handle secrets in code).
- No frontend changes; no auth/DB-schema changes beyond the column rename.
- Custom domain setup (deferred; r2.dev for now).
- Azure Blob decommissioning (deferred until prod verified on R2).
