# Auth & User Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth login, JWT httpOnly cookies, user-owned deck visibility, and a user profile cabinet to FortuneCards.

**Architecture:** Custom thin auth layer — no ASP.NET Core Identity. A `JwtMiddleware` reads a `fortune_auth` httpOnly cookie and sets `HttpContext.Items["UserId"]` on every request. `AuthController` handles the Google OAuth2 authorization code flow. Angular's `AuthService` holds a `currentUser` signal populated via `APP_INITIALIZER` from `GET /api/auth/me`.

**Tech Stack:** `Google.Apis.Auth` (ID token validation), `System.IdentityModel.Tokens.Jwt` (JWT generation/validation), Angular signals + `APP_INITIALIZER`, Angular functional route guards.

---

## File Map

**Backend — new files:**
- `FortuneCards.Server/Models/User.cs`
- `FortuneCards.Server/Services/IAuthService.cs`
- `FortuneCards.Server/Services/AuthService.cs`
- `FortuneCards.Server/Middleware/JwtMiddleware.cs`
- `FortuneCards.Server/Controllers/AuthController.cs`

**Backend — modified files:**
- `FortuneCards.Server/Data/FortuneCardsDbContext.cs` — add `Users` DbSet, configure entity, seed system user
- `FortuneCards.Server/Models/Deck.cs` — add `UserId`, `IsPublic`, `User` nav property
- `FortuneCards.Server/Services/IDeckService.cs` — update `DeckSummary`/`DeckDetail` DTOs, update method signatures
- `FortuneCards.Server/Services/DeckService.cs` — update all methods for auth + visibility
- `FortuneCards.Server/Services/ICardService.cs` — add `userId` param to `DeleteAsync`
- `FortuneCards.Server/Services/CardService.cs` — check deck ownership on delete
- `FortuneCards.Server/Controllers/DecksController.cs` — read `UserId` from context, add visibility endpoint
- `FortuneCards.Server/Controllers/CardsController.cs` — read `UserId` from context
- `FortuneCards.Server/Program.cs` — register `IAuthService`, add `JwtMiddleware`, update CORS

**Frontend — new files:**
- `fortunecards.client/src/app/models/user.ts`
- `fortunecards.client/src/app/services/auth.service.ts`
- `fortunecards.client/src/app/services/auth.service.spec.ts`
- `fortunecards.client/src/app/guards/auth.guard.ts`
- `fortunecards.client/src/app/guards/auth.guard.spec.ts`
- `fortunecards.client/src/app/components/profile/profile.component.ts`
- `fortunecards.client/src/app/components/profile/profile.component.html`
- `fortunecards.client/src/app/components/profile/profile.component.css`
- `fortunecards.client/src/app/components/account-settings/account-settings.component.ts`
- `fortunecards.client/src/app/components/account-settings/account-settings.component.html`
- `fortunecards.client/src/app/components/account-settings/account-settings.component.css`

**Frontend — modified files:**
- `fortunecards.client/src/app/models/deck.ts` — add `isPublic`, `isOwner`
- `fortunecards.client/src/app/services/deck.service.ts` — add `toggleVisibility`
- `fortunecards.client/src/app/components/navigation-bar/navigation-bar.ts` — inject `AuthService`
- `fortunecards.client/src/app/components/navigation-bar/navigation-bar.html` — auth-aware navbar
- `fortunecards.client/src/app/components/deck-list/deck-list.component.ts` — inject `AuthService`, owner controls
- `fortunecards.client/src/app/components/deck-list/deck-list.component.html` — visibility badge + owner buttons
- `fortunecards.client/src/app/app-routing-module.ts` — add `/profile`, `/profile/settings` with `authGuard`
- `fortunecards.client/src/app/app-module.ts` — declare new components, add `APP_INITIALIZER`

---

## Task 1: Install NuGet packages

**Files:**
- Modify: `FortuneCards.Server/FortuneCards.Server.csproj`

- [ ] **Step 1: Add packages**

Run from the repo root:
```powershell
dotnet add FortuneCards.Server package Google.Apis.Auth
dotnet add FortuneCards.Server package System.IdentityModel.Tokens.Jwt
```

- [ ] **Step 2: Verify packages restore**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded with 0 errors.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/FortuneCards.Server.csproj
git commit -m "chore: add Google.Apis.Auth and JWT packages"
```

---

## Task 2: Create User model + update DbContext

**Files:**
- Create: `FortuneCards.Server/Models/User.cs`
- Modify: `FortuneCards.Server/Models/Deck.cs`
- Modify: `FortuneCards.Server/Data/FortuneCardsDbContext.cs`

- [ ] **Step 1: Create `Models/User.cs`**

```csharp
namespace FortuneCards.Server.Models
{
    public class User
    {
        public int Id { get; set; }
        public string GoogleId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<Deck> Decks { get; set; } = [];
    }
}
```

- [ ] **Step 2: Add `UserId` and `IsPublic` to `Models/Deck.cs`**

Open `FortuneCards.Server/Models/Deck.cs` and add these two properties before the `Cards` navigation property (exact position within the class doesn't matter):
```csharp
public int? UserId { get; set; }
public bool IsPublic { get; set; } = false;
public User? User { get; set; }
```

- [ ] **Step 3: Update `Data/FortuneCardsDbContext.cs`**

Replace the entire file with:
```csharp
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Data
{
    public class FortuneCardsDbContext : DbContext
    {
        public FortuneCardsDbContext(DbContextOptions<FortuneCardsDbContext> options) : base(options) { }

        public DbSet<Deck> Decks => Set<Deck>();
        public DbSet<Card> Cards => Set<Card>();
        public DbSet<User> Users => Set<User>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(e =>
            {
                e.Property(u => u.GoogleId).HasMaxLength(100).IsRequired();
                e.HasIndex(u => u.GoogleId).IsUnique();
                e.Property(u => u.Email).HasMaxLength(200).IsRequired();
                e.Property(u => u.DisplayName).HasMaxLength(100).IsRequired();
                e.Property(u => u.AvatarUrl).HasMaxLength(500);
                e.HasData(new User
                {
                    Id = 1,
                    GoogleId = "system",
                    Email = "system@fortunecards.app",
                    DisplayName = "FortuneCards",
                    AvatarUrl = null,
                    CreatedAt = new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc)
                });
            });

            modelBuilder.Entity<Deck>(e =>
            {
                e.Property(d => d.Name).HasMaxLength(200).IsRequired();
                e.Property(d => d.Description).HasMaxLength(1000);
                e.Property(d => d.Emoji).HasMaxLength(10).HasDefaultValue("🎴");
                e.Property(d => d.ColorIndex).HasDefaultValue(0);
                e.Property(d => d.CardBackImageUrl).HasMaxLength(500);
                e.Property(d => d.IsPublic).HasDefaultValue(true);
                e.HasOne(d => d.User)
                 .WithMany(u => u.Decks)
                 .HasForeignKey(d => d.UserId)
                 .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<Card>(e =>
            {
                e.Property(c => c.Title).HasMaxLength(200).IsRequired();
                e.Property(c => c.Description).HasMaxLength(2000).IsRequired();
                e.Property(c => c.ImageUrl).HasMaxLength(500).IsRequired();
                e.HasOne(c => c.Deck)
                 .WithMany(d => d.Cards)
                 .HasForeignKey(c => c.DeckId)
                 .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
```

- [ ] **Step 4: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```powershell
git add FortuneCards.Server/Models/User.cs FortuneCards.Server/Models/Deck.cs FortuneCards.Server/Data/FortuneCardsDbContext.cs
git commit -m "feat: add User model and update Deck with ownership + visibility"
```

---

## Task 3: Create EF migration and run it

**Files:**
- Create: `FortuneCards.Server/Migrations/<timestamp>_AddUsersAndDeckOwnership.cs` (auto-generated)

- [ ] **Step 1: Create migration**

```powershell
dotnet ef migrations add AddUsersAndDeckOwnership --project FortuneCards.Server
```
Expected: A new migration file appears in `FortuneCards.Server/Migrations/`.

- [ ] **Step 2: Open the generated migration and add backfill SQL**

Find the `Up` method in the newly created migration file. After the `AddColumn` calls for `UserId` and `IsPublic`, add a `migrationBuilder.Sql()` call to assign all existing decks to the system user and make them public:

```csharp
// After the AddColumn calls, before closing brace of Up():
migrationBuilder.Sql("UPDATE Decks SET UserId = 1, IsPublic = 1 WHERE UserId IS NULL");
```

- [ ] **Step 3: Apply the migration**

```powershell
dotnet ef database update --project FortuneCards.Server
```
Expected: `Done. Applied migration '..._AddUsersAndDeckOwnership'`.

- [ ] **Step 4: Commit**

```powershell
git add FortuneCards.Server/Migrations/
git commit -m "feat: migrate Users table + deck ownership + backfill existing decks to system user"
```

---

## Task 4: Create IAuthService + AuthService

**Files:**
- Create: `FortuneCards.Server/Services/IAuthService.cs`
- Create: `FortuneCards.Server/Services/AuthService.cs`

- [ ] **Step 1: Create `Services/IAuthService.cs`**

```csharp
using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public interface IAuthService
    {
        string GenerateJwt(User user);
        int? ValidateJwt(string token);
        Task<User> UpsertUserAsync(string googleId, string email, string displayName, string? avatarUrl);
    }
}
```

- [ ] **Step 2: Create `Services/AuthService.cs`**

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace FortuneCards.Server.Services
{
    public class AuthService : IAuthService
    {
        private readonly FortuneCardsDbContext _db;
        private readonly string _jwtSecret;

        public AuthService(FortuneCardsDbContext db, IConfiguration configuration)
        {
            _db = db;
            _jwtSecret = configuration["Jwt:Secret"]
                ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        }

        public string GenerateJwt(User user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var claims = new[]
            {
                new Claim("userId", user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("displayName", user.DisplayName)
            };
            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds);
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public int? ValidateJwt(string token)
        {
            try
            {
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
                var handler = new JwtSecurityTokenHandler();
                handler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = key,
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ClockSkew = TimeSpan.Zero
                }, out var validatedToken);
                var jwt = (JwtSecurityToken)validatedToken;
                return int.Parse(jwt.Claims.First(c => c.Type == "userId").Value);
            }
            catch
            {
                return null;
            }
        }

        public async Task<User> UpsertUserAsync(string googleId, string email, string displayName, string? avatarUrl)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId);
            if (user is null)
            {
                user = new User
                {
                    GoogleId = googleId,
                    Email = email,
                    DisplayName = displayName,
                    AvatarUrl = avatarUrl
                };
                _db.Users.Add(user);
            }
            else
            {
                user.Email = email;
                user.DisplayName = displayName;
                user.AvatarUrl = avatarUrl;
            }
            await _db.SaveChangesAsync();
            return user;
        }
    }
}
```

- [ ] **Step 3: Set up User Secrets for local development**

```powershell
dotnet user-secrets set "Google:ClientId" "PASTE_YOUR_GOOGLE_CLIENT_ID" --project FortuneCards.Server
dotnet user-secrets set "Google:ClientSecret" "PASTE_YOUR_GOOGLE_CLIENT_SECRET" --project FortuneCards.Server
dotnet user-secrets set "Google:RedirectUri" "https://localhost:51313/api/auth/google/callback" --project FortuneCards.Server
dotnet user-secrets set "Jwt:Secret" "fortune-cards-jwt-secret-min-32-chars-long!!" --project FortuneCards.Server
```

> **How to get Google credentials:** Go to https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID (type: Web application). Add `https://localhost:51313/api/auth/google/callback` as an Authorized redirect URI.

- [ ] **Step 4: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```powershell
git add FortuneCards.Server/Services/IAuthService.cs FortuneCards.Server/Services/AuthService.cs
git commit -m "feat: add IAuthService and AuthService with JWT generation and user upsert"
```

---

## Task 5: Create JwtMiddleware

**Files:**
- Create: `FortuneCards.Server/Middleware/JwtMiddleware.cs`

- [ ] **Step 1: Create the `Middleware/` directory and `JwtMiddleware.cs`**

```csharp
namespace FortuneCards.Server.Middleware
{
    public class JwtMiddleware
    {
        private readonly RequestDelegate _next;

        public JwtMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task Invoke(HttpContext context, Services.IAuthService authService)
        {
            if (context.Request.Cookies.TryGetValue("fortune_auth", out var token))
            {
                var userId = authService.ValidateJwt(token);
                if (userId.HasValue)
                    context.Items["UserId"] = userId.Value;
            }
            await _next(context);
        }
    }
}
```

- [ ] **Step 2: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Middleware/JwtMiddleware.cs
git commit -m "feat: add JwtMiddleware to read fortune_auth cookie and set UserId on context"
```

---

## Task 6: Create AuthController

**Files:**
- Create: `FortuneCards.Server/Controllers/AuthController.cs`

- [ ] **Step 1: Create `Controllers/AuthController.cs`**

```csharp
using System.Text.Json;
using FortuneCards.Server.Services;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _auth;
        private readonly IConfiguration _config;
        private readonly HttpClient _httpClient;

        public AuthController(IAuthService auth, IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _auth = auth;
            _config = config;
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpGet("google/login")]
        public IActionResult GoogleLogin()
        {
            var clientId = _config["Google:ClientId"]!;
            var redirectUri = _config["Google:RedirectUri"]!;
            var url = "https://accounts.google.com/o/oauth2/v2/auth" +
                      $"?client_id={Uri.EscapeDataString(clientId)}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      "&response_type=code" +
                      "&scope=openid%20email%20profile" +
                      "&access_type=online";
            return Redirect(url);
        }

        [HttpGet("google/callback")]
        public async Task<IActionResult> GoogleCallback([FromQuery] string? code, [FromQuery] string? error)
        {
            if (error != null || code == null)
                return Redirect("/?auth=error");

            string idToken;
            try
            {
                idToken = await ExchangeCodeForIdToken(code);
            }
            catch
            {
                return Redirect("/?auth=error");
            }

            GoogleJsonWebSignature.Payload payload;
            try
            {
                payload = await GoogleJsonWebSignature.ValidateAsync(idToken);
            }
            catch
            {
                return Redirect("/?auth=error");
            }

            var user = await _auth.UpsertUserAsync(
                payload.Subject,
                payload.Email,
                payload.Name ?? payload.Email,
                payload.Picture);

            var jwt = _auth.GenerateJwt(user);
            Response.Cookies.Append("fortune_auth", jwt, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            });

            return Redirect("/");
        }

        [HttpGet("me")]
        public async Task<IActionResult> Me([FromServices] Data.FortuneCardsDbContext db)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            var user = await db.Users.FindAsync(userId);
            if (user is null) return Unauthorized();

            return Ok(new { id = user.Id, email = user.Email, displayName = user.DisplayName, avatarUrl = user.AvatarUrl });
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            Response.Cookies.Delete("fortune_auth");
            return Ok();
        }

        [HttpDelete("account")]
        public async Task<IActionResult> DeleteAccount([FromServices] Data.FortuneCardsDbContext db)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            // Transfer public decks to system user (id=1)
            var publicDecks = db.Decks.Where(d => d.UserId == userId && d.IsPublic);
            await publicDecks.ForEachAsync(d => d.UserId = 1);

            // Delete private decks (cascade deletes their cards)
            var privateDecks = db.Decks.Where(d => d.UserId == userId && !d.IsPublic);
            db.Decks.RemoveRange(privateDecks);

            var user = await db.Users.FindAsync(userId);
            if (user != null) db.Users.Remove(user);

            await db.SaveChangesAsync();
            Response.Cookies.Delete("fortune_auth");
            return Ok();
        }

        private async Task<string> ExchangeCodeForIdToken(string code)
        {
            var response = await _httpClient.PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = _config["Google:ClientId"]!,
                    ["client_secret"] = _config["Google:ClientSecret"]!,
                    ["redirect_uri"] = _config["Google:RedirectUri"]!,
                    ["grant_type"] = "authorization_code"
                }));
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("id_token").GetString()!;
        }
    }
}
```

- [ ] **Step 2: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Controllers/AuthController.cs
git commit -m "feat: add AuthController with Google OAuth flow, /me, /logout, /account delete"
```

---

## Task 7: Update IDeckService DTOs and interface signatures

**Files:**
- Modify: `FortuneCards.Server/Services/IDeckService.cs`

- [ ] **Step 1: Replace `Services/IDeckService.cs`**

```csharp
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public record DeckSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner);

    public record DeckDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<CardDto> Cards,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner);

    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null);
        Task<DeckDetail?> GetByIdAsync(int id, int? userId = null);
        Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage, int userId);
        Task<bool> DeleteAsync(int id, int userId);
        Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId);
        Task<bool> ToggleVisibilityAsync(int deckId, bool isPublic, int userId);
    }
}
```

- [ ] **Step 2: Build (will fail — that's expected)**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build errors because `DeckService.cs` and `DecksController.cs` still use old signatures. These are fixed in Tasks 8 and 9.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Services/IDeckService.cs
git commit -m "feat: update DeckSummary/DeckDetail DTOs and IDeckService signatures for auth"
```

---

## Task 8: Update DeckService implementation

**Files:**
- Modify: `FortuneCards.Server/Services/DeckService.cs`

- [ ] **Step 1: Replace `Services/DeckService.cs`**

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

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage, int userId)
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
                CardBackImageUrl = cardBackImageUrl,
                UserId = userId,
                IsPublic = false
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl, false, true);
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null || deck.UserId != userId) return false;

            if (deck.CardBackImageUrl is not null)
                DeleteImage(deck.CardBackImageUrl);

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

        public async Task<bool> ToggleVisibilityAsync(int deckId, bool isPublic, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return false;
            deck.IsPublic = isPublic;
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));
            return true;
        }

        private void DeleteImage(string imageUrl)
        {
            var fileName = Path.GetFileName(imageUrl);
            var path = Path.Combine(_env.WebRootPath, "images", fileName);
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
```

- [ ] **Step 2: Build to verify (still expects errors from DecksController)**

```powershell
dotnet build FortuneCards.Server
```
Expected: Errors only from `DecksController.cs` (fixed in Task 9).

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Services/DeckService.cs
git commit -m "feat: update DeckService for user auth, visibility filtering, and ownership checks"
```

---

## Task 9: Update DecksController

**Files:**
- Modify: `FortuneCards.Server/Controllers/DecksController.cs`

- [ ] **Step 1: Replace `Controllers/DecksController.cs`**

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

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> GetDecks() =>
            Ok(await _decks.GetAllAsync(CurrentUserId));

        [HttpGet("{id}")]
        public async Task<IActionResult> GetDeck(int id)
        {
            var deck = await _decks.GetByIdAsync(id, CurrentUserId);
            return deck is null ? NotFound() : Ok(deck);
        }

        [HttpPost]
        public async Task<IActionResult> CreateDeck([FromForm] CreateDeckRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var deck = await _decks.CreateAsync(
                request.Name, request.Description,
                request.Emoji ?? "🎴", request.ColorIndex ?? 0,
                request.CardBackImage, userId);
            return CreatedAtAction(nameof(GetDeck), new { id = deck.Id }, deck);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDeck(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var result = await _decks.DeleteAsync(id, userId);
            return result ? NoContent() : NotFound();
        }

        [HttpPost("{id}/cards")]
        public async Task<IActionResult> AddCard(int id, [FromForm] AddCardRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            if (request.Image is null || request.Image.Length == 0)
                return BadRequest("Image file is required.");
            var card = await _decks.AddCardAsync(id, request.Title, request.Description, request.Image, userId);
            if (card is null) return NotFound();
            return CreatedAtAction(nameof(GetDeck), new { id }, card);
        }

        [HttpPatch("{id}/visibility")]
        public async Task<IActionResult> ToggleVisibility(int id, [FromBody] ToggleVisibilityRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var result = await _decks.ToggleVisibilityAsync(id, request.IsPublic, userId);
            return result ? NoContent() : NotFound();
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

    public class ToggleVisibilityRequest
    {
        public bool IsPublic { get; set; }
    }
}
```

- [ ] **Step 2: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```powershell
git add FortuneCards.Server/Controllers/DecksController.cs
git commit -m "feat: update DecksController for auth, ownership, and visibility toggle"
```

---

## Task 10: Update ICardService, CardService, CardsController

**Files:**
- Modify: `FortuneCards.Server/Services/ICardService.cs`
- Modify: `FortuneCards.Server/Services/CardService.cs`
- Modify: `FortuneCards.Server/Controllers/CardsController.cs`

- [ ] **Step 1: Update `Services/ICardService.cs`**

Open the file and change the `DeleteAsync` signature:
```csharp
public record CardDto(int Id, string Title, string Description, string ImageUrl, DateTime CreatedAt);

public interface ICardService
{
    Task<bool> DeleteAsync(int id, int userId);
}
```

- [ ] **Step 2: Replace `Services/CardService.cs`**

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
        private readonly IWebHostEnvironment _env;

        public CardService(FortuneCardsDbContext db, IMemoryCache cache, IWebHostEnvironment env)
        {
            _db = db;
            _cache = cache;
            _env = env;
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var card = await _db.Cards
                .Include(c => c.Deck)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (card is null || card.Deck?.UserId != userId) return false;

            var filePath = Path.Combine(
                _env.WebRootPath,
                card.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(filePath)) File.Delete(filePath);

            var deckId = card.DeckId;
            _db.Cards.Remove(card);
            await _db.SaveChangesAsync();

            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return true;
        }
    }
}
```

- [ ] **Step 3: Update `Controllers/CardsController.cs`**

```csharp
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/cards")]
    public class CardsController : ControllerBase
    {
        private readonly ICardService _cards;

        public CardsController(ICardService cards) => _cards = cards;

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCard(int id)
        {
            if (HttpContext.Items["UserId"] is not int userId) return Unauthorized();
            return await _cards.DeleteAsync(id, userId) ? NoContent() : NotFound();
        }
    }
}
```

- [ ] **Step 4: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded with 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add FortuneCards.Server/Services/ICardService.cs FortuneCards.Server/Services/CardService.cs FortuneCards.Server/Controllers/CardsController.cs
git commit -m "feat: add ownership check to card delete"
```

---

## Task 11: Wire up Program.cs

**Files:**
- Modify: `FortuneCards.Server/Program.cs`

- [ ] **Step 1: Replace `Program.cs`**

```csharp
using FortuneCards.Server.Data;
using FortuneCards.Server.Middleware;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<FortuneCardsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorNumbersToAdd: null)));

builder.Services.AddMemoryCache();
builder.Services.AddScoped<IDeckService, DeckService>();
builder.Services.AddScoped<ICardService, CardService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddHttpClient();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy
            .WithOrigins("https://localhost:51313", "http://localhost:51313")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("EnableApiDocs"))
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapStaticAssets();

app.UseHttpsRedirection();
app.UseCors();
app.UseMiddleware<JwtMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
```

- [ ] **Step 2: Build to verify**

```powershell
dotnet build FortuneCards.Server
```
Expected: Build succeeded.

- [ ] **Step 3: Manual smoke test — start the app and call `/api/auth/me`**

Start the backend:
```powershell
dotnet run --project FortuneCards.Server
```
In a browser or curl:
```
curl -k https://localhost:7242/api/auth/me
```
Expected: `401 Unauthorized` (correct — no cookie is set).

```
curl -k https://localhost:7242/api/decks
```
Expected: JSON array of public decks (200 OK).

Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```powershell
git add FortuneCards.Server/Program.cs
git commit -m "feat: register AuthService, JwtMiddleware, HttpClient, and update CORS in Program.cs"
```

---

## Task 12: Angular — User model + AuthService + APP_INITIALIZER

**Files:**
- Create: `fortunecards.client/src/app/models/user.ts`
- Create: `fortunecards.client/src/app/services/auth.service.ts`
- Create: `fortunecards.client/src/app/services/auth.service.spec.ts`

- [ ] **Step 1: Create `models/user.ts`**

```typescript
export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}
```

- [ ] **Step 2: Create `services/auth.service.ts`**

```typescript
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from '../models/user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  loadCurrentUser(): Promise<void> {
    return firstValueFrom(this.http.get<User>('/api/auth/me'))
      .then(user => this.currentUser.set(user))
      .catch(() => this.currentUser.set(null));
  }

  login(): void {
    window.location.href = '/api/auth/google/login';
  }

  logout(): void {
    firstValueFrom(this.http.post<void>('/api/auth/logout', {}))
      .then(() => {
        this.currentUser.set(null);
        this.router.navigate(['/']);
      });
  }

  deleteAccount(): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/auth/account'))
      .then(() => {
        this.currentUser.set(null);
        this.router.navigate(['/']);
      });
  }
}
```

- [ ] **Step 3: Write failing test for `auth.service.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { User } from '../models/user';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService
      ]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sets currentUser signal when /api/auth/me returns a user', async () => {
    const mockUser: User = { id: 1, email: 'a@b.com', displayName: 'Alice', avatarUrl: null };
    const promise = service.loadCurrentUser();
    httpMock.expectOne('/api/auth/me').flush(mockUser);
    await promise;
    expect(service.currentUser()).toEqual(mockUser);
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('sets currentUser to null when /api/auth/me returns 401', async () => {
    const promise = service.loadCurrentUser();
    httpMock.expectOne('/api/auth/me').flush('', { status: 401, statusText: 'Unauthorized' });
    await promise;
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('clears currentUser on logout', async () => {
    service.currentUser.set({ id: 1, email: 'a@b.com', displayName: 'Alice', avatarUrl: null });
    service.logout();
    httpMock.expectOne('/api/auth/logout').flush({});
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(service.currentUser()).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd fortunecards.client
ng test --include="**/auth.service.spec.ts" --watch=false
```
Expected: 3 specs, 0 failures.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/models/user.ts fortunecards.client/src/app/services/auth.service.ts fortunecards.client/src/app/services/auth.service.spec.ts
git commit -m "feat: add User model and AuthService with signal-based state"
```

---

## Task 13: Angular — AuthGuard

**Files:**
- Create: `fortunecards.client/src/app/guards/auth.guard.ts`
- Create: `fortunecards.client/src/app/guards/auth.guard.spec.ts`

- [ ] **Step 1: Create `guards/auth.guard.ts`**

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn()) return true;
  router.navigate(['/']);
  return false;
};
```

- [ ] **Step 2: Write test for `guards/auth.guard.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user';

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService
      ]
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('returns true when user is logged in', () => {
    const mockUser: User = { id: 1, email: 'a@b.com', displayName: 'Alice', avatarUrl: null };
    authService.currentUser.set(mockUser);
    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));
    expect(result).toBeTrue();
  });

  it('redirects to / and returns false when user is not logged in', () => {
    authService.currentUser.set(null);
    const navigateSpy = spyOn(router, 'navigate');
    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));
    expect(result).toBeFalse();
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
```

- [ ] **Step 3: Run tests**

```powershell
ng test --include="**/auth.guard.spec.ts" --watch=false
```
Expected: 2 specs, 0 failures.

- [ ] **Step 4: Commit**

```powershell
git add fortunecards.client/src/app/guards/auth.guard.ts fortunecards.client/src/app/guards/auth.guard.spec.ts
git commit -m "feat: add authGuard to protect profile routes"
```

---

## Task 14: Angular — Update NavigationBar

**Files:**
- Modify: `fortunecards.client/src/app/components/navigation-bar/navigation-bar.ts`
- Modify: `fortunecards.client/src/app/components/navigation-bar/navigation-bar.html`

- [ ] **Step 1: Update `navigation-bar.ts`**

```typescript
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'navigation-bar',
  standalone: true,
  templateUrl: './navigation-bar.html',
  styleUrl: './navigation-bar.css',
  imports: [RouterLink]
})
export class NavigationBar {
  protected readonly auth = inject(AuthService);
}
```

- [ ] **Step 2: Update `navigation-bar.html`**

Read the current template first to preserve existing markup structure, then replace the contents with an auth-aware version. The exact current markup doesn't matter — replace with:

```html
<nav class="nav-bar">
  <a routerLink="/decks" class="nav-brand">🎴 FortuneCards</a>

  <div class="nav-actions">
    @if (auth.isLoggedIn()) {
      <a routerLink="/profile" class="nav-user">
        @if (auth.currentUser()?.avatarUrl) {
          <img [src]="auth.currentUser()!.avatarUrl!" class="nav-avatar" alt="avatar" />
        } @else {
          <span class="nav-avatar-placeholder">{{ auth.currentUser()?.displayName?.charAt(0) }}</span>
        }
        <span>{{ auth.currentUser()?.displayName }}</span>
      </a>
      <button (click)="auth.logout()" class="nav-btn">Logout</button>
    } @else {
      <button (click)="auth.login()" class="nav-btn nav-btn-primary">Sign in with Google</button>
    }
  </div>
</nav>
```

- [ ] **Step 3: Add minimal CSS to `navigation-bar.css`**

Append to the existing CSS file (do not replace):
```css
.nav-bar { display: flex; justify-content: space-between; align-items: center; padding: 0 1.5rem; }
.nav-brand { font-size: 1.1rem; font-weight: bold; text-decoration: none; }
.nav-actions { display: flex; align-items: center; gap: 1rem; }
.nav-user { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; cursor: pointer; }
.nav-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.nav-avatar-placeholder { width: 32px; height: 32px; border-radius: 50%; background: #4285f4; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; }
.nav-btn { cursor: pointer; padding: 0.4rem 1rem; border-radius: 4px; border: 1px solid currentColor; background: transparent; }
.nav-btn-primary { background: #4285f4; color: #fff; border-color: #4285f4; }
```

- [ ] **Step 4: Build Angular to verify**

```powershell
ng build --configuration development
```
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/navigation-bar/
git commit -m "feat: update NavigationBar with login/logout and user avatar"
```

---

## Task 15: Angular — Update Deck model and DeckService

**Files:**
- Modify: `fortunecards.client/src/app/models/deck.ts`
- Modify: `fortunecards.client/src/app/services/deck.service.ts`

- [ ] **Step 1: Update `models/deck.ts`**

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
  isPublic: boolean;
  isOwner: boolean;
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

- [ ] **Step 2: Update `services/deck.service.ts` — add `toggleVisibility`**

Add this method to the existing `DeckService` class:
```typescript
toggleVisibility(deckId: number, isPublic: boolean): Observable<void> {
  return this.http.patch<void>(`${this.base}/${deckId}/visibility`, { isPublic });
}

deleteCard(cardId: number): Observable<void> {
  return this.http.delete<void>(`/api/cards/${cardId}`);
}
```

> Note: `deleteCard` on `DeckService` is a convenience method — the existing `CardService` also has this. Use whichever is already wired to the deck detail component. If `CardService` handles it, skip adding it here.

- [ ] **Step 3: Commit**

```powershell
git add fortunecards.client/src/app/models/deck.ts fortunecards.client/src/app/services/deck.service.ts
git commit -m "feat: add isPublic/isOwner to Deck model and toggleVisibility to DeckService"
```

---

## Task 16: Angular — Update DeckListComponent for owner controls

**Files:**
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.ts`
- Modify: `fortunecards.client/src/app/components/deck-list/deck-list.component.html`

- [ ] **Step 1: Update `deck-list.component.ts` — inject AuthService and add visibility toggle**

Add `AuthService` injection and a `toggleVisibility` method to the existing component:

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: false
})
export class DeckListComponent implements OnInit {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  constructor(private deckService: DeckService, private router: Router) {}

  ngOnInit(): void { this.loadDecks(); }

  loadDecks(): void {
    this.loading.set(true);
    this.deckService.getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => { this.decks.set(decks); this.loading.set(false); },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); }
      });
  }

  getDeckGradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  getDeckShadow(colorIndex: number): string { return getDeckShadowStyle(colorIndex); }

  deleteDeck(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this deck and all its cards?')) return;
    this.deckService.deleteDeck(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.decks.update(decks => decks.filter(d => d.id !== id)),
        error: () => this.error.set('Failed to delete deck.')
      });
  }

  toggleVisibility(deck: Deck, event: Event): void {
    event.stopPropagation();
    const newValue = !deck.isPublic;
    this.deckService.toggleVisibility(deck.id, newValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.decks.update(decks =>
          decks.map(d => d.id === deck.id ? { ...d, isPublic: newValue } : d)),
        error: () => this.error.set('Failed to update visibility.')
      });
  }

  goToNew(): void { this.router.navigate(['/decks', 'new']); }
}
```

- [ ] **Step 2: Update `deck-list.component.html` — add visibility badge and owner controls**

Read the current HTML template first. Then add these elements inside the deck card loop (where each deck card is rendered). The key additions are:

1. A visibility badge: `<span class="badge" [class.badge-public]="deck.isPublic" [class.badge-private]="!deck.isPublic">{{ deck.isPublic ? '🌐 Public' : '🔒 Private' }}</span>`

2. Owner controls (shown only when `deck.isOwner` is true):
```html
@if (deck.isOwner) {
  <div class="deck-owner-actions">
    <button (click)="toggleVisibility(deck, $event)" class="btn-visibility">
      {{ deck.isPublic ? 'Make Private' : 'Make Public' }}
    </button>
    <button (click)="deleteDeck(deck.id, $event)" class="btn-delete">Delete</button>
  </div>
}
```

3. Show create new deck button only when logged in:
```html
@if (auth.isLoggedIn()) {
  <button (click)="goToNew()" class="btn-new-deck">+ New Deck</button>
}
```

- [ ] **Step 3: Build Angular to verify**

```powershell
ng build --configuration development
```
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```powershell
git add fortunecards.client/src/app/components/deck-list/
git commit -m "feat: add visibility badge and owner controls to DeckListComponent"
```

---

## Task 17: Angular — Profile page

**Files:**
- Create: `fortunecards.client/src/app/components/profile/profile.component.ts`
- Create: `fortunecards.client/src/app/components/profile/profile.component.html`
- Create: `fortunecards.client/src/app/components/profile/profile.component.css`

- [ ] **Step 1: Create `profile.component.ts`**

```typescript
import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  standalone: false
})
export class ProfileComponent implements OnInit {
  myDecks = signal<Deck[]>([]);
  loading = signal(true);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  constructor(private deckService: DeckService, private router: Router) {}

  ngOnInit(): void {
    this.deckService.getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => { this.myDecks.set(decks.filter(d => d.isOwner)); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
  }

  getDeckGradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }

  goToNew(): void { this.router.navigate(['/decks', 'new']); }

  toggleVisibility(deck: Deck, event: Event): void {
    event.stopPropagation();
    const newValue = !deck.isPublic;
    this.deckService.toggleVisibility(deck.id, newValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.myDecks.update(decks =>
          decks.map(d => d.id === deck.id ? { ...d, isPublic: newValue } : d))
      });
  }
}
```

- [ ] **Step 2: Create `profile.component.html`**

```html
<div class="profile-page">
  <div class="profile-header">
    @if (auth.currentUser()?.avatarUrl) {
      <img [src]="auth.currentUser()!.avatarUrl!" class="profile-avatar" alt="avatar" />
    } @else {
      <div class="profile-avatar-placeholder">{{ auth.currentUser()?.displayName?.charAt(0) }}</div>
    }
    <div class="profile-info">
      <h1>{{ auth.currentUser()?.displayName }}</h1>
      <p class="profile-email">{{ auth.currentUser()?.email }}</p>
      <a routerLink="/profile/settings" class="settings-link">Account Settings →</a>
    </div>
  </div>

  <div class="profile-decks">
    <div class="decks-header">
      <h2>My Decks</h2>
      <button (click)="goToNew()" class="btn-new">+ New Deck</button>
    </div>

    @if (loading()) {
      <p>Loading...</p>
    } @else if (myDecks().length === 0) {
      <p class="empty">You haven't created any decks yet.</p>
    } @else {
      <div class="decks-grid">
        @for (deck of myDecks(); track deck.id) {
          <div class="deck-card" [style]="getDeckGradient(deck.colorIndex)">
            <span class="deck-emoji">{{ deck.emoji }}</span>
            <h3>{{ deck.name }}</h3>
            <p class="deck-count">{{ deck.cardCount ?? 0 }} cards</p>
            <div class="deck-footer">
              <span class="badge" [class.badge-public]="deck.isPublic" [class.badge-private]="!deck.isPublic">
                {{ deck.isPublic ? '🌐 Public' : '🔒 Private' }}
              </span>
              <button (click)="toggleVisibility(deck, $event)" class="btn-visibility">
                {{ deck.isPublic ? 'Make Private' : 'Make Public' }}
              </button>
            </div>
          </div>
        }
      </div>
    }
  </div>
</div>
```

- [ ] **Step 3: Create `profile.component.css`**

```css
.profile-page { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
.profile-header { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #333; }
.profile-avatar { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; }
.profile-avatar-placeholder { width: 72px; height: 72px; border-radius: 50%; background: #4285f4; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
.profile-info h1 { margin: 0 0 0.25rem; }
.profile-email { color: #888; margin: 0 0 0.5rem; }
.settings-link { font-size: 0.9rem; }
.decks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.btn-new { padding: 0.5rem 1rem; cursor: pointer; }
.decks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
.deck-card { border-radius: 8px; padding: 1rem; cursor: pointer; }
.deck-emoji { font-size: 1.8rem; }
.deck-count { font-size: 0.85rem; color: rgba(255,255,255,0.7); margin: 0.25rem 0; }
.deck-footer { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
.badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; }
.badge-public { background: #1a3a1a; color: #7ef7a0; border: 1px solid #2d5a2d; }
.badge-private { background: #3a2a1a; color: #f7c87e; border: 1px solid #5a3d1a; }
.btn-visibility { font-size: 0.75rem; padding: 2px 8px; cursor: pointer; background: transparent; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: inherit; }
.empty { color: #888; }
```

- [ ] **Step 4: Build to verify**

```powershell
ng build --configuration development
```
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/profile/
git commit -m "feat: add Profile page component with user info and owned decks"
```

---

## Task 18: Angular — Account Settings page

**Files:**
- Create: `fortunecards.client/src/app/components/account-settings/account-settings.component.ts`
- Create: `fortunecards.client/src/app/components/account-settings/account-settings.component.html`
- Create: `fortunecards.client/src/app/components/account-settings/account-settings.component.css`

- [ ] **Step 1: Create `account-settings.component.ts`**

```typescript
import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
  standalone: false
})
export class AccountSettingsComponent {
  protected readonly auth = inject(AuthService);
  deleteConfirmText = signal('');

  get canDelete(): boolean {
    return this.deleteConfirmText() === 'DELETE';
  }

  confirmDelete(): void {
    if (!this.canDelete) return;
    if (!confirm('This is permanent. Delete your account and all private decks?')) return;
    this.auth.deleteAccount();
  }
}
```

- [ ] **Step 2: Create `account-settings.component.html`**

```html
<div class="settings-page">
  <h1>Account Settings</h1>

  <section class="settings-section">
    <h2>Connected Account</h2>
    <div class="google-account">
      <span class="google-badge">G Google</span>
      <span>{{ auth.currentUser()?.email }}</span>
    </div>
  </section>

  <section class="settings-section danger-zone">
    <h2>Danger Zone</h2>
    <p>Permanently deletes your account and all private decks. Public decks are kept as community decks.</p>
    <p>Type <strong>DELETE</strong> to confirm:</p>
    <input
      type="text"
      [ngModel]="deleteConfirmText()"
      (ngModelChange)="deleteConfirmText.set($event)"
      placeholder="DELETE"
      class="confirm-input"
    />
    <button (click)="confirmDelete()" [disabled]="!canDelete" class="btn-delete">
      Delete Account
    </button>
  </section>
</div>
```

- [ ] **Step 3: Create `account-settings.component.css`**

```css
.settings-page { max-width: 560px; margin: 2rem auto; padding: 0 1rem; }
.settings-section { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #333; }
.settings-section h2 { margin-top: 0; }
.google-account { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
.google-badge { background: #4285f4; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; }
.danger-zone h2 { color: #f76e6e; }
.confirm-input { display: block; margin: 0.5rem 0 1rem; padding: 0.4rem 0.75rem; width: 200px; }
.btn-delete { padding: 0.5rem 1rem; color: #f76e6e; border: 1px solid #f76e6e; background: transparent; cursor: pointer; border-radius: 4px; }
.btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 4: Build to verify**

```powershell
ng build --configuration development
```
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/components/account-settings/
git commit -m "feat: add Account Settings page with account deletion"
```

---

## Task 19: Angular — Update AppRoutingModule and AppModule

**Files:**
- Modify: `fortunecards.client/src/app/app-routing-module.ts`
- Modify: `fortunecards.client/src/app/app-module.ts`

- [ ] **Step 1: Update `app-routing-module.ts`**

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AccountSettingsComponent } from './components/account-settings/account-settings.component';
import { authGuard } from './guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: '/decks', pathMatch: 'full' },
  {
    path: 'decks/new',
    canActivate: [authGuard],
    loadComponent: () => import('./components/create-deck/create-deck.component').then((c) => c.CreateDeckComponent)
  },
  {
    path: 'decks/:id/cards/new',
    canActivate: [authGuard],
    loadComponent: () => import('./components/create-card/create-card.component').then((c) => c.CreateCardComponent)
  },
  {
    path: 'decks/:id/draw',
    loadComponent: () => import('./components/drawn-card/drawn-card.component').then((c) => c.DrawnCardComponent)
  },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', component: DeckListComponent },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'profile/settings', component: AccountSettingsComponent, canActivate: [authGuard] },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
```

- [ ] **Step 2: Update `app-module.ts`**

```typescript
import { APP_INITIALIZER, NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { NavigationBar } from './components/navigation-bar/navigation-bar';
import { ProfileComponent } from './components/profile/profile.component';
import { AccountSettingsComponent } from './components/account-settings/account-settings.component';
import { AuthService } from './services/auth.service';

function initAuth(authService: AuthService): () => Promise<void> {
  return () => authService.loadCurrentUser();
}

@NgModule({
  declarations: [App, DeckListComponent, DeckDetailComponent, ProfileComponent, AccountSettingsComponent],
  imports: [BrowserModule, FormsModule, ReactiveFormsModule, AppRoutingModule, NavigationBar],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      deps: [AuthService],
      multi: true
    }
  ],
  bootstrap: [App],
})
export class AppModule {}
```

- [ ] **Step 3: Build Angular to verify**

```powershell
ng build --configuration development
```
Expected: Build succeeded with 0 errors.

- [ ] **Step 4: Run all Angular tests**

```powershell
ng test --watch=false
```
Expected: All specs pass.

- [ ] **Step 5: Commit**

```powershell
git add fortunecards.client/src/app/app-routing-module.ts fortunecards.client/src/app/app-module.ts
git commit -m "feat: register new components, add authGuard to routes, wire APP_INITIALIZER for auth"
```

---

## Task 20: End-to-end manual verification

- [ ] **Step 1: Start the full application**

In Visual Studio, press F5 — or run both manually:
```powershell
# Terminal 1 — backend
dotnet run --project FortuneCards.Server

# Terminal 2 — frontend
cd fortunecards.client && npm start
```

Open `https://localhost:51313` in the browser.

- [ ] **Step 2: Verify unauthenticated flow**

- Public decks are visible in the deck list
- No "New Deck" button, no delete/edit buttons on deck cards
- Navbar shows "Sign in with Google"
- Navigating to `/profile` redirects to `/decks`

- [ ] **Step 3: Verify login flow**

- Click "Sign in with Google"
- Complete Google consent
- Browser returns to `https://localhost:51313/`
- Navbar shows your Google display name and avatar
- `GET /api/auth/me` returns your user info (check in browser DevTools → Network)

- [ ] **Step 4: Verify deck ownership**

- Create a new deck → it appears with `🔒 Private` badge
- Toggle to public → badge changes to `🌐 Public`
- Navigate to `/profile` → see your decks with visibility controls
- The "New Deck" button is visible in the deck list

- [ ] **Step 5: Verify account settings**

- Navigate to `/profile/settings`
- Type `DELETE` and click "Delete Account"
- Confirm the prompt
- Browser redirects to `/` and is logged out
