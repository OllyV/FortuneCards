# Migration Design: Azure SQL → Aiven PostgreSQL

**Date:** 2026-07-26
**Branch:** `16_MigrateDBToAvien`
**Status:** Approved

## Goal

Migrate the FortuneCards database from **Azure SQL (SQL Server)** to a managed
**PostgreSQL** instance on **Aiven.io**, preserving all existing data. A single
database is shared by both local dev and production, so both environments are
repointed to the same new Aiven instance after a one-time data copy.

## Context

- Current provider: `Microsoft.EntityFrameworkCore.SqlServer` 9.x, configured in
  `FortuneCards.Server/Program.cs` (`UseSqlServer`) and
  `FortuneCards.Server/Data/DesignTimeDbContextFactory.cs`.
- Aiven does **not** offer SQL Server — migrating to Aiven means switching the
  database engine (to PostgreSQL), swapping the EF Core provider, and
  regenerating migrations (SQL Server migrations cannot run on Postgres).
- Entities: `User`, `Deck`, `Card`, `FavoriteDeck` (see
  `FortuneCards.Server/Models/`). All four have a `CreatedAt` (`DateTime`) column.
- The services (`DeckService`, `CardService`, `AuthService`) use pure EF Core
  LINQ — **no raw SQL** — so application code changes are minimal.
- Data volume is small (a few hundred rows at most); the Azure SQL connection
  string is available for export.

## Decisions

| Decision | Choice |
|----------|--------|
| Target engine | PostgreSQL on Aiven |
| Existing data | Migrate (preserve all rows) |
| Environment scope | Single shared DB; repoint both dev and prod to Aiven |
| Data-copy method | One-off `.NET` utility |
| SSL | `SSL Mode=Require;Trust Server Certificate=true` (CA cert optional/stricter) |
| DbMigrator location | `tools/DbMigrator/`, committed for reference, excluded from server build |

## Design

### 1. Provider & configuration swap

- `FortuneCards.Server.csproj`: remove `Microsoft.EntityFrameworkCore.SqlServer`,
  add `Npgsql.EntityFrameworkCore.PostgreSQL` (9.x, matching EF Core 9).
- `Program.cs`: `UseSqlServer(...)` → `UseNpgsql(...)`, keeping
  `EnableRetryOnFailure(...)` (Npgsql supports it).
- `DesignTimeDbContextFactory.cs`: `UseSqlServer(...)` → `UseNpgsql(...)`.
- Connection string (Aiven Postgres format, TLS required):
  `Host=<name>.aivencloud.com;Port=<port>;Database=defaultdb;Username=avnadmin;Password=<secret>;SSL Mode=Require;Trust Server Certificate=true`
  - **Dev:** `dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<value>"`
  - **Prod:** Azure App Service application setting `ConnectionStrings__DefaultConnection`
  - **Credentials never go in committed files.**

### 2. Migration regeneration

SQL Server migrations cannot run on Postgres. Delete the existing 5 migrations +
`FortuneCardsDbContextModelSnapshot.cs`, then generate one fresh `InitialCreate`
for Npgsql. The entity model is unchanged, so the resulting schema is equivalent;
the seeded system user (id=1) is re-emitted via `HasData`.

**Trade-off:** granular migration history is lost. Acceptable for a one-time
cutover to a brand-new database.

### 3. Timestamp handling

Npgsql maps `DateTime` → `timestamp with time zone` (timestamptz) and requires
UTC values. The app already writes `DateTime.UtcNow`, so runtime is correct. The
copy utility must stamp `DateTimeKind.Utc` on values read from SQL Server (they
return as `Unspecified`). No legacy timestamp compatibility switch is used — the
modern `timestamptz` behavior is kept.

### 4. Data-copy utility (`tools/DbMigrator/`)

A standalone console app, **not** part of the server build or deployment, kept in
the repo for reference. Steps:

1. Read each table from Azure SQL via EF Core (SqlServer provider) — typed/safe.
2. Write to Aiven Postgres via Npgsql raw `INSERT ... OVERRIDING SYSTEM VALUE`,
   **preserving primary-key IDs**, in FK-dependency order:
   **Users → Decks → Cards → FavoriteDecks**.
3. **Skip user id=1** (the system user already seeded by the migration — avoids a
   PK collision; public/system decks keep referencing it).
4. Force `CreatedAt` values to `DateTimeKind.Utc`.
5. Reset identity sequences afterward
   (`setval(pg_get_serial_sequence('"Table"','Id'), MAX("Id"))`) for
   Users/Decks/Cards so future inserts do not collide. `FavoriteDeck` has a
   composite PK and no sequence.

Both providers (SqlServer + Npgsql) are referenced **only** by this tool project.

### 5. Cutover runbook

1. **User:** provision the Aiven PostgreSQL service; collect connection details
   (+ CA cert if strict validation is wanted).
2. Swap packages/provider; `dotnet build`.
3. Set dev connection string in user-secrets.
4. Regenerate migrations; `dotnet ef database update` → creates schema + seed in
   Aiven.
5. Run `DbMigrator` to copy data.
6. **Verify locally:** per-table row counts match; app runs; decks/cards/
   favorites/images load.
7. **Prod cutover:** set the App Service `ConnectionStrings__DefaultConnection` to
   Aiven, restart. Brief window — copy is fast; pick a quiet moment.
8. Verify prod; decommission Azure SQL later once confident.

### 6. Verification

- `dotnet build` clean (no backend test project exists).
- App boots against Aiven Postgres.
- Per-table row counts match source (Users/Decks/Cards/FavoriteDecks).
- Manual smoke test: browse decks, open cards, toggle favorites, confirm images
  load (blob URLs are absolute and ID-independent, so unaffected).
- Frontend is untouched (no DB coupling); optionally run `ng test --watch=false`.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Aiven TLS handshake fails | Use `SSL Mode=Require;Trust Server Certificate=true`; escalate to CA cert (`Root Certificate=`) if needed. |
| `DateTime` kind mismatch (Npgsql throws on non-UTC) | Copy utility forces `DateTimeKind.Utc`. |
| Seeded system user (id=1) PK collision | Skip id=1 during copy. |
| Identity sequences out of sync after explicit-ID inserts | `setval` reset per table after copy. |
| Prod cutover window (shared DB) | Copy is fast; perform during low traffic; Azure SQL remains source of truth until cutover completes. |

## Out of scope / constraints

- Provisioning the Aiven service and supplying secret connection values are the
  user's steps (cannot create cloud resources or handle secrets in code).
- No changes to frontend, blob storage, auth, or Application Insights.
- Azure SQL decommissioning is deferred until after prod is verified.
