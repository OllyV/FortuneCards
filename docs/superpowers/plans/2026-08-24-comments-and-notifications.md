# Comments & Reply Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users comment on decks, cards, and patterns with one level of replies, be notified when someone replies to their comment or comments on their content, see a "My Comments" section on their profile, and see an unread-notification badge with a dropdown in the navigation.

**Architecture:** A polymorphic `Comment` entity (`TargetType`/`TargetId`) and a `Notification` entity, served by new `CommentService`/`NotificationService` + controllers that mirror the existing `DeckService`/`DecksController` conventions (auth from `HttpContext.Items["UserId"]`, `404` for non-owner). Notification rows are written directly by `CommentService.CreateAsync` in the same DbContext transaction. The Angular frontend adds reusable `CommentsSection`/`CommentItem` components embedded inline on the three detail pages, a `NotificationBell` in the nav, and a "My Comments" profile section.

**Tech Stack:** ASP.NET Core 10 (C#), EF Core + Npgsql (prod) / in-memory SQLite (tests), xUnit; Angular 21 standalone components + signals, Transloco i18n, Vitest.

## Global Constraints

- Backend auth: read the current user via `HttpContext.Items["UserId"] is int id`; return `Unauthorized()` when absent. (`DecksController` pattern.)
- Ownership / not-found convention: non-author and not-found BOTH return `404` — no existence leak.
- Effective author identity: name = `Nickname ?? DisplayName`; avatar = `IImageStorage.PublicUrl(AvatarImageKey) ?? AvatarUrl`. Reuse via the `UserDisplay` helper (Task 2).
- JSON: `Program.cs` sets camelCase naming and NO string-enum converter, so enums serialize as **integers**. Frontend enums use matching numeric values.
- `Comment.Body`: required, trimmed, non-empty, max 2000 chars.
- Flat threading: a reply's `ParentCommentId` must reference a top-level comment (`ParentCommentId == null`) on the SAME `(TargetType, TargetId)`. Reply-to-a-reply → `400`.
- Comments are NOT gated on `IsPublic`; any authenticated user may comment on any existing target. Access to *view* a target stays governed by existing rules.
- EF migrations here are applied with the `dotnet ef` CLI + `--connection` (VS Package Manager Console fails due to the esproj ProjectReference).
- Reuse the existing `PagedResult<T>` record from `FortuneCards.Server/Services/IDeckService.cs` (same `FortuneCards.Server.Services` namespace) and the frontend `PagedResult<T>` from `models/deck.ts`.
- Frontend tests use `provideZonelessChangeDetection()`, `provideHttpClient()`, `provideHttpClientTesting()`; standalone components are registered via `imports:`.

---

## File Structure

Backend (new unless noted):
- `Models/Comment.cs`, `Models/Notification.cs` — entities + the `CommentTargetType` / `NotificationType` enums.
- `Data/FortuneCardsDbContext.cs` *(modify)* — DbSets + configuration.
- `Migrations/*_AddCommentsAndNotifications.*` — generated.
- `Services/UserDisplay.cs` — effective name/avatar helper.
- `Services/ICommentService.cs`, `Services/CommentService.cs` — DTOs + comment CRUD + notification firing.
- `Services/INotificationService.cs`, `Services/NotificationService.cs` — notification read/mark-read + DTO.
- `Controllers/CommentsController.cs`, `Controllers/NotificationsController.cs`.
- `Program.cs` *(modify)* — DI registration.
- `Services/DeckService.cs`, `Services/CardService.cs`, `Services/PatternService.cs` *(modify)* — remove comments+notifications on target delete.
- `FortuneCards.Server.Tests/TestDb.cs` *(modify)* — helpers `NewCommentService`, `NewNotificationService`, `AddCard`, `AddComment`.
- `FortuneCards.Server.Tests/CommentServiceTests.cs`, `NotificationServiceTests.cs` — new.

Frontend (new unless noted):
- `models/comment.ts`, `models/notification.ts`.
- `services/comment.service.ts` (+ `.spec.ts`), `services/notification.service.ts` (+ `.spec.ts`).
- `components/Comments/comment-item/comment-item.component.ts` (+ html/css/spec).
- `components/Comments/comments-section/comments-section.component.ts` (+ html/css/spec).
- `components/Navigation/notification-bell/notification-bell.component.ts` (+ html/css/spec).
- `components/Navigation/navigation-bar/navigation-bar.{ts,html}` *(modify)* — mount the bell.
- `components/Deck/deck-detail/deck-detail.component.{ts,html}`, `Cards/card-detail/card-detail.component.{ts,html}`, `Pattern/pattern-detail/pattern-detail.component.{ts,html}` *(modify)* — embed comments section.
- `pages/profile/profile.component.{ts,html}` *(modify)* — My Comments section.
- `public/i18n/*.json` *(modify)* — 7 locale files.

---

## Task 1: Data model, DbContext config, and migration

**Files:**
- Create: `FortuneCards.Server/Models/Comment.cs`
- Create: `FortuneCards.Server/Models/Notification.cs`
- Modify: `FortuneCards.Server/Data/FortuneCardsDbContext.cs`
- Create: `FortuneCards.Server/Migrations/*_AddCommentsAndNotifications.*` (generated)

**Interfaces:**
- Produces: `Comment` (fields: `Id`, `CommentTargetType TargetType`, `int TargetId`, `int? ParentCommentId`, `Comment? ParentComment`, `ICollection<Comment> Replies`, `int? UserId`, `User? User`, `string Body`, `bool IsDeleted`, `DateTime CreatedAt`, `DateTime? EditedAt`); `Notification` (fields: `Id`, `int RecipientUserId`, `User? RecipientUser`, `NotificationType Type`, `int CommentId`, `Comment? Comment`, `int? ActorUserId`, `User? ActorUser`, `bool IsRead`, `DateTime CreatedAt`); enums `CommentTargetType { Deck=0, Card=1, Pattern=2 }`, `NotificationType { Reply=0, CommentOnContent=1 }`. DbSets `Comments`, `Notifications`.

- [ ] **Step 1: Create `Comment.cs`**

```csharp
namespace FortuneCards.Server.Models
{
    public enum CommentTargetType { Deck = 0, Card = 1, Pattern = 2 }

    public class Comment
    {
        public int Id { get; set; }
        public CommentTargetType TargetType { get; set; }
        public int TargetId { get; set; }               // polymorphic — no DB FK
        public int? ParentCommentId { get; set; }        // null = top-level; else a top-level comment
        public Comment? ParentComment { get; set; }
        public ICollection<Comment> Replies { get; set; } = new List<Comment>();
        public int? UserId { get; set; }                 // author; SetNull on user delete
        public User? User { get; set; }
        public required string Body { get; set; }
        public bool IsDeleted { get; set; } = false;     // tombstone
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EditedAt { get; set; }
    }
}
```

- [ ] **Step 2: Create `Notification.cs`**

```csharp
namespace FortuneCards.Server.Models
{
    public enum NotificationType { Reply = 0, CommentOnContent = 1 }

    public class Notification
    {
        public int Id { get; set; }
        public int RecipientUserId { get; set; }         // Cascade on user delete
        public User? RecipientUser { get; set; }
        public NotificationType Type { get; set; }
        public int CommentId { get; set; }               // the reply or new top-level comment; Cascade
        public Comment? Comment { get; set; }
        public int? ActorUserId { get; set; }            // who acted; SetNull
        public User? ActorUser { get; set; }
        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
```

- [ ] **Step 3: Add DbSets and configuration in `FortuneCardsDbContext.cs`**

Add the DbSets after the existing `FavoritePatterns` line (around line 16):

```csharp
        public DbSet<Comment> Comments => Set<Comment>();
        public DbSet<Notification> Notifications => Set<Notification>();
```

Add the following entity configuration inside `OnModelCreating`, after the `FavoritePattern` block (before the closing brace of the method):

```csharp
            modelBuilder.Entity<Comment>(e =>
            {
                e.Property(c => c.Body).HasMaxLength(2000).IsRequired();
                e.HasIndex(c => new { c.TargetType, c.TargetId });
                e.HasIndex(c => c.ParentCommentId);
                e.HasOne(c => c.User)
                 .WithMany()
                 .HasForeignKey(c => c.UserId)
                 .OnDelete(DeleteBehavior.SetNull);
                e.HasOne(c => c.ParentComment)
                 .WithMany(c => c.Replies)
                 .HasForeignKey(c => c.ParentCommentId)
                 .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<Notification>(e =>
            {
                e.HasIndex(n => new { n.RecipientUserId, n.IsRead });
                e.HasOne(n => n.RecipientUser)
                 .WithMany()
                 .HasForeignKey(n => n.RecipientUserId)
                 .OnDelete(DeleteBehavior.Cascade);
                e.HasOne(n => n.ActorUser)
                 .WithMany()
                 .HasForeignKey(n => n.ActorUserId)
                 .OnDelete(DeleteBehavior.SetNull);
                e.HasOne(n => n.Comment)
                 .WithMany()
                 .HasForeignKey(n => n.CommentId)
                 .OnDelete(DeleteBehavior.Cascade);
            });
```

- [ ] **Step 4: Build to verify the model compiles**

Run: `dotnet build FortuneCards.Server`
Expected: Build succeeded (0 errors). (npm-audit noise from the SPA ProjectReference is harmless.)

- [ ] **Step 5: Create the migration**

Run: `dotnet ef migrations add AddCommentsAndNotifications --project FortuneCards.Server`
Expected: creates `Migrations/*_AddCommentsAndNotifications.cs` (+ `.Designer.cs`) and updates the snapshot. Open the generated migration and confirm it creates `Comments` and `Notifications` tables with the two indexes and the FK delete behaviors above.

- [ ] **Step 6: Apply the migration to the dev database**

Get the dev connection string: `dotnet user-secrets list --project FortuneCards.Server` (look for `ConnectionStrings:DefaultConnection`).
Run: `dotnet ef database update --project FortuneCards.Server --connection "<DefaultConnection value>"`
Expected: "Applying migration '..._AddCommentsAndNotifications'." then "Done."

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/Models/Comment.cs FortuneCards.Server/Models/Notification.cs FortuneCards.Server/Data/FortuneCardsDbContext.cs FortuneCards.Server/Migrations/
git commit -m "70: Add Comment and Notification models + migration"
```

---

## Task 2: UserDisplay helper, DTOs, and CommentService.CreateAsync (with notification firing)

**Files:**
- Create: `FortuneCards.Server/Services/UserDisplay.cs`
- Create: `FortuneCards.Server/Services/ICommentService.cs`
- Create: `FortuneCards.Server/Services/CommentService.cs`
- Modify: `FortuneCards.Server.Tests/TestDb.cs`
- Create: `FortuneCards.Server.Tests/CommentServiceTests.cs`

**Interfaces:**
- Consumes: `PagedResult<T>` (existing, same namespace), `IImageStorage`, `FortuneCardsDbContext`.
- Produces:
  - `UserDisplay.Name(User?) : string`, `UserDisplay.AvatarUrl(User?, IImageStorage) : string?`.
  - `record CommentDto(int Id, CommentTargetType TargetType, int TargetId, int? ParentCommentId, string? Body, bool IsDeleted, DateTime CreatedAt, DateTime? EditedAt, int? AuthorUserId, string AuthorName, string? AuthorAvatarUrl, bool IsMine, int ReplyCount, IReadOnlyList<CommentDto> Replies)`.
  - `record MyCommentDto(int Id, CommentTargetType TargetType, int TargetId, string? Body, bool IsDeleted, DateTime CreatedAt, DateTime? EditedAt, string TargetLabel, string TargetRoute)`.
  - `ICommentService` with: `Task<PagedResult<CommentDto>> ListAsync(CommentTargetType targetType, int targetId, int? currentUserId, int page, int pageSize)`, `Task<PagedResult<MyCommentDto>> ListMineAsync(int userId, int page, int pageSize)`, `Task<CommentDto?> CreateAsync(CommentTargetType targetType, int targetId, int? parentCommentId, string body, int userId)`, `Task<CommentDto?> UpdateAsync(int commentId, string body, int userId)`, `Task<bool> DeleteAsync(int commentId, int userId)`.
  - `CommentService` implements `ICommentService`. `CreateAsync` throws `ArgumentException` for validation failures and returns `null` when the target does not exist.
- Later tasks (3, 4) add the bodies of `ListAsync`/`ListMineAsync`/`UpdateAsync`/`DeleteAsync`; this task stubs them to `throw new NotImplementedException()` so the file compiles, and implements `CreateAsync` fully.

- [ ] **Step 1: Create `UserDisplay.cs`**

```csharp
using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    /// <summary>Effective (nickname/custom-photo aware) display values for a user.</summary>
    internal static class UserDisplay
    {
        public static string Name(User? u) =>
            u is null ? "Unknown" : (string.IsNullOrWhiteSpace(u.Nickname) ? u.DisplayName : u.Nickname);

        public static string? AvatarUrl(User? u, IImageStorage storage) =>
            u is null ? null : (storage.PublicUrl(u.AvatarImageKey) ?? u.AvatarUrl);
    }
}
```

- [ ] **Step 2: Create `ICommentService.cs` with DTOs and the interface**

```csharp
using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public record CommentDto(
        int Id, CommentTargetType TargetType, int TargetId, int? ParentCommentId,
        string? Body, bool IsDeleted, DateTime CreatedAt, DateTime? EditedAt,
        int? AuthorUserId, string AuthorName, string? AuthorAvatarUrl, bool IsMine,
        int ReplyCount, IReadOnlyList<CommentDto> Replies);

    public record MyCommentDto(
        int Id, CommentTargetType TargetType, int TargetId, string? Body, bool IsDeleted,
        DateTime CreatedAt, DateTime? EditedAt, string TargetLabel, string TargetRoute);

    public interface ICommentService
    {
        Task<PagedResult<CommentDto>> ListAsync(CommentTargetType targetType, int targetId, int? currentUserId, int page, int pageSize);
        Task<PagedResult<MyCommentDto>> ListMineAsync(int userId, int page, int pageSize);
        Task<CommentDto?> CreateAsync(CommentTargetType targetType, int targetId, int? parentCommentId, string body, int userId);
        Task<CommentDto?> UpdateAsync(int commentId, string body, int userId);
        Task<bool> DeleteAsync(int commentId, int userId);
    }
}
```

- [ ] **Step 3: Create `CommentService.cs` with `CreateAsync` implemented and the rest stubbed**

```csharp
using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Services
{
    public class CommentService : ICommentService
    {
        public const int MaxBodyLength = 2000;

        private readonly FortuneCardsDbContext _db;
        private readonly IImageStorage _imageStorage;

        public CommentService(FortuneCardsDbContext db, IImageStorage imageStorage)
        {
            _db = db;
            _imageStorage = imageStorage;
        }

        public async Task<CommentDto?> CreateAsync(CommentTargetType targetType, int targetId, int? parentCommentId, string body, int userId)
        {
            var trimmed = (body ?? string.Empty).Trim();
            if (trimmed.Length == 0)
                throw new ArgumentException("Comment body is required.", nameof(body));
            if (trimmed.Length > MaxBodyLength)
                throw new ArgumentException($"Comment must be {MaxBodyLength} characters or fewer.", nameof(body));

            // Target must exist; capture its owner for the CommentOnContent notification.
            var target = await ResolveTargetOwnerAsync(targetType, targetId);
            if (!target.Exists) return null;

            Comment? parent = null;
            if (parentCommentId is int pid)
            {
                parent = await _db.Comments.FirstOrDefaultAsync(c => c.Id == pid);
                if (parent is null || parent.ParentCommentId != null
                    || parent.TargetType != targetType || parent.TargetId != targetId)
                    throw new ArgumentException("Invalid parent comment.", nameof(parentCommentId));
                if (parent.IsDeleted)
                    throw new ArgumentException("Cannot reply to a deleted comment.", nameof(parentCommentId));
            }

            var comment = new Comment
            {
                TargetType = targetType,
                TargetId = targetId,
                ParentCommentId = parentCommentId,
                UserId = userId,
                Body = trimmed,
            };
            _db.Comments.Add(comment);
            await _db.SaveChangesAsync();  // assigns comment.Id

            // Fire notifications (no self-notify).
            if (parent is not null)
            {
                if (parent.UserId is int recipient && recipient != userId)
                    _db.Notifications.Add(new Notification
                    {
                        RecipientUserId = recipient,
                        Type = NotificationType.Reply,
                        CommentId = comment.Id,
                        ActorUserId = userId,
                    });
            }
            else if (target.UserId is int owner && owner != userId)
            {
                _db.Notifications.Add(new Notification
                {
                    RecipientUserId = owner,
                    Type = NotificationType.CommentOnContent,
                    CommentId = comment.Id,
                    ActorUserId = userId,
                });
            }
            await _db.SaveChangesAsync();

            var author = await _db.Users.FindAsync(userId);
            return ToDto(comment, author, currentUserId: userId, replies: new List<CommentDto>());
        }

        public Task<PagedResult<CommentDto>> ListAsync(CommentTargetType targetType, int targetId, int? currentUserId, int page, int pageSize)
            => throw new NotImplementedException();
        public Task<PagedResult<MyCommentDto>> ListMineAsync(int userId, int page, int pageSize)
            => throw new NotImplementedException();
        public Task<CommentDto?> UpdateAsync(int commentId, string body, int userId)
            => throw new NotImplementedException();
        public Task<bool> DeleteAsync(int commentId, int userId)
            => throw new NotImplementedException();

        // --- helpers ---

        /// <summary>Distinguishes "target missing" (Exists=false) from "target exists but ownerless" (UserId=null).</summary>
        private readonly record struct TargetOwner(bool Exists, int? UserId);

        private async Task<TargetOwner> ResolveTargetOwnerAsync(CommentTargetType type, int id) => type switch
        {
            CommentTargetType.Deck => await _db.Decks.Where(d => d.Id == id)
                .Select(d => new TargetOwner(true, d.UserId)).FirstOrDefaultAsync(),
            CommentTargetType.Pattern => await _db.Patterns.Where(p => p.Id == id)
                .Select(p => new TargetOwner(true, p.UserId)).FirstOrDefaultAsync(),
            CommentTargetType.Card => await _db.Cards.Where(c => c.Id == id)
                .Select(c => new TargetOwner(true, c.Deck!.UserId)).FirstOrDefaultAsync(),
            _ => default,
        };

        internal CommentDto ToDto(Comment c, User? author, int? currentUserId, IReadOnlyList<CommentDto> replies) =>
            new(c.Id, c.TargetType, c.TargetId, c.ParentCommentId,
                c.IsDeleted ? null : c.Body, c.IsDeleted, c.CreatedAt, c.EditedAt,
                c.UserId, UserDisplay.Name(author), UserDisplay.AvatarUrl(author, _imageStorage),
                currentUserId != null && c.UserId == currentUserId,
                replies.Count, replies);
    }
}
```

Note on the sentinel: `FirstOrDefaultAsync` on the projection returns `default(TargetOwner)` = `(Exists:false, UserId:null)` when no row matches, so `!target.Exists` correctly detects a missing target while still allowing an existing-but-ownerless target (`UserId == null`).

- [ ] **Step 4: Add test harness helpers to `TestDb.cs`**

Add these members inside the `TestDb` class (after `NewAuthService`):

```csharp
    public CommentService NewCommentService() => new(Db, Images);

    public Card AddCard(int id, int deckId, string title = "Card")
    {
        var card = new Card { Id = id, Title = title, Description = "d", ImageKey = $"card-{id}.png", DeckId = deckId };
        Db.Cards.Add(card);
        Db.SaveChanges();
        return card;
    }

    public Comment AddComment(int id, CommentTargetType type, int targetId, int? userId, int? parentId = null, string body = "hello", bool isDeleted = false)
    {
        var c = new Comment
        {
            Id = id, TargetType = type, TargetId = targetId, ParentCommentId = parentId,
            UserId = userId, Body = body, IsDeleted = isDeleted,
        };
        Db.Comments.Add(c);
        Db.SaveChanges();
        return c;
    }
```

Add `using FortuneCards.Server.Models;` is already present in `TestDb.cs`.

- [ ] **Step 5: Write the failing tests in `CommentServiceTests.cs`**

```csharp
using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Tests;

public class CommentServiceTests
{
    [Fact]
    public async Task Create_top_level_comment_persists_and_returns_dto()
    {
        using var h = new TestDb();
        h.AddUser(2, "Commenter");
        h.AddDeck(5, userId: 1, isPublic: true);

        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "  Nice deck  ", userId: 2);

        Assert.NotNull(dto);
        Assert.Equal("Nice deck", dto!.Body);       // trimmed
        Assert.Null(dto.ParentCommentId);
        Assert.True(dto.IsMine);
        Assert.Equal("Commenter", dto.AuthorName);
        Assert.Equal(1, await h.Db.Comments.CountAsync());
    }

    [Fact]
    public async Task Create_empty_body_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "   ", 2));
    }

    [Fact]
    public async Task Create_over_2000_chars_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, new string('x', 2001), 2));
    }

    [Fact]
    public async Task Create_on_missing_target_returns_null()
    {
        using var h = new TestDb();
        h.AddUser(2);
        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 999, null, "hi", 2);
        Assert.Null(dto);
    }

    [Fact]
    public async Task Reply_to_a_reply_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        var reply = h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: top.Id);

        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, reply.Id, "nested", 2));
    }

    [Fact]
    public async Task Reply_notifies_parent_author_not_self()
    {
        using var h = new TestDb();
        h.AddUser(2, "Alice");
        h.AddUser(3, "Bob");
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2); // Alice's comment

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, top.Id, "Bob replies", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);              // Alice notified
        Assert.Equal(3, notif.ActorUserId);                  // by Bob
        Assert.Equal(NotificationType.Reply, notif.Type);
    }

    [Fact]
    public async Task Reply_to_own_comment_creates_no_notification()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, top.Id, "self reply", userId: 2);

        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Top_level_comment_notifies_deck_owner()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "hi owner", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);
        Assert.Equal(NotificationType.CommentOnContent, notif.Type);
    }

    [Fact]
    public async Task Owner_commenting_on_own_deck_creates_no_notification()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddDeck(5, userId: 2, isPublic: true);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "my own note", userId: 2);

        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Top_level_comment_on_card_notifies_deck_owner()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddCard(9, deckId: 5);

        await h.NewCommentService().CreateAsync(CommentTargetType.Card, 9, null, "nice card", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);
    }
}
```

- [ ] **Step 6: Run the tests — verify Create tests pass (stubbed methods aren't exercised yet)**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: all listed tests PASS.

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/Services/UserDisplay.cs FortuneCards.Server/Services/ICommentService.cs FortuneCards.Server/Services/CommentService.cs FortuneCards.Server.Tests/TestDb.cs FortuneCards.Server.Tests/CommentServiceTests.cs
git commit -m "70: CommentService.CreateAsync with notification firing"
```

---

## Task 3: CommentService.ListAsync and ListMineAsync

**Files:**
- Modify: `FortuneCards.Server/Services/CommentService.cs`
- Modify: `FortuneCards.Server.Tests/CommentServiceTests.cs`

**Interfaces:**
- Consumes: `CommentDto`, `MyCommentDto`, `PagedResult<T>`, `ToDto` (Task 2).
- Produces: implemented `ListAsync` (top-level newest-first, paginated, each with replies oldest-first + `replyCount`) and `ListMineAsync` (user's own comments newest-first, each with `TargetLabel` + `TargetRoute`).

- [ ] **Step 1: Write failing tests (append to `CommentServiceTests.cs`)**

```csharp
    [Fact]
    public async Task List_returns_top_level_newest_first_with_replies_oldest_first()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        var first = h.AddComment(1, CommentTargetType.Deck, 5, 2, body: "first");
        var second = h.AddComment(2, CommentTargetType.Deck, 5, 2, body: "second");
        h.AddComment(3, CommentTargetType.Deck, 5, 2, parentId: first.Id, body: "reply-a");
        h.AddComment(4, CommentTargetType.Deck, 5, 2, parentId: first.Id, body: "reply-b");

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, currentUserId: 2, page: 1, pageSize: 20);

        Assert.Equal(2, page.TotalCount);                       // top-level only
        Assert.Equal("second", page.Items.First().Body);        // newest first
        var firstDto = page.Items.Last();
        Assert.Equal(2, firstDto.ReplyCount);
        Assert.Equal(new[] { "reply-a", "reply-b" }, firstDto.Replies.Select(r => r.Body)); // oldest first
    }

    [Fact]
    public async Task List_shows_deleted_body_as_null_but_keeps_replies()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, 2, body: "gone", isDeleted: true);
        h.AddComment(2, CommentTargetType.Deck, 5, 2, parentId: top.Id, body: "still here");

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, 2, 1, 20);

        var dto = page.Items.Single();
        Assert.True(dto.IsDeleted);
        Assert.Null(dto.Body);
        Assert.Equal("still here", dto.Replies.Single().Body);
    }

    [Fact]
    public async Task ListMine_returns_only_my_comments_with_target_route()
    {
        using var h = new TestDb();
        h.AddUser(2, "Me");
        h.AddUser(3, "Other");
        h.AddDeck(5, 1, true);
        h.AddCard(9, deckId: 5, title: "The Card");
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "mine on deck");
        h.AddComment(2, CommentTargetType.Card, 9, userId: 2, body: "mine on card");
        h.AddComment(3, CommentTargetType.Deck, 5, userId: 3, body: "not mine");

        var page = await h.NewCommentService().ListMineAsync(userId: 2, page: 1, pageSize: 20);

        Assert.Equal(2, page.TotalCount);
        var cardComment = page.Items.Single(i => i.TargetType == CommentTargetType.Card);
        Assert.Equal("/decks/5/cards/9", cardComment.TargetRoute);
        Assert.Equal("The Card", cardComment.TargetLabel);
        var deckComment = page.Items.Single(i => i.TargetType == CommentTargetType.Deck);
        Assert.Equal("/decks/5", deckComment.TargetRoute);
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: the 3 new tests FAIL with `NotImplementedException`.

- [ ] **Step 3: Implement `ListAsync` (replace its stub in `CommentService.cs`)**

```csharp
        public async Task<PagedResult<CommentDto>> ListAsync(CommentTargetType targetType, int targetId, int? currentUserId, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var topQuery = _db.Comments
                .Where(c => c.TargetType == targetType && c.TargetId == targetId && c.ParentCommentId == null);

            var total = await topQuery.CountAsync();

            var tops = await topQuery
                .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Include(c => c.User)
                .Include(c => c.Replies.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id))
                    .ThenInclude(r => r.User)
                .ToListAsync();

            var items = tops.Select(top =>
            {
                var replies = top.Replies
                    .Select(r => ToDto(r, r.User, currentUserId, Array.Empty<CommentDto>()))
                    .ToList();
                var dto = ToDto(top, top.User, currentUserId, replies);
                return dto;
            }).ToList();

            return new PagedResult<CommentDto>(items, total, page, pageSize);
        }
```

- [ ] **Step 4: Implement `ListMineAsync` (replace its stub)**

```csharp
        public async Task<PagedResult<MyCommentDto>> ListMineAsync(int userId, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var query = _db.Comments.Where(c => c.UserId == userId);
            var total = await query.CountAsync();

            var rows = await query
                .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync();

            var items = new List<MyCommentDto>(rows.Count);
            foreach (var c in rows)
            {
                var (label, route) = await ResolveTargetLinkAsync(c.TargetType, c.TargetId);
                items.Add(new MyCommentDto(
                    c.Id, c.TargetType, c.TargetId, c.IsDeleted ? null : c.Body, c.IsDeleted,
                    c.CreatedAt, c.EditedAt, label, route));
            }

            return new PagedResult<MyCommentDto>(items, total, page, pageSize);
        }

        /// <summary>Human label + frontend route for a comment target. Used by My Comments and notifications.</summary>
        internal async Task<(string Label, string Route)> ResolveTargetLinkAsync(CommentTargetType type, int id)
        {
            switch (type)
            {
                case CommentTargetType.Deck:
                    var deckName = await _db.Decks.Where(d => d.Id == id).Select(d => d.Name).FirstOrDefaultAsync();
                    return (deckName ?? "Deck", $"/decks/{id}");
                case CommentTargetType.Pattern:
                    var patName = await _db.Patterns.Where(p => p.Id == id).Select(p => p.Name).FirstOrDefaultAsync();
                    return (patName ?? "Spread", $"/patterns/{id}");
                case CommentTargetType.Card:
                    var card = await _db.Cards.Where(c => c.Id == id)
                        .Select(c => new { c.Title, c.DeckId }).FirstOrDefaultAsync();
                    return card is null ? ("Card", "/decks") : (card.Title, $"/decks/{card.DeckId}/cards/{id}");
                default:
                    return ("", "/");
            }
        }
```

- [ ] **Step 5: Run to verify all pass**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: all CommentServiceTests PASS.

- [ ] **Step 6: Commit**

```bash
git add FortuneCards.Server/Services/CommentService.cs FortuneCards.Server.Tests/CommentServiceTests.cs
git commit -m "70: CommentService list + mine queries"
```

---

## Task 4: CommentService.UpdateAsync and DeleteAsync (tombstone)

**Files:**
- Modify: `FortuneCards.Server/Services/CommentService.cs`
- Modify: `FortuneCards.Server.Tests/CommentServiceTests.cs`

**Interfaces:**
- Produces: implemented `UpdateAsync` (author-only edit; sets `EditedAt`; validates body; returns `null` for non-author/missing) and `DeleteAsync` (author-only tombstone: sets `IsDeleted = true`; returns `false` for non-author/missing).

- [ ] **Step 1: Write failing tests (append to `CommentServiceTests.cs`)**

```csharp
    [Fact]
    public async Task Update_by_author_sets_body_and_editedAt()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "old");

        var dto = await h.NewCommentService().UpdateAsync(1, "  new text  ", userId: 2);

        Assert.NotNull(dto);
        Assert.Equal("new text", dto!.Body);
        Assert.NotNull(dto.EditedAt);
    }

    [Fact]
    public async Task Update_by_non_author_returns_null()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "old");

        var dto = await h.NewCommentService().UpdateAsync(1, "hax", userId: 3);

        Assert.Null(dto);
        Assert.Equal("old", await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.Body).SingleAsync());
    }

    [Fact]
    public async Task Update_empty_body_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        await Assert.ThrowsAsync<ArgumentException>(() => h.NewCommentService().UpdateAsync(1, "  ", 2));
    }

    [Fact]
    public async Task Delete_by_author_tombstones_and_keeps_replies()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret");
        h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: 1, body: "reply");

        var ok = await h.NewCommentService().DeleteAsync(1, userId: 2);

        Assert.True(ok);
        var top = await h.Db.Comments.SingleAsync(c => c.Id == 1);
        Assert.True(top.IsDeleted);
        Assert.Equal(2, await h.Db.Comments.CountAsync());   // reply still present
    }

    [Fact]
    public async Task Delete_by_non_author_returns_false()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);

        var ok = await h.NewCommentService().DeleteAsync(1, userId: 3);

        Assert.False(ok);
        Assert.False(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: the 5 new tests FAIL with `NotImplementedException`.

- [ ] **Step 3: Implement `UpdateAsync` and `DeleteAsync` (replace their stubs)**

```csharp
        public async Task<CommentDto?> UpdateAsync(int commentId, string body, int userId)
        {
            var trimmed = (body ?? string.Empty).Trim();
            if (trimmed.Length == 0)
                throw new ArgumentException("Comment body is required.", nameof(body));
            if (trimmed.Length > MaxBodyLength)
                throw new ArgumentException($"Comment must be {MaxBodyLength} characters or fewer.", nameof(body));

            var comment = await _db.Comments.Include(c => c.User).FirstOrDefaultAsync(c => c.Id == commentId);
            if (comment is null || comment.UserId != userId || comment.IsDeleted) return null;

            comment.Body = trimmed;
            comment.EditedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return ToDto(comment, comment.User, currentUserId: userId, replies: Array.Empty<CommentDto>());
        }

        public async Task<bool> DeleteAsync(int commentId, int userId)
        {
            var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == commentId);
            if (comment is null || comment.UserId != userId || comment.IsDeleted) return false;

            comment.IsDeleted = true;
            comment.Body = string.Empty;    // scrub stored text; DTO returns null while IsDeleted
            await _db.SaveChangesAsync();
            return true;
        }
```

- [ ] **Step 4: Run to verify all pass**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: all CommentServiceTests PASS.

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Services/CommentService.cs FortuneCards.Server.Tests/CommentServiceTests.cs
git commit -m "70: CommentService edit + tombstone delete"
```

---

## Task 5: NotificationService

**Files:**
- Create: `FortuneCards.Server/Services/INotificationService.cs`
- Create: `FortuneCards.Server/Services/NotificationService.cs`
- Modify: `FortuneCards.Server.Tests/TestDb.cs`
- Create: `FortuneCards.Server.Tests/NotificationServiceTests.cs`

**Interfaces:**
- Consumes: `PagedResult<T>`, `UserDisplay`, `CommentService.ResolveTargetLinkAsync` — but to avoid a service-to-service dependency, `NotificationService` re-implements target-route resolution inline OR takes an `ICommentService`. Decision: inject nothing extra; resolve the route inline with the same switch (small duplication is acceptable and keeps services independent). The shared shape is the tuple `(string Label, string Route)`.
- Produces:
  - `record NotificationDto(int Id, NotificationType Type, bool IsRead, DateTime CreatedAt, int? ActorUserId, string ActorName, string? ActorAvatarUrl, int CommentId, CommentTargetType TargetType, int TargetId, string TargetRoute, string? CommentSnippet)`.
  - `INotificationService`: `Task<PagedResult<NotificationDto>> ListAsync(int userId, int page, int pageSize)`, `Task<int> UnreadCountAsync(int userId)`, `Task<int> MarkReadAsync(int userId, IReadOnlyList<int>? ids)`.

- [ ] **Step 1: Create `INotificationService.cs`**

```csharp
using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public record NotificationDto(
        int Id, NotificationType Type, bool IsRead, DateTime CreatedAt,
        int? ActorUserId, string ActorName, string? ActorAvatarUrl,
        int CommentId, CommentTargetType TargetType, int TargetId, string TargetRoute,
        string? CommentSnippet);

    public interface INotificationService
    {
        Task<PagedResult<NotificationDto>> ListAsync(int userId, int page, int pageSize);
        Task<int> UnreadCountAsync(int userId);
        Task<int> MarkReadAsync(int userId, IReadOnlyList<int>? ids);
    }
}
```

- [ ] **Step 2: Create `NotificationService.cs`**

```csharp
using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Services
{
    public class NotificationService : INotificationService
    {
        private const int SnippetLength = 100;

        private readonly FortuneCardsDbContext _db;
        private readonly IImageStorage _imageStorage;

        public NotificationService(FortuneCardsDbContext db, IImageStorage imageStorage)
        {
            _db = db;
            _imageStorage = imageStorage;
        }

        public Task<int> UnreadCountAsync(int userId) =>
            _db.Notifications.CountAsync(n => n.RecipientUserId == userId && !n.IsRead);

        public async Task<PagedResult<NotificationDto>> ListAsync(int userId, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var query = _db.Notifications.Where(n => n.RecipientUserId == userId);
            var total = await query.CountAsync();

            var rows = await query
                .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Include(n => n.ActorUser)
                .Include(n => n.Comment)
                .ToListAsync();

            var items = new List<NotificationDto>(rows.Count);
            foreach (var n in rows)
            {
                var c = n.Comment!;
                var route = await ResolveRouteAsync(c.TargetType, c.TargetId);
                var snippet = c.IsDeleted ? null : Snippet(c.Body);
                items.Add(new NotificationDto(
                    n.Id, n.Type, n.IsRead, n.CreatedAt,
                    n.ActorUserId, UserDisplay.Name(n.ActorUser), UserDisplay.AvatarUrl(n.ActorUser, _imageStorage),
                    n.CommentId, c.TargetType, c.TargetId, route, snippet));
            }

            return new PagedResult<NotificationDto>(items, total, page, pageSize);
        }

        public async Task<int> MarkReadAsync(int userId, IReadOnlyList<int>? ids)
        {
            var query = _db.Notifications.Where(n => n.RecipientUserId == userId && !n.IsRead);
            if (ids is { Count: > 0 })
                query = query.Where(n => ids.Contains(n.Id));

            var rows = await query.ToListAsync();
            foreach (var n in rows) n.IsRead = true;
            await _db.SaveChangesAsync();
            return rows.Count;
        }

        private static string Snippet(string body) =>
            body.Length <= SnippetLength ? body : body[..SnippetLength] + "…";

        private async Task<string> ResolveRouteAsync(CommentTargetType type, int id) => type switch
        {
            CommentTargetType.Deck => $"/decks/{id}",
            CommentTargetType.Pattern => $"/patterns/{id}",
            CommentTargetType.Card => await _db.Cards.Where(c => c.Id == id)
                .Select(c => $"/decks/{c.DeckId}/cards/{id}").FirstOrDefaultAsync() ?? "/decks",
            _ => "/",
        };
    }
}
```

- [ ] **Step 3: Add `NewNotificationService` to `TestDb.cs`**

Add inside the `TestDb` class:

```csharp
    public NotificationService NewNotificationService() => new(Db, Images);

    public Notification AddNotification(int id, int recipientId, int commentId, NotificationType type, int? actorId, bool isRead = false)
    {
        var n = new Notification
        {
            Id = id, RecipientUserId = recipientId, CommentId = commentId, Type = type,
            ActorUserId = actorId, IsRead = isRead,
        };
        Db.Notifications.Add(n);
        Db.SaveChanges();
        return n;
    }
```

- [ ] **Step 4: Write the failing tests in `NotificationServiceTests.cs`**

```csharp
using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Tests;

public class NotificationServiceTests
{
    private static TestDb Seeded(out int recipientId)
    {
        var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Actor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 3, body: "hello owner");
        recipientId = 2;
        return h;
    }

    [Fact]
    public async Task UnreadCount_counts_only_unread_for_user()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: false);
        h.AddNotification(2, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: true);
        h.AddNotification(3, recipientId: 99, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: false);

        Assert.Equal(1, await h.NewNotificationService().UnreadCountAsync(recipient));
    }

    [Fact]
    public async Task List_returns_actor_and_route_and_snippet()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3);

        var page = await h.NewNotificationService().ListAsync(recipient, 1, 20);

        var dto = page.Items.Single();
        Assert.Equal("Actor", dto.ActorName);
        Assert.Equal("/decks/5", dto.TargetRoute);
        Assert.Equal("hello owner", dto.CommentSnippet);
    }

    [Fact]
    public async Task MarkRead_all_clears_unread()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, 1, NotificationType.CommentOnContent, 3);
        h.AddNotification(2, recipient, 1, NotificationType.CommentOnContent, 3);

        var marked = await h.NewNotificationService().MarkReadAsync(recipient, ids: null);

        Assert.Equal(2, marked);
        Assert.Equal(0, await h.NewNotificationService().UnreadCountAsync(recipient));
    }

    [Fact]
    public async Task MarkRead_specific_ids_only()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, 1, NotificationType.CommentOnContent, 3);
        h.AddNotification(2, recipient, 1, NotificationType.CommentOnContent, 3);

        await h.NewNotificationService().MarkReadAsync(recipient, ids: new[] { 1 });

        Assert.Equal(1, await h.NewNotificationService().UnreadCountAsync(recipient));
    }
}
```

- [ ] **Step 5: Run tests**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~NotificationServiceTests`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add FortuneCards.Server/Services/INotificationService.cs FortuneCards.Server/Services/NotificationService.cs FortuneCards.Server.Tests/TestDb.cs FortuneCards.Server.Tests/NotificationServiceTests.cs
git commit -m "70: NotificationService list/unread-count/mark-read"
```

---

## Task 6: Controllers + DI registration

**Files:**
- Create: `FortuneCards.Server/Controllers/CommentsController.cs`
- Create: `FortuneCards.Server/Controllers/NotificationsController.cs`
- Modify: `FortuneCards.Server/Program.cs`

**Interfaces:**
- Consumes: `ICommentService`, `INotificationService`.
- Produces: the HTTP surface described in the spec. `/api/proxy` prefixes are already handled by `proxy.conf.js` (`/api` is forwarded) — no proxy change needed.

- [ ] **Step 1: Register the services in `Program.cs`**

After the line `builder.Services.AddScoped<IAuthService, AuthService>();` (line 19), add:

```csharp
builder.Services.AddScoped<ICommentService, CommentService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
```

- [ ] **Step 2: Create `CommentsController.cs`**

```csharp
using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/comments")]
    public class CommentsController : ControllerBase
    {
        private readonly ICommentService _comments;

        public CommentsController(ICommentService comments) => _comments = comments;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] CommentTargetType targetType, [FromQuery] int targetId,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 20) =>
            Ok(await _comments.ListAsync(targetType, targetId, CurrentUserId, page, pageSize));

        [HttpGet("mine")]
        public async Task<IActionResult> Mine([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _comments.ListMineAsync(userId, page, pageSize));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateCommentRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            try
            {
                var dto = await _comments.CreateAsync(
                    request.TargetType, request.TargetId, request.ParentCommentId, request.Body ?? "", userId);
                return dto is null ? NotFound() : Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateCommentRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            try
            {
                var dto = await _comments.UpdateAsync(id, request.Body ?? "", userId);
                return dto is null ? NotFound() : Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _comments.DeleteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
    }

    public class CreateCommentRequest
    {
        public CommentTargetType TargetType { get; set; }
        public int TargetId { get; set; }
        public int? ParentCommentId { get; set; }
        public string? Body { get; set; }
    }

    public class UpdateCommentRequest
    {
        public string? Body { get; set; }
    }
}
```

- [ ] **Step 3: Create `NotificationsController.cs`**

```csharp
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/notifications")]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationService _notifications;

        public NotificationsController(INotificationService notifications) => _notifications = notifications;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _notifications.ListAsync(userId, page, pageSize));
        }

        [HttpGet("unread-count")]
        public async Task<IActionResult> UnreadCount()
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(new { count = await _notifications.UnreadCountAsync(userId) });
        }

        [HttpPost("mark-read")]
        public async Task<IActionResult> MarkRead([FromBody] MarkReadRequest? request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var marked = await _notifications.MarkReadAsync(userId, request?.Ids);
            return Ok(new { marked });
        }
    }

    public class MarkReadRequest
    {
        public List<int>? Ids { get; set; }
    }
}
```

- [ ] **Step 4: Build and run the full backend test suite**

Run: `dotnet test FortuneCards.Server.Tests`
Expected: all tests PASS (existing + Comment + Notification suites).

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Controllers/CommentsController.cs FortuneCards.Server/Controllers/NotificationsController.cs FortuneCards.Server/Program.cs
git commit -m "70: Comments and Notifications controllers + DI"
```

---

## Task 7: Remove comments + notifications when a target is deleted

**Files:**
- Modify: `FortuneCards.Server/Services/DeckService.cs` (`DeleteAsync`)
- Modify: `FortuneCards.Server/Services/CardService.cs` (`DeleteAsync`)
- Modify: `FortuneCards.Server/Services/PatternService.cs` (`DeleteAsync`)
- Modify: `FortuneCards.Server.Tests/CommentServiceTests.cs` (or a small new cleanup test file)

**Interfaces:**
- Consumes: `FortuneCardsDbContext.Comments`, `.Notifications`.
- Produces: a private helper `RemoveCommentsForTargetsAsync` added to each service (small duplication, each service owns its own DbContext). Deleting a deck also removes its cards' comments.

- [ ] **Step 1: Write failing cleanup tests (append to `CommentServiceTests.cs`)**

```csharp
    [Fact]
    public async Task Deleting_deck_removes_its_and_its_cards_comments_and_notifications()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddCard(9, deckId: 5);
        // A comment on the deck (by visitor → notifies owner) and one on the card.
        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "on deck", userId: 3);
        await h.NewCommentService().CreateAsync(CommentTargetType.Card, 9, null, "on card", userId: 3);
        Assert.Equal(2, await h.Db.Comments.CountAsync());
        Assert.Equal(2, await h.Db.Notifications.CountAsync());

        var ok = await h.NewDeckService().DeleteAsync(5, userId: 2);

        Assert.True(ok);
        Assert.Equal(0, await h.Db.Comments.CountAsync());
        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Deleting_pattern_removes_its_comments()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddPattern(7, userId: 2, isPublic: true);
        await h.NewCommentService().CreateAsync(CommentTargetType.Pattern, 7, null, "nice spread", userId: 3);
        Assert.Equal(1, await h.Db.Comments.CountAsync());

        var ok = await h.NewPatternService().DeleteAsync(7, userId: 2);

        Assert.True(ok);
        Assert.Equal(0, await h.Db.Comments.CountAsync());
        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }
```

Note: confirm `PatternService.DeleteAsync(int id, int userId)` exists with that signature; if it differs, adapt the call. (Check `IPatternService`.)

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: the 2 new tests FAIL (comments/notifications survive the delete).

- [ ] **Step 3: Add cleanup to `DeckService.DeleteAsync`**

In `DeckService.cs`, add this helper method to the class:

```csharp
        private async Task RemoveCommentsForDeckAsync(int deckId)
        {
            var cardIds = await _db.Cards.Where(c => c.DeckId == deckId).Select(c => c.Id).ToListAsync();
            var comments = await _db.Comments
                .Where(c => (c.TargetType == Models.CommentTargetType.Deck && c.TargetId == deckId)
                         || (c.TargetType == Models.CommentTargetType.Card && cardIds.Contains(c.TargetId)))
                .ToListAsync();
            if (comments.Count == 0) return;
            var commentIds = comments.Select(c => c.Id).ToList();
            var notifs = await _db.Notifications.Where(n => commentIds.Contains(n.CommentId)).ToListAsync();
            _db.Notifications.RemoveRange(notifs);
            _db.Comments.RemoveRange(comments);
        }
```

Then, inside `DeleteAsync`, immediately before `_db.Decks.Remove(deck);` (currently line 150), add:

```csharp
            await RemoveCommentsForDeckAsync(id);
```

(The subsequent `SaveChangesAsync` on line 151 persists both the comment/notification removals and the deck removal in one call.)

- [ ] **Step 4: Add cleanup to `CardService.DeleteAsync`**

In `CardService.cs`, add this helper:

```csharp
        private async Task RemoveCommentsForCardAsync(int cardId)
        {
            var comments = await _db.Comments
                .Where(c => c.TargetType == Models.CommentTargetType.Card && c.TargetId == cardId)
                .ToListAsync();
            if (comments.Count == 0) return;
            var commentIds = comments.Select(c => c.Id).ToList();
            var notifs = await _db.Notifications.Where(n => commentIds.Contains(n.CommentId)).ToListAsync();
            _db.Notifications.RemoveRange(notifs);
            _db.Comments.RemoveRange(comments);
        }
```

Then, inside `DeleteAsync`, immediately before `_db.Cards.Remove(card);` (currently line 33), add:

```csharp
            await RemoveCommentsForCardAsync(id);
```

Add `using Microsoft.EntityFrameworkCore;` if not already present (it is, per the current file).

- [ ] **Step 5: Add cleanup to `PatternService.DeleteAsync`**

Open `PatternService.cs`, find `DeleteAsync`. Add this helper to the class:

```csharp
        private async Task RemoveCommentsForPatternAsync(int patternId)
        {
            var comments = await _db.Comments
                .Where(c => c.TargetType == Models.CommentTargetType.Pattern && c.TargetId == patternId)
                .ToListAsync();
            if (comments.Count == 0) return;
            var commentIds = comments.Select(c => c.Id).ToList();
            var notifs = await _db.Notifications.Where(n => commentIds.Contains(n.CommentId)).ToListAsync();
            _db.Notifications.RemoveRange(notifs);
            _db.Comments.RemoveRange(comments);
        }
```

Then call `await RemoveCommentsForPatternAsync(<patternIdParam>);` inside `DeleteAsync` immediately before the pattern entity is removed, using the same id parameter the method receives. (Match the existing local variable / parameter names in that method.) Ensure `using Microsoft.EntityFrameworkCore;` is present (it is).

- [ ] **Step 6: Run the full backend suite**

Run: `dotnet test FortuneCards.Server.Tests`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/Services/DeckService.cs FortuneCards.Server/Services/CardService.cs FortuneCards.Server/Services/PatternService.cs FortuneCards.Server.Tests/CommentServiceTests.cs
git commit -m "70: Remove comments+notifications when target is deleted"
```

---

## Task 8: Frontend models + CommentService

**Files:**
- Create: `fortunecards.client/src/app/models/comment.ts`
- Create: `fortunecards.client/src/app/models/notification.ts`
- Create: `fortunecards.client/src/app/services/comment.service.ts`
- Create: `fortunecards.client/src/app/services/comment.service.spec.ts`

**Interfaces:**
- Consumes: `PagedResult<T>` from `models/deck.ts`.
- Produces:
  - `models/comment.ts`: `enum CommentTargetType { Deck=0, Card=1, Pattern=2 }`, `interface CommentDto`, `interface MyCommentDto`, `interface CreateCommentInput`.
  - `models/notification.ts`: `enum NotificationType { Reply=0, CommentOnContent=1 }`, `interface NotificationDto`.
  - `CommentService` methods: `list(targetType, targetId, page, pageSize): Observable<PagedResult<CommentDto>>`, `listMine(page, pageSize): Observable<PagedResult<MyCommentDto>>`, `create(input: CreateCommentInput): Observable<CommentDto>`, `update(id, body): Observable<CommentDto>`, `remove(id): Observable<void>`.

- [ ] **Step 1: Create `models/comment.ts`**

```typescript
export enum CommentTargetType {
  Deck = 0,
  Card = 1,
  Pattern = 2,
}

export interface CommentDto {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  parentCommentId: number | null;
  body: string | null;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  authorUserId: number | null;
  authorName: string;
  authorAvatarUrl: string | null;
  isMine: boolean;
  replyCount: number;
  replies: CommentDto[];
}

export interface MyCommentDto {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  body: string | null;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  targetLabel: string;
  targetRoute: string;
}

export interface CreateCommentInput {
  targetType: CommentTargetType;
  targetId: number;
  parentCommentId?: number | null;
  body: string;
}
```

- [ ] **Step 2: Create `models/notification.ts`**

```typescript
import { CommentTargetType } from './comment';

export enum NotificationType {
  Reply = 0,
  CommentOnContent = 1,
}

export interface NotificationDto {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  actorUserId: number | null;
  actorName: string;
  actorAvatarUrl: string | null;
  commentId: number;
  targetType: CommentTargetType;
  targetId: number;
  targetRoute: string;
  commentSnippet: string | null;
}
```

- [ ] **Step 3: Create `services/comment.service.ts`**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/deck';
import { CommentDto, CommentTargetType, CreateCommentInput, MyCommentDto } from '../models/comment';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly base = '/api/comments';
  private readonly http = inject(HttpClient);

  list(targetType: CommentTargetType, targetId: number, page = 1, pageSize = 20): Observable<PagedResult<CommentDto>> {
    const params = new HttpParams()
      .set('targetType', targetType)
      .set('targetId', targetId)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<PagedResult<CommentDto>>(this.base, { params });
  }

  listMine(page = 1, pageSize = 20): Observable<PagedResult<MyCommentDto>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<MyCommentDto>>(`${this.base}/mine`, { params });
  }

  create(input: CreateCommentInput): Observable<CommentDto> {
    return this.http.post<CommentDto>(this.base, {
      targetType: input.targetType,
      targetId: input.targetId,
      parentCommentId: input.parentCommentId ?? null,
      body: input.body,
    });
  }

  update(id: number, body: string): Observable<CommentDto> {
    return this.http.patch<CommentDto>(`${this.base}/${id}`, { body });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
```

- [ ] **Step 4: Create `services/comment.service.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CommentService } from './comment.service';
import { CommentTargetType } from '../models/comment';

describe('CommentService', () => {
  let service: CommentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CommentService,
      ],
    });
    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GETs /api/comments with target params', () => {
    service.list(CommentTargetType.Deck, 5, 1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/comments');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('targetType')).toBe('0');
    expect(req.request.params.get('targetId')).toBe('5');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });

  it('POSTs a reply with parentCommentId', () => {
    service.create({ targetType: CommentTargetType.Card, targetId: 9, parentCommentId: 3, body: 'hi' }).subscribe();
    const req = httpMock.expectOne('/api/comments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ targetType: 1, targetId: 9, parentCommentId: 3, body: 'hi' });
    req.flush({});
  });

  it('PATCHes a comment body', () => {
    service.update(4, 'edited').subscribe();
    const req = httpMock.expectOne('/api/comments/4');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ body: 'edited' });
    req.flush({});
  });

  it('DELETEs a comment', () => {
    service.remove(4).subscribe();
    const req = httpMock.expectOne('/api/comments/4');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('GETs /api/comments/mine', () => {
    service.listMine(1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/comments/mine');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });
});
```

- [ ] **Step 5: Run the frontend tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: the CommentService suite passes; the whole run stays green.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/models/comment.ts fortunecards.client/src/app/models/notification.ts fortunecards.client/src/app/services/comment.service.ts fortunecards.client/src/app/services/comment.service.spec.ts
git commit -m "70: Frontend comment/notification models + CommentService"
```

---

## Task 9: Frontend NotificationService

**Files:**
- Create: `fortunecards.client/src/app/services/notification.service.ts`
- Create: `fortunecards.client/src/app/services/notification.service.spec.ts`

**Interfaces:**
- Consumes: `PagedResult<T>` (`models/deck.ts`), `NotificationDto` (`models/notification.ts`), `AuthService`, `Router`.
- Produces: `NotificationService` with `readonly unreadCount = signal(0)`, `list(page, pageSize): Observable<PagedResult<NotificationDto>>`, `refreshCount(): void`, `markRead(ids?: number[]): Observable<{ marked: number }>`. Constructor subscribes to router `NavigationEnd` and calls `refreshCount()` when `auth.isLoggedIn()`.

- [ ] **Step 1: Create `services/notification.service.ts`**

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { Observable, filter } from 'rxjs';
import { PagedResult } from '../models/deck';
import { NotificationDto } from '../models/notification';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly base = '/api/notifications';
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly unreadCount = signal(0);

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.auth.isLoggedIn()) this.refreshCount();
      });
  }

  list(page = 1, pageSize = 20): Observable<PagedResult<NotificationDto>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<NotificationDto>>(this.base, { params });
  }

  refreshCount(): void {
    this.http.get<{ count: number }>(`${this.base}/unread-count`).subscribe({
      next: (r) => this.unreadCount.set(r.count),
      error: () => this.unreadCount.set(0),
    });
  }

  markRead(ids?: number[]): Observable<{ marked: number }> {
    return this.http.post<{ marked: number }>(`${this.base}/mark-read`, { ids: ids ?? null });
  }
}
```

- [ ] **Step 2: Create `services/notification.service.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        NotificationService,
      ],
    });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('refreshCount sets unreadCount from the API', () => {
    service.refreshCount();
    const req = httpMock.expectOne('/api/notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 3 });
    expect(service.unreadCount()).toBe(3);
  });

  it('markRead posts ids', () => {
    service.markRead([1, 2]).subscribe();
    const req = httpMock.expectOne('/api/notifications/mark-read');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: [1, 2] });
    req.flush({ marked: 2 });
  });

  it('markRead with no ids posts null', () => {
    service.markRead().subscribe();
    const req = httpMock.expectOne('/api/notifications/mark-read');
    expect(req.request.body).toEqual({ ids: null });
    req.flush({ marked: 0 });
  });

  it('list GETs /api/notifications', () => {
    service.list(1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: NotificationService suite passes; whole run green.

- [ ] **Step 4: Commit**

```bash
git add fortunecards.client/src/app/services/notification.service.ts fortunecards.client/src/app/services/notification.service.spec.ts
git commit -m "70: Frontend NotificationService with unread-count signal"
```

---

## Task 10: CommentItem component

**Files:**
- Create: `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.ts`
- Create: `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.html`
- Create: `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.css`
- Create: `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.spec.ts`

**Interfaces:**
- Consumes: `CommentDto`, `CommentService`, `AuthService`.
- Produces: `CommentItemComponent` — `@Input() comment!: CommentDto`, `@Input() canReply = true`; `@Output() changed = new EventEmitter<void>()` (fired after edit/delete/reply so the parent reloads). Renders the comment, its replies, and author-only edit/delete controls; renders `[deleted]` tombstone and "edited" label.

- [ ] **Step 1: Create `comment-item.component.ts`**

```typescript
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentDto } from '../../../models/comment';
import { CommentService } from '../../../services/comment.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'comment-item',
  standalone: true,
  templateUrl: './comment-item.component.html',
  styleUrl: './comment-item.component.css',
  imports: [CommonModule, TranslocoDirective],
})
export class CommentItemComponent {
  @Input({ required: true }) comment!: CommentDto;
  @Input() canReply = true;
  @Output() changed = new EventEmitter<void>();

  private readonly comments = inject(CommentService);
  protected readonly auth = inject(AuthService);

  readonly editing = signal(false);
  readonly replying = signal(false);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  startEdit(): void {
    this.draft.set(this.comment.body ?? '');
    this.error.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.busy.set(true);
    this.comments.update(this.comment.id, body).subscribe({
      next: () => { this.busy.set(false); this.editing.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }

  remove(): void {
    this.busy.set(true);
    this.comments.remove(this.comment.id).subscribe({
      next: () => { this.busy.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }

  startReply(): void {
    this.draft.set('');
    this.error.set(null);
    this.replying.set(true);
  }

  cancelReply(): void {
    this.replying.set(false);
  }

  saveReply(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.busy.set(true);
    this.comments.create({
      targetType: this.comment.targetType,
      targetId: this.comment.targetId,
      parentCommentId: this.comment.id,
      body,
    }).subscribe({
      next: () => { this.busy.set(false); this.replying.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }
}
```

- [ ] **Step 2: Create `comment-item.component.html`**

```html
<ng-container *transloco="let t">
  <div class="comment" [class.deleted]="comment.isDeleted">
    <div class="avatar">
      @if (comment.authorAvatarUrl) {
        <img [src]="comment.authorAvatarUrl" alt="" />
      } @else {
        <span class="letter">{{ comment.authorName.charAt(0) }}</span>
      }
    </div>
    <div class="body">
      <div class="meta">
        <span class="name">{{ comment.authorName }}</span>
        @if (comment.editedAt && !comment.isDeleted) {
          <span class="edited">{{ t('comments.edited') }}</span>
        }
      </div>

      @if (comment.isDeleted) {
        <p class="text tombstone">{{ t('comments.deletedPlaceholder') }}</p>
      } @else if (editing()) {
        <textarea [value]="draft()" (input)="draft.set($any($event.target).value)" maxlength="2000"></textarea>
        <div class="actions">
          <button (click)="saveEdit()" [disabled]="busy() || !draft().trim()">{{ t('common.save') }}</button>
          <button (click)="cancelEdit()" [disabled]="busy()">{{ t('common.cancel') }}</button>
        </div>
      } @else {
        <p class="text">{{ comment.body }}</p>
      }

      @if (error()) { <p class="err">{{ t('comments.saveError') }}</p> }

      @if (!comment.isDeleted && !editing()) {
        <div class="row-actions">
          @if (canReply) {
            <button class="link" (click)="startReply()">{{ t('comments.reply') }}</button>
          }
          @if (comment.isMine) {
            <button class="link" (click)="startEdit()">{{ t('common.edit') }}</button>
            <button class="link danger" (click)="remove()" [disabled]="busy()">{{ t('common.delete') }}</button>
          }
        </div>
      }

      @if (replying()) {
        <div class="reply-box">
          <textarea [value]="draft()" (input)="draft.set($any($event.target).value)"
                    maxlength="2000" [attr.placeholder]="t('comments.replyPlaceholder')"></textarea>
          <div class="actions">
            <button (click)="saveReply()" [disabled]="busy() || !draft().trim()">{{ t('comments.post') }}</button>
            <button (click)="cancelReply()" [disabled]="busy()">{{ t('common.cancel') }}</button>
          </div>
        </div>
      }

      @if (comment.replies?.length) {
        <div class="replies">
          @for (reply of comment.replies; track reply.id) {
            <comment-item [comment]="reply" [canReply]="false" (changed)="changed.emit()"></comment-item>
          }
        </div>
      }
    </div>
  </div>
</ng-container>
```

- [ ] **Step 3: Create `comment-item.component.css`**

```css
.comment { display: flex; gap: 0.75rem; padding: 0.75rem 0; }
.avatar { flex: 0 0 auto; width: 2.25rem; height: 2.25rem; border-radius: 50%; overflow: hidden;
  background: #eee; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.body { flex: 1 1 auto; min-width: 0; }
.meta { display: flex; align-items: center; gap: 0.5rem; }
.name { font-weight: 600; }
.edited { font-size: 0.75rem; opacity: 0.6; }
.text { margin: 0.25rem 0; white-space: pre-wrap; word-break: break-word; }
.tombstone { font-style: italic; opacity: 0.6; }
.row-actions, .actions { display: flex; gap: 0.75rem; margin-top: 0.25rem; }
button.link { background: none; border: none; padding: 0; cursor: pointer; color: #4a5568;
  font-size: 0.85rem; text-decoration: underline; }
button.link.danger { color: #c53030; }
textarea { width: 100%; min-height: 3.5rem; resize: vertical; box-sizing: border-box; }
.replies { margin-left: 1.5rem; border-left: 2px solid #eee; padding-left: 0.75rem; }
.err { color: #c53030; font-size: 0.8rem; }
```

- [ ] **Step 4: Create `comment-item.component.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { CommentItemComponent } from './comment-item.component';
import { CommentDto, CommentTargetType } from '../../../models/comment';
import { AuthService } from '../../../services/auth.service';

function makeComment(over: Partial<CommentDto> = {}): CommentDto {
  return {
    id: 1, targetType: CommentTargetType.Deck, targetId: 5, parentCommentId: null,
    body: 'hello', isDeleted: false, createdAt: '', editedAt: null,
    authorUserId: 2, authorName: 'Alice', authorAvatarUrl: null, isMine: true,
    replyCount: 0, replies: [], ...over,
  };
}

describe('CommentItemComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommentItemComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shows edit/delete only when isMine', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    fixture.componentInstance.comment = makeComment({ isMine: false });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Delete');
  });

  it('renders tombstone for deleted comment and keeps replies', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    fixture.componentInstance.comment = makeComment({
      isDeleted: true, body: null,
      replies: [makeComment({ id: 2, parentCommentId: 1, body: 'child', isMine: false })],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('child');
  });

  it('emits changed after a successful delete', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    const cmp = fixture.componentInstance;
    cmp.comment = makeComment({ isMine: true });
    let emitted = false;
    cmp.changed.subscribe(() => (emitted = true));
    fixture.detectChanges();

    cmp.remove();
    const req = httpMock.expectOne('/api/comments/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    expect(emitted).toBe(true);
  });
});
```

Note: `getTranslocoTestingModule()` is the existing repo helper at `fortunecards.client/src/testing/transloco-testing.ts` (see `main-menu.spec.ts`). Because `comment-item` and `main-menu` sit at the same directory depth, the import path `../../../../testing/transloco-testing` is correct.

- [ ] **Step 5: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: CommentItem suite passes; whole run green.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Comments/comment-item/
git commit -m "70: CommentItem component (edit/delete/reply/tombstone)"
```

---

## Task 11: CommentsSection component

**Files:**
- Create: `fortunecards.client/src/app/components/Comments/comments-section/comments-section.component.ts`
- Create: `.../comments-section.component.html`
- Create: `.../comments-section.component.css`
- Create: `.../comments-section.component.spec.ts`

**Interfaces:**
- Consumes: `CommentService`, `NotificationService` (to refresh count after posting), `AuthService`, `CommentDto`, `CommentTargetType`, `CommentItemComponent`, `PagedResult`.
- Produces: `CommentsSectionComponent` — `@Input() targetType!: CommentTargetType`, `@Input() targetId!: number`. Self-contained: toggle button "Comments (N)", composer for a top-level comment (only when logged in), paginated list with "load more", delegates each comment to `CommentItemComponent`, reloads on `changed`.

- [ ] **Step 1: Create `comments-section.component.ts`**

```typescript
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentDto, CommentTargetType } from '../../../models/comment';
import { CommentService } from '../../../services/comment.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { CommentItemComponent } from '../comment-item/comment-item.component';

@Component({
  selector: 'comments-section',
  standalone: true,
  templateUrl: './comments-section.component.html',
  styleUrl: './comments-section.component.css',
  imports: [CommonModule, TranslocoDirective, CommentItemComponent],
})
export class CommentsSectionComponent implements OnInit {
  @Input({ required: true }) targetType!: CommentTargetType;
  @Input({ required: true }) targetId!: number;

  private readonly comments = inject(CommentService);
  private readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  readonly open = signal(false);
  readonly items = signal<CommentDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly loading = signal(false);
  readonly draft = signal('');
  readonly posting = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // Fetch the count eagerly so the button can show "Comments (N)" before opening.
    this.load(1, false);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  private load(page: number, append: boolean): void {
    this.loading.set(true);
    this.comments.list(this.targetType, this.targetId, page, this.pageSize).subscribe({
      next: (res) => {
        this.total.set(res.totalCount);
        this.page.set(res.page);
        this.items.set(append ? [...this.items(), ...res.items] : res.items);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('load'); },
    });
  }

  reload(): void {
    this.load(1, false);
  }

  loadMore(): void {
    this.load(this.page() + 1, true);
  }

  hasMore(): boolean {
    return this.items().length < this.total();
  }

  post(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.posting.set(true);
    this.comments.create({ targetType: this.targetType, targetId: this.targetId, body }).subscribe({
      next: () => {
        this.posting.set(false);
        this.draft.set('');
        this.reload();
        this.notifications.refreshCount();
      },
      error: () => { this.posting.set(false); this.error.set('save'); },
    });
  }
}
```

- [ ] **Step 2: Create `comments-section.component.html`**

```html
<ng-container *transloco="let t">
  <section class="comments">
    <button class="toggle" (click)="toggle()">
      {{ t('comments.title', { count: total() }) }}
    </button>

    @if (open()) {
      <div class="panel">
        @if (auth.isLoggedIn()) {
          <div class="composer">
            <textarea [value]="draft()" (input)="draft.set($any($event.target).value)"
                      maxlength="2000" [attr.placeholder]="t('comments.placeholder')"></textarea>
            <button (click)="post()" [disabled]="posting() || !draft().trim()">{{ t('comments.post') }}</button>
          </div>
        } @else {
          <p class="signin-hint">{{ t('comments.signInToComment') }}</p>
        }

        @if (error()) { <p class="err">{{ t('comments.loadError') }}</p> }

        @if (items().length === 0 && !loading()) {
          <p class="empty">{{ t('comments.empty') }}</p>
        }

        <div class="list">
          @for (c of items(); track c.id) {
            <comment-item [comment]="c" [canReply]="auth.isLoggedIn()" (changed)="reload()"></comment-item>
          }
        </div>

        @if (hasMore()) {
          <button class="more" (click)="loadMore()" [disabled]="loading()">{{ t('comments.loadMore') }}</button>
        }
      </div>
    }
  </section>
</ng-container>
```

- [ ] **Step 3: Create `comments-section.component.css`**

```css
.comments { margin-top: 1.5rem; }
.toggle { font-weight: 700; background: none; border: 1px solid #cbd5e0; border-radius: 999px;
  padding: 0.4rem 1rem; cursor: pointer; }
.panel { margin-top: 1rem; }
.composer { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.composer textarea { width: 100%; min-height: 4rem; resize: vertical; box-sizing: border-box; }
.composer button, .more { align-self: flex-start; padding: 0.4rem 1rem; cursor: pointer; }
.signin-hint, .empty { opacity: 0.7; }
.err { color: #c53030; }
.more { margin-top: 0.5rem; }
```

- [ ] **Step 4: Create `comments-section.component.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { CommentsSectionComponent } from './comments-section.component';
import { CommentTargetType } from '../../../models/comment';

describe('CommentsSectionComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommentsSectionComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(),
        provideHttpClientTesting(), provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the comment count on init', () => {
    const fixture = TestBed.createComponent(CommentsSectionComponent);
    fixture.componentInstance.targetType = CommentTargetType.Deck;
    fixture.componentInstance.targetId = 5;
    fixture.detectChanges(); // triggers ngOnInit
    const req = httpMock.expectOne((r) => r.url === '/api/comments');
    expect(req.request.params.get('targetId')).toBe('5');
    req.flush({ items: [], totalCount: 7, page: 1, pageSize: 20 });
    expect(fixture.componentInstance.total()).toBe(7);
  });

  it('posts a top-level comment then reloads and refreshes the count', () => {
    const fixture = TestBed.createComponent(CommentsSectionComponent);
    const cmp = fixture.componentInstance;
    cmp.targetType = CommentTargetType.Deck;
    cmp.targetId = 5;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/api/comments').flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });

    cmp.draft.set('great');
    cmp.post();

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/comments');
    expect(post.request.body).toEqual({ targetType: 0, targetId: 5, parentCommentId: null, body: 'great' });
    post.flush({});

    httpMock.expectOne((r) => r.method === 'GET' && r.url === '/api/comments')
      .flush({ items: [], totalCount: 1, page: 1, pageSize: 20 });
    httpMock.expectOne('/api/notifications/unread-count').flush({ count: 0 });
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: CommentsSection suite passes; whole run green.

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Comments/comments-section/
git commit -m "70: CommentsSection component (composer, list, load more)"
```

---

## Task 12: NotificationBell component + nav wiring

**Files:**
- Create: `fortunecards.client/src/app/components/Navigation/notification-bell/notification-bell.component.ts`
- Create: `.../notification-bell.component.html`
- Create: `.../notification-bell.component.css`
- Create: `.../notification-bell.component.spec.ts`
- Modify: `fortunecards.client/src/app/components/Navigation/navigation-bar/navigation-bar.ts`
- Modify: `fortunecards.client/src/app/components/Navigation/navigation-bar/navigation-bar.html`

**Interfaces:**
- Consumes: `NotificationService`, `AuthService`, `Router`, `NotificationDto`.
- Produces: `NotificationBellComponent` — a badge showing `notifications.unreadCount()`, a dropdown listing notifications; opening the dropdown loads the list and calls `markRead()`; clicking an item navigates to `targetRoute`.

- [ ] **Step 1: Create `notification-bell.component.ts`**

```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { NotificationDto } from '../../../models/notification';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'notification-bell',
  standalone: true,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css',
  imports: [CommonModule, TranslocoDirective],
})
export class NotificationBellComponent {
  protected readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly items = signal<NotificationDto[]>([]);
  readonly loading = signal(false);

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.loadAndMarkRead();
  }

  private loadAndMarkRead(): void {
    this.loading.set(true);
    this.notifications.list(1, 20).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
        const unread = res.items.filter((n) => !n.isRead).map((n) => n.id);
        if (unread.length) {
          this.notifications.markRead(unread).subscribe(() => this.notifications.refreshCount());
        }
      },
      error: () => this.loading.set(false),
    });
  }

  go(item: NotificationDto): void {
    this.open.set(false);
    this.router.navigateByUrl(item.targetRoute);
  }
}
```

- [ ] **Step 2: Create `notification-bell.component.html`**

```html
<ng-container *transloco="let t">
  @if (auth.isLoggedIn()) {
    <div class="bell-wrap">
      <button class="bell" (click)="toggle()" [attr.aria-label]="t('notifications.title')">
        🔔
        @if (notifications.unreadCount() > 0) {
          <span class="badge">{{ notifications.unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="dropdown">
          <div class="head">{{ t('notifications.title') }}</div>
          @if (items().length === 0 && !loading()) {
            <p class="empty">{{ t('notifications.empty') }}</p>
          }
          @for (n of items(); track n.id) {
            <button class="item" (click)="go(n)">
              <span class="actor">{{ n.actorName }}</span>
              <span class="what">
                {{ n.type === 0 ? t('notifications.replied') : t('notifications.commented') }}
              </span>
              @if (n.commentSnippet) { <span class="snippet">{{ n.commentSnippet }}</span> }
            </button>
          }
        </div>
      }
    </div>
  }
</ng-container>
```

- [ ] **Step 3: Create `notification-bell.component.css`**

```css
.bell-wrap { position: relative; display: inline-block; }
.bell { background: none; border: none; font-size: 1.25rem; cursor: pointer; position: relative; }
.badge { position: absolute; top: -0.25rem; right: -0.4rem; background: #c53030; color: #fff;
  border-radius: 999px; font-size: 0.7rem; padding: 0 0.35rem; min-width: 1.1rem; text-align: center; }
.dropdown { position: absolute; right: 0; top: 2rem; width: 20rem; max-height: 24rem; overflow-y: auto;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 0.5rem; box-shadow: 0 8px 24px rgba(0,0,0,.12);
  z-index: 50; }
.head { font-weight: 700; padding: 0.6rem 0.8rem; border-bottom: 1px solid #edf2f7; }
.empty { padding: 0.8rem; opacity: 0.7; }
.item { display: block; width: 100%; text-align: left; background: none; border: none;
  padding: 0.6rem 0.8rem; cursor: pointer; border-bottom: 1px solid #f7fafc; }
.item:hover { background: #f7fafc; }
.actor { font-weight: 600; margin-right: 0.25rem; }
.snippet { display: block; opacity: 0.7; font-size: 0.85rem; margin-top: 0.15rem; }
```

- [ ] **Step 4: Wire the bell into the navigation bar**

In `navigation-bar.ts`, add the import and register it in `imports`:

```typescript
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
```

Change the `imports` array to:

```typescript
  imports: [CommonModule, MainMenuComponent, TranslocoDirective, NotificationBellComponent],
```

In `navigation-bar.html`, place `<notification-bell></notification-bell>` next to the profile/menu controls. Open the file, find where the profile button or `<main-menu>` is rendered, and add the bell just before it (it self-hides when logged out). Example placement:

```html
<notification-bell></notification-bell>
```

- [ ] **Step 5: Create `notification-bell.component.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { NotificationBellComponent } from './notification-bell.component';
import { AuthService } from '../../../services/auth.service';

describe('NotificationBellComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(),
        provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('on open, loads notifications and marks unread ones read', () => {
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggle();

    const list = httpMock.expectOne((r) => r.url === '/api/notifications');
    list.flush({
      items: [{ id: 1, type: 0, isRead: false, createdAt: '', actorUserId: 3, actorName: 'Bob',
        actorAvatarUrl: null, commentId: 1, targetType: 0, targetId: 5, targetRoute: '/decks/5', commentSnippet: 'hi' }],
      totalCount: 1, page: 1, pageSize: 20,
    });

    const mark = httpMock.expectOne('/api/notifications/mark-read');
    expect(mark.request.body).toEqual({ ids: [1] });
    mark.flush({ marked: 1 });

    httpMock.expectOne('/api/notifications/unread-count').flush({ count: 0 });
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: NotificationBell suite passes; whole run green.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/components/Navigation/notification-bell/ fortunecards.client/src/app/components/Navigation/navigation-bar/
git commit -m "70: NotificationBell + navigation wiring"
```

---

## Task 13: Embed CommentsSection into the three detail pages

**Files:**
- Modify: `fortunecards.client/src/app/components/Deck/deck-detail/deck-detail.component.ts` + its `.html`
- Modify: `fortunecards.client/src/app/components/Cards/card-detail/card-detail.component.ts` + its `.html`
- Modify: `fortunecards.client/src/app/components/Pattern/pattern-detail/pattern-detail.component.ts` + its `.html`

**Interfaces:**
- Consumes: `CommentsSectionComponent`, `CommentTargetType`, and each page's existing deck/card/pattern id signal.

- [ ] **Step 1: Deck detail — import and expose the enum**

Open `deck-detail.component.ts`. Add imports:

```typescript
import { CommentsSectionComponent } from '../../Comments/comments-section/comments-section.component';
import { CommentTargetType } from '../../../models/comment';
```

Add `CommentsSectionComponent` to the `imports` array of the `@Component`. Add a field to expose the enum to the template:

```typescript
  protected readonly CommentTargetType = CommentTargetType;
```

Identify the existing deck-id value the component holds (e.g. a `deck` signal with `.id`, or a `deckId` signal — check the file). In `deck-detail.component.html`, at the end of the deck content (after the cards area), add:

```html
@if (deck(); as d) {
  <comments-section [targetType]="CommentTargetType.Deck" [targetId]="d.id"></comments-section>
}
```

Adjust `deck()`/`d.id` to match the actual signal/property names in the file.

- [ ] **Step 2: Card detail — same wiring for a card**

In `card-detail.component.ts` add the same two imports, add `CommentsSectionComponent` to `imports`, and add `protected readonly CommentTargetType = CommentTargetType;`. In `card-detail.component.html`, after the card content, add:

```html
@if (card(); as c) {
  <comments-section [targetType]="CommentTargetType.Card" [targetId]="c.id"></comments-section>
}
```

Adjust `card()`/`c.id` to the file's actual signal/property.

- [ ] **Step 3: Pattern detail — same wiring for a pattern**

In `pattern-detail.component.ts` add the two imports, register `CommentsSectionComponent`, add the enum field. In `pattern-detail.component.html`, after the pattern content, add:

```html
@if (pattern(); as p) {
  <comments-section [targetType]="CommentTargetType.Pattern" [targetId]="p.id"></comments-section>
}
```

Adjust `pattern()`/`p.id` to the file's actual signal/property.

- [ ] **Step 4: Update each detail component's spec to register the new child**

Each detail spec that does a full `TestBed.createComponent` will now render `<comments-section>`, which needs `HttpClient`, router, and Transloco. Open `deck-detail.component.spec.ts`, `card-detail.component.spec.ts`, `pattern-detail.component.spec.ts` and ensure their `TestBed` providers already include `provideHttpClient()` + `provideHttpClientTesting()` + router + Transloco (they render `NavigationBar`, so most already do). If a spec now fails because `comments-section` issues an unexpected `GET /api/comments`, add in that spec after the existing flushes:

```typescript
// CommentsSection loads its count on init:
const c = httpMock.match((r) => r.url === '/api/comments');
c.forEach((req) => req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 }));
```

Use `httpMock.match(...)` (not `expectOne`) so it is tolerant when the section isn't rendered in a given test path.

- [ ] **Step 5: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: whole run green (detail specs adjusted as needed).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Deck/deck-detail/ fortunecards.client/src/app/components/Cards/card-detail/ fortunecards.client/src/app/components/Pattern/pattern-detail/
git commit -m "70: Embed comments section on deck/card/pattern detail"
```

---

## Task 14: Profile "My Comments" section

**Files:**
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.ts`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.html`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.spec.ts`

**Interfaces:**
- Consumes: `CommentService.listMine`, `MyCommentDto`, `Router`.
- Produces: a `myComments` signal populated on init and rendered as a list, each linking to `targetRoute`.

- [ ] **Step 1: Load my comments in `profile.component.ts`**

Add imports:

```typescript
import { CommentService } from '../../services/comment.service';
import { MyCommentDto } from '../../models/comment';
```

Add fields to the class:

```typescript
  private readonly commentService = inject(CommentService);
  myComments = signal<MyCommentDto[]>([]);
```

In the constructor (after the decks subscription), add:

```typescript
    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
```

Add a navigation helper:

```typescript
  goToComment(route: string): void {
    this.router.navigateByUrl(route);
  }
```

- [ ] **Step 2: Render the section in `profile.component.html`**

Add a new section (inside the existing `*transloco="let t"` scope; check the file's existing structure and place it after the decks section):

```html
<section class="my-comments">
  <h2>{{ t('comments.myComments') }}</h2>
  @if (myComments().length === 0) {
    <p class="empty">{{ t('comments.myCommentsEmpty') }}</p>
  } @else {
    <ul>
      @for (c of myComments(); track c.id) {
        <li>
          <button class="link" (click)="goToComment(c.targetRoute)">{{ c.targetLabel }}</button>
          <span class="body">{{ c.isDeleted ? t('comments.deletedPlaceholder') : c.body }}</span>
        </li>
      }
    </ul>
  }
</section>
```

- [ ] **Step 3: Update `profile.component.spec.ts`**

The profile spec already sets up `provideHttpClient`/testing (it loads decks). Add a flush for the new `GET /api/comments/mine` request. After the existing decks request flush, add:

```typescript
httpMock.match((r) => r.url === '/api/comments/mine')
  .forEach((req) => req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 }));
```

If the spec uses `expectOne` for the decks call and then `verify()`, ensure the new match line runs before `verify()`.

- [ ] **Step 4: Run tests**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: whole run green.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/
git commit -m "70: Profile My Comments section"
```

---

## Task 15: i18n keys for all locales

**Files:**
- Modify: `fortunecards.client/public/i18n/en.json` (real English copy)
- Modify: `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, `uk.json` (copy the English values, per the deferred-translation convention)

**Interfaces:**
- Consumes: nothing.
- Produces: the `comments` and `notifications` key namespaces used by Tasks 10–14.

- [ ] **Step 1: Add the `comments` and `notifications` namespaces to `en.json`**

Add these two top-level keys (alongside `common`, `nav`, etc.):

```json
  "comments": {
    "title": "Comments ({{count}})",
    "placeholder": "Write a comment…",
    "replyPlaceholder": "Write a reply…",
    "post": "Post",
    "reply": "Reply",
    "edited": "edited",
    "deletedPlaceholder": "[deleted]",
    "empty": "No comments yet. Be the first!",
    "signInToComment": "Sign in to join the conversation.",
    "loadMore": "Load more",
    "loadError": "Couldn't load comments.",
    "saveError": "Couldn't save. Try again.",
    "myComments": "My comments",
    "myCommentsEmpty": "You haven't commented on anything yet."
  },
  "notifications": {
    "title": "Notifications",
    "empty": "No notifications.",
    "replied": "replied to your comment",
    "commented": "commented on your content"
  }
```

- [ ] **Step 2: Copy the same two namespaces into the other six locale files**

Add the identical `comments` and `notifications` blocks (same English values) to `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, and `uk.json`. This matches the deferred-translation approach used by prior i18n work (other locales copy English to avoid missing-key warnings).

- [ ] **Step 3: Verify the app builds and the i18n JSON is valid**

Run: `cd fortunecards.client && ng build`
Expected: build succeeds (invalid JSON would fail the build). Then `ng test --watch=false` stays green.

- [ ] **Step 4: Commit**

```bash
git add fortunecards.client/public/i18n/
git commit -m "70: i18n keys for comments and notifications (7 locales)"
```

---

## Final verification

- [ ] **Backend:** `dotnet test FortuneCards.Server.Tests` — all green.
- [ ] **Frontend:** `cd fortunecards.client && ng test --watch=false` — all green.
- [ ] **Frontend build:** `cd fortunecards.client && ng build` — succeeds.
- [ ] **Manual smoke (optional, F5 in Visual Studio):** as a logged-in user, open a public deck detail → open Comments → post a comment → reply from a second account → confirm the first account's bell shows a badge and the dropdown links back to the comment → confirm the profile "My Comments" lists both.
- [ ] **Update memory:** append progress to the existing `project_user_nickname_photo.md` neighbor or create a `project_comments_feature.md` memory noting the branch, migration name (`AddCommentsAndNotifications`), and merge status.
