# Azure SQL → Aiven PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the FortuneCards database from Azure SQL (SQL Server) to a managed PostgreSQL instance on Aiven.io, preserving all existing data, and repoint both dev and prod (which share one database) to the new instance.

**Architecture:** Swap the EF Core provider from SqlServer to Npgsql, regenerate the migrations for PostgreSQL, apply the schema to Aiven, then copy existing rows with a one-off standalone `.NET` console utility (raw ADO.NET reads from Azure SQL → Npgsql writes to Aiven, preserving primary-key IDs, forcing UTC timestamps, resetting identity sequences). Finally cut prod over via the App Service connection-string setting.

**Tech Stack:** ASP.NET Core 10, EF Core 9, `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.Data.SqlClient` + `Npgsql` (migrator tool), PostgreSQL on Aiven.io.

## Global Constraints

- Target engine is **PostgreSQL on Aiven** (Aiven does not offer SQL Server).
- Npgsql provider version must match EF Core 9.x → use `9.*`.
- Connection strings are **secrets**: dev via user-secrets, prod via Azure App Service app setting `ConnectionStrings__DefaultConnection`. **Never commit a connection string containing credentials.**
- Aiven requires TLS: connection string includes `SSL Mode=Require;Trust Server Certificate=true`.
- `DateTime` values written to Postgres `timestamp with time zone` must be `DateTimeKind.Utc`.
- The seeded system user (`Id = 1`) is created by the EF migration's `HasData` — it must NOT be copied again (PK collision).
- No backend test project exists — verify the backend with `dotnet build` and runtime smoke tests (per CLAUDE.md).
- EF migrations here: the VS Package Manager Console fails (esproj `ProjectReference`); use the `dotnet ef` CLI, and pass `--connection` explicitly for `database update` (the `DesignTimeDbContextFactory` does not read user-secrets).
- The `DbMigrator` tool is standalone (`tools/DbMigrator/`), NOT added to the solution and NOT referenced by the server; committed for reference only.

---

### Task 1: Swap EF Core provider from SqlServer to Npgsql

**Files:**
- Modify: `FortuneCards.Server/FortuneCards.Server.csproj:22`
- Modify: `FortuneCards.Server/Program.cs:11-14`
- Modify: `FortuneCards.Server/Data/DesignTimeDbContextFactory.cs:17`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a server project that compiles against the Npgsql provider; `UseNpgsql(...)` is now the configured provider for both runtime and design-time.

- [ ] **Step 1: Replace the SqlServer package with Npgsql in the csproj**

In `FortuneCards.Server/FortuneCards.Server.csproj`, replace this line:

```xml
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="9.*" />
```

with:

```xml
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="9.*" />
```

(Leave `Microsoft.EntityFrameworkCore.Design` and `Microsoft.EntityFrameworkCore.Tools` unchanged.)

- [ ] **Step 2: Switch the runtime provider in Program.cs**

In `FortuneCards.Server/Program.cs`, replace the `AddDbContext` registration:

```csharp
builder.Services.AddDbContext<FortuneCardsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorNumbersToAdd: null)));
```

with:

```csharp
builder.Services.AddDbContext<FortuneCardsDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        npgsql => npgsql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null)));
```

(Note: Npgsql's overload parameter is `errorCodesToAdd`, not `errorNumbersToAdd`.)

- [ ] **Step 3: Switch the design-time provider in DesignTimeDbContextFactory.cs**

In `FortuneCards.Server/Data/DesignTimeDbContextFactory.cs`, replace:

```csharp
            optionsBuilder.UseSqlServer(config.GetConnectionString("DefaultConnection"));
```

with:

```csharp
            optionsBuilder.UseNpgsql(config.GetConnectionString("DefaultConnection"));
```

- [ ] **Step 4: Restore and build**

Run:

```bash
dotnet build FortuneCards.Server/FortuneCards.Server.csproj
```

Expected: build succeeds. (The existing SQL-Server-flavored migration files still compile — their `SqlServer:*` annotations are plain strings — but they will be deleted in Task 2 before any `database update`.)

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/FortuneCards.Server.csproj FortuneCards.Server/Program.cs FortuneCards.Server/Data/DesignTimeDbContextFactory.cs
git commit -m "feat(server): switch EF Core provider from SqlServer to Npgsql"
```

---

### Task 2: Regenerate the EF migration for PostgreSQL

**Files:**
- Delete: `FortuneCards.Server/Migrations/*.cs` (all 5 migrations + `FortuneCardsDbContextModelSnapshot.cs`)
- Create: `FortuneCards.Server/Migrations/<timestamp>_InitialCreate.cs` (generated)
- Create: `FortuneCards.Server/Migrations/<timestamp>_InitialCreate.Designer.cs` (generated)
- Create: `FortuneCards.Server/Migrations/FortuneCardsDbContextModelSnapshot.cs` (generated)

**Interfaces:**
- Consumes: the Npgsql provider from Task 1.
- Produces: a single PostgreSQL `InitialCreate` migration that builds the whole schema (`Users`, `Decks`, `Cards`, `FavoriteDecks`) and seeds system user `Id = 1`.

- [ ] **Step 1: Delete the old SQL Server migrations**

```bash
git rm FortuneCards.Server/Migrations/20260603222540_InitialCreate.cs \
       FortuneCards.Server/Migrations/20260603222540_InitialCreate.Designer.cs \
       FortuneCards.Server/Migrations/20260604161701_AddDeckVisualFields.cs \
       FortuneCards.Server/Migrations/20260604161701_AddDeckVisualFields.Designer.cs \
       FortuneCards.Server/Migrations/20260701123400_AddUsersAndDeckOwnership.cs \
       FortuneCards.Server/Migrations/20260701123400_AddUsersAndDeckOwnership.Designer.cs \
       FortuneCards.Server/Migrations/20260718215517_AddDeckAspectRatio.cs \
       FortuneCards.Server/Migrations/20260718215517_AddDeckAspectRatio.Designer.cs \
       FortuneCards.Server/Migrations/20260721100559_AddFavoriteDecks.cs \
       FortuneCards.Server/Migrations/20260721100559_AddFavoriteDecks.Designer.cs \
       FortuneCards.Server/Migrations/FortuneCardsDbContextModelSnapshot.cs
```

- [ ] **Step 2: Generate a fresh InitialCreate migration for Postgres**

Run from the repo root:

```bash
dotnet ef migrations add InitialCreate --project FortuneCards.Server --startup-project FortuneCards.Server
```

Expected: succeeds and writes three files under `FortuneCards.Server/Migrations/`. Scaffolding does not open a DB connection, so the empty `DefaultConnection` in appsettings.json is fine.

- [ ] **Step 3: Verify the generated migration is PostgreSQL-flavored**

Open the new `<timestamp>_InitialCreate.cs` and confirm:
- Identity columns use `.Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn)` (NOT `SqlServer:Identity`).
- String columns are `character varying(N)` (NOT `nvarchar`).
- `CreatedAt` columns are `timestamp with time zone` (NOT `datetime2`).
- `IsPublic` is `boolean`.
- An `InsertData` call seeds `Users` with `Id = 1`, `GoogleId = "system"`, `Email = "system@fortunecards.app"`, `DisplayName = "FortuneCards"`.

Expected: all present. If any `SqlServer:*`/`nvarchar`/`datetime2` remains, the provider swap in Task 1 did not take effect — stop and fix Task 1.

- [ ] **Step 4: Build**

```bash
dotnet build FortuneCards.Server/FortuneCards.Server.csproj
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Migrations
git commit -m "feat(server): regenerate InitialCreate migration for PostgreSQL"
```

---

### Task 3: Apply the schema to the Aiven database

**Files:** none (runbook / environment task).

**Interfaces:**
- Consumes: the Postgres `InitialCreate` migration from Task 2; an Aiven connection string supplied by the user.
- Produces: an Aiven database containing all four tables, the `__EFMigrationsHistory` row for `InitialCreate`, and the seeded system user `Id = 1`.

**Precondition (user action):** The Aiven PostgreSQL service is provisioned and its connection string is stored in dev user-secrets:

```bash
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=<name>.aivencloud.com;Port=<port>;Database=defaultdb;Username=avnadmin;Password=<secret>;SSL Mode=Require;Trust Server Certificate=true" --project FortuneCards.Server
```

- [ ] **Step 1: Apply the migration to Aiven**

Run from the repo root (PowerShell) — reads the Aiven connection string from user-secrets and passes it explicitly (the design-time factory does not read user-secrets):

```powershell
$conn = (dotnet user-secrets list --project FortuneCards.Server |
         Where-Object { $_ -like 'ConnectionStrings:DefaultConnection = *' }) -replace '^ConnectionStrings:DefaultConnection = '
dotnet ef database update --project FortuneCards.Server --startup-project FortuneCards.Server --connection $conn
```

Expected: output ends with `Done.` and no error. If TLS fails, confirm `SSL Mode=Require;Trust Server Certificate=true` is in the connection string.

- [ ] **Step 2: Verify the schema and seed exist in Aiven**

Using any Postgres client (psql, Azure Data Studio with the PostgreSQL extension, or Aiven's console query editor), run:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT "Id", "GoogleId", "Email" FROM "Users";
```

Expected: tables `Cards`, `Decks`, `FavoriteDecks`, `Users`, `__EFMigrationsHistory` are listed; `Users` contains exactly one row with `Id = 1`, `GoogleId = 'system'`.

---

### Task 4: Build the one-off DbMigrator utility

**Files:**
- Create: `tools/DbMigrator/DbMigrator.csproj`
- Create: `tools/DbMigrator/Program.cs`

**Interfaces:**
- Consumes: two connection strings via environment variables — `SOURCE_CONNECTION` (Azure SQL) and `TARGET_CONNECTION` (Aiven Postgres).
- Produces: a runnable console app (`dotnet run --project tools/DbMigrator`) that copies `Users` (excluding `Id = 1`) → `Decks` → `Cards` → `FavoriteDecks`, preserving IDs, and resets identity sequences. Prints a per-table copied-row count.

- [ ] **Step 1: Create the project file**

Create `tools/DbMigrator/DbMigrator.csproj`:

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
    <PackageReference Include="Microsoft.Data.SqlClient" Version="6.*" />
    <PackageReference Include="Npgsql" Version="9.*" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Write the copy program**

Create `tools/DbMigrator/Program.cs`:

```csharp
using Microsoft.Data.SqlClient;
using Npgsql;
using NpgsqlTypes;

// One-off migration: Azure SQL -> Aiven PostgreSQL.
// Preserves primary-key IDs, forces UTC timestamps, resets identity sequences.
// Skips system user Id = 1 (already seeded by the EF InitialCreate migration).

var source = Environment.GetEnvironmentVariable("SOURCE_CONNECTION")
    ?? throw new InvalidOperationException("Set SOURCE_CONNECTION (Azure SQL) env var.");
var target = Environment.GetEnvironmentVariable("TARGET_CONNECTION")
    ?? throw new InvalidOperationException("Set TARGET_CONNECTION (Aiven Postgres) env var.");

static DateTime Utc(DateTime dt) => DateTime.SpecifyKind(dt, DateTimeKind.Utc);
static NpgsqlParameter P(string name, NpgsqlDbType type, object? value)
    => new(name, type) { Value = value ?? DBNull.Value };

await using var src = new SqlConnection(source);
await using var dst = new NpgsqlConnection(target);
await src.OpenAsync();
await dst.OpenAsync();

// ---- Users (skip system user Id = 1) ----
int users = 0;
await using (var read = new SqlCommand(
    "SELECT Id, GoogleId, Email, DisplayName, AvatarUrl, CreatedAt FROM Users WHERE Id <> 1", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Users\" (\"Id\",\"GoogleId\",\"Email\",\"DisplayName\",\"AvatarUrl\",\"CreatedAt\") " +
            "VALUES (@id,@g,@e,@d,@a,@c)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("g", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("e", NpgsqlDbType.Text, r.GetString(2)));
        ins.Parameters.Add(P("d", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("a", NpgsqlDbType.Text, r.IsDBNull(4) ? null : r.GetString(4)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(5))));
        await ins.ExecuteNonQueryAsync();
        users++;
    }
}
Console.WriteLine($"Users copied: {users}");

// ---- Decks ----
int decks = 0;
await using (var read = new SqlCommand(
    "SELECT Id, Name, Description, Emoji, ColorIndex, AspectWidth, AspectHeight, " +
    "CardBackImageUrl, CreatedAt, UserId, IsPublic FROM Decks", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Decks\" (\"Id\",\"Name\",\"Description\",\"Emoji\",\"ColorIndex\"," +
            "\"AspectWidth\",\"AspectHeight\",\"CardBackImageUrl\",\"CreatedAt\",\"UserId\",\"IsPublic\") " +
            "VALUES (@id,@n,@desc,@em,@ci,@aw,@ah,@cb,@c,@uid,@pub)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("n", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("desc", NpgsqlDbType.Text, r.IsDBNull(2) ? null : r.GetString(2)));
        ins.Parameters.Add(P("em", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("ci", NpgsqlDbType.Integer, r.GetInt32(4)));
        ins.Parameters.Add(P("aw", NpgsqlDbType.Integer, r.GetInt32(5)));
        ins.Parameters.Add(P("ah", NpgsqlDbType.Integer, r.GetInt32(6)));
        ins.Parameters.Add(P("cb", NpgsqlDbType.Text, r.IsDBNull(7) ? null : r.GetString(7)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(8))));
        ins.Parameters.Add(P("uid", NpgsqlDbType.Integer, r.IsDBNull(9) ? null : r.GetInt32(9)));
        ins.Parameters.Add(P("pub", NpgsqlDbType.Boolean, r.GetBoolean(10)));
        await ins.ExecuteNonQueryAsync();
        decks++;
    }
}
Console.WriteLine($"Decks copied: {decks}");

// ---- Cards ----
int cards = 0;
await using (var read = new SqlCommand(
    "SELECT Id, Title, Description, ImageUrl, CreatedAt, DeckId FROM Cards", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Cards\" (\"Id\",\"Title\",\"Description\",\"ImageUrl\",\"CreatedAt\",\"DeckId\") " +
            "VALUES (@id,@t,@desc,@img,@c,@did)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("t", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("desc", NpgsqlDbType.Text, r.GetString(2)));
        ins.Parameters.Add(P("img", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(4))));
        ins.Parameters.Add(P("did", NpgsqlDbType.Integer, r.GetInt32(5)));
        await ins.ExecuteNonQueryAsync();
        cards++;
    }
}
Console.WriteLine($"Cards copied: {cards}");

// ---- FavoriteDecks (composite key, no identity) ----
int favs = 0;
await using (var read = new SqlCommand(
    "SELECT UserId, DeckId, CreatedAt FROM FavoriteDecks", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"FavoriteDecks\" (\"UserId\",\"DeckId\",\"CreatedAt\") VALUES (@u,@d,@c)", dst);
        ins.Parameters.Add(P("u", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("d", NpgsqlDbType.Integer, r.GetInt32(1)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(2))));
        await ins.ExecuteNonQueryAsync();
        favs++;
    }
}
Console.WriteLine($"FavoriteDecks copied: {favs}");

// ---- Reset identity sequences so future inserts don't collide with copied IDs ----
await using (var reset = new NpgsqlCommand(
    "SELECT setval(pg_get_serial_sequence('\"Users\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Users\"), 1), (SELECT COUNT(*) FROM \"Users\") > 0);" +
    "SELECT setval(pg_get_serial_sequence('\"Decks\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Decks\"), 1), (SELECT COUNT(*) FROM \"Decks\") > 0);" +
    "SELECT setval(pg_get_serial_sequence('\"Cards\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Cards\"), 1), (SELECT COUNT(*) FROM \"Cards\") > 0);", dst))
{
    await reset.ExecuteNonQueryAsync();
}
Console.WriteLine("Identity sequences reset. Migration complete.");
```

- [ ] **Step 3: Build the tool**

```bash
dotnet build tools/DbMigrator/DbMigrator.csproj
```

Expected: build succeeds. (Do NOT add this project to `FortuneCards.sln`.)

- [ ] **Step 4: Commit**

```bash
git add tools/DbMigrator/DbMigrator.csproj tools/DbMigrator/Program.cs
git commit -m "chore(tools): add one-off DbMigrator for Azure SQL to Aiven data copy"
```

---

### Task 5: Run the data copy and verify

**Files:** none (runbook task).

**Interfaces:**
- Consumes: the built `DbMigrator` (Task 4), the applied Aiven schema (Task 3), the source Azure SQL connection string (user-supplied).
- Produces: an Aiven database populated with all source data; verified equal row counts.

- [ ] **Step 1: Capture source row counts (baseline)**

Against **Azure SQL** (Azure Data Studio / SSMS), run:

```sql
SELECT 'Users' t, COUNT(*) n FROM Users
UNION ALL SELECT 'Decks', COUNT(*) FROM Decks
UNION ALL SELECT 'Cards', COUNT(*) FROM Cards
UNION ALL SELECT 'FavoriteDecks', COUNT(*) FROM FavoriteDecks;
```

Record the four numbers. (Note: `Users` includes the system user `Id = 1`.)

- [ ] **Step 2: Set the two connection strings and run the migrator**

From the repo root (PowerShell). Replace the placeholders with the real connection strings:

```powershell
$env:SOURCE_CONNECTION = "<Azure SQL connection string>"
$env:TARGET_CONNECTION = "<Aiven Postgres connection string>"
dotnet run --project tools/DbMigrator
```

Expected: prints `Users copied: N`, `Decks copied: N`, `Cards copied: N`, `FavoriteDecks copied: N`, then `Identity sequences reset. Migration complete.` with no exception.

- [ ] **Step 3: Verify target row counts match source**

Against **Aiven Postgres**, run:

```sql
SELECT 'Users' t, COUNT(*) n FROM "Users"
UNION ALL SELECT 'Decks', COUNT(*) FROM "Decks"
UNION ALL SELECT 'Cards', COUNT(*) FROM "Cards"
UNION ALL SELECT 'FavoriteDecks', COUNT(*) FROM "FavoriteDecks";
```

Expected: `Decks`, `Cards`, `FavoriteDecks` counts equal the Step 1 baseline exactly; `Users` equals the baseline (the copied users plus the pre-seeded `Id = 1` equal the source total, since `Id = 1` existed in the source and was skipped on copy).

- [ ] **Step 4: Verify the identity sequence is safe**

Against **Aiven Postgres**:

```sql
SELECT nextval(pg_get_serial_sequence('"Decks"','Id'));
```

Expected: a value strictly greater than `MAX("Id")` in `Decks` (i.e. no collision for the next insert). (This consumes one sequence value — harmless.)

- [ ] **Step 5: Local smoke test against Aiven**

Ensure dev user-secrets `DefaultConnection` points at Aiven (set in Task 3), then run the app:

```bash
dotnet run --project FortuneCards.Server
```

In the browser, confirm: decks list loads, opening a deck shows its cards with images, and favoriting/unfavoriting a deck works. Stop the app when done.

Expected: all work with no server errors in the console.

---

### Task 6: Production cutover

**Files:** none (Azure environment task, user-driven).

**Interfaces:**
- Consumes: the verified, populated Aiven database (Task 5).
- Produces: the production App Service serving requests from Aiven.

- [ ] **Step 1: Point production at Aiven**

In the Azure Portal (App Service → Configuration → Connection strings / Application settings), set:

- Name: `ConnectionStrings__DefaultConnection`
- Value: the Aiven Postgres connection string (`Host=...;...;SSL Mode=Require;Trust Server Certificate=true`)

Save. (Do this in a low-traffic window — since dev and prod share one database, this is the moment prod stops using Azure SQL and starts using Aiven.)

- [ ] **Step 2: Restart and verify prod**

Restart the App Service. Once up, load the production site and confirm decks/cards/favorites load correctly and no 500s appear in the App Service log stream.

Expected: production runs against Aiven with parity to the pre-cutover behavior.

- [ ] **Step 3: Leave Azure SQL running (decommission later)**

Do NOT delete the Azure SQL database yet — keep it as a fallback until prod has run cleanly against Aiven for a while. Decommissioning is a separate, later decision.

---

### Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md` (the domain/persistence description)
- Modify: `README.md` (any SQL Server references)

**Interfaces:**
- Consumes: nothing.
- Produces: docs that describe PostgreSQL/Aiven instead of SQL Server.

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, change the persistence description from SQL Server to PostgreSQL. Replace:

```
persisted with EF Core (`FortuneCardsDbContext`, SQL Server).
```

with:

```
persisted with EF Core (`FortuneCardsDbContext`, PostgreSQL on Aiven via the Npgsql provider).
```

- [ ] **Step 2: Update README.md**

Search `README.md` for "SQL Server" / "SqlServer" / "Azure SQL" and update those references to describe PostgreSQL on Aiven. Run:

```bash
git grep -n -iE "sql server|sqlserver|azure sql" README.md
```

Edit each hit to reflect PostgreSQL/Aiven. If none remain relevant, leave the file otherwise unchanged.

- [ ] **Step 3: Verify no stale provider references remain in code/docs**

```bash
git grep -n -iE "UseSqlServer|Microsoft.EntityFrameworkCore.SqlServer"
```

Expected: no matches (the migrator uses `Microsoft.Data.SqlClient`, which is a different, expected reference and won't match this pattern).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: describe PostgreSQL/Aiven persistence instead of SQL Server"
```

---

## Self-Review

**Spec coverage:**
- Provider & config swap → Task 1. ✓
- Migration regeneration → Task 2. ✓
- Timestamp (UTC) handling → Task 4 (`Utc()` helper, `TimestampTz` params). ✓
- Data-copy utility (skip user 1, preserve IDs, FK order, sequence reset) → Task 4. ✓
- Apply schema to Aiven → Task 3. ✓
- Run copy + verify (row counts) → Task 5. ✓
- Prod cutover (App Service setting) → Task 6. ✓
- SSL config → Global Constraints + Tasks 3/6 connection strings. ✓
- Decommission deferred → Task 6 Step 3. ✓
- Docs update (not explicit in spec, but keeps repo truthful) → Task 7.

**Placeholder scan:** connection strings and Azure credentials are intentionally user-supplied placeholders (secrets — must not be committed); all code steps contain complete code.

**Type consistency:** `SOURCE_CONNECTION`/`TARGET_CONNECTION` env var names, the `Utc()` and `P(...)` helpers, and the four table/column lists are used consistently across Tasks 4–5. Sequence-reset table names (`Users`, `Decks`, `Cards`) match the identity tables; `FavoriteDecks` correctly excluded (composite key).
