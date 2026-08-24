# Comments & Reply Notifications

**Date:** 2026-08-24
**Branch:** new branch off current work (e.g. `70_Comments`)
**Status:** Approved design

## Goal

Let signed-in users comment on **decks, cards, and patterns**, reply to each other (one level of
threading), and be notified when someone replies to their comment or comments on their content.
The profile page gains a **My Comments** section, and the main navigation shows an **unread
notification count** with a dropdown list.

## Background / Current State

- Domain entities `Deck`, `Card`, `Pattern` (`FortuneCards.Server/Models/`) all use `int` PKs and
  `DateTime CreatedAt = DateTime.UtcNow`. `Deck`/`Pattern` have a nullable `UserId` FK
  (`OnDelete: SetNull`); `Card` belongs to a `Deck` (`OnDelete: Cascade`) and has no direct owner.
- Ownership convention: non-owner and not-found both return `404` (no existence leak). Auth comes
  from `HttpContext.Items["UserId"]` (set by `JwtMiddleware`); controllers return `Unauthorized()`
  when absent. See `DecksController` / `DeckService` as the canonical pattern.
- `User` already carries an **effective identity** (custom `Nickname`/`AvatarImageKey` overriding
  Google `DisplayName`/`AvatarUrl`); the server builds public avatar URLs via
  `IImageStorage.PublicUrl(key)`. Comment/notification author display reuses this same effective
  logic.
- Frontend is Angular standalone components + signals; `MainMenuComponent` and `ProfileComponent`
  already use `TranslocoDirective`/`TranslocoPipe`. `MonitoringService` already listens to router
  `NavigationEnd` events — the same signal we hook for refreshing the unread count.
- Detail pages exist for all three targets: `deck-detail`, `card-detail`, `pattern-detail`.

## Scope

In scope:
- Comments on decks, cards, and patterns (polymorphic target).
- One level of reply threading (flat: a reply-to-a-reply still attaches to the top-level comment).
- Author-only edit and delete; deleting a comment with replies **tombstones** it (`[deleted]`).
- Notifications on (a) a reply to my comment, (b) a top-level comment on content I own.
- Unread-count badge + notifications dropdown in the navigation; mark-read on open.
- Profile **My Comments** section.
- Inline expanding comments section on each detail page, opened by a "Comments (N)" button.

Out of scope (per brainstorming, deferred):
- `@nickname` mentions and mention notifications.
- Owner moderation (deleting others' comments on your content).
- Realtime / polling refresh of the unread count (refresh is on load + on navigation only).
- Native-speaker translation of new UI strings (other locales copy English, matching prior i18n
  work).
- Sharing private decks by link (a **future** feature; this design intentionally does **not** gate
  commenting on `IsPublic` so it works automatically when that lands).

## Design

### Access model

The comment API requires authentication but does **not** independently gate on `IsPublic`. Whether
a user can *see* a target (and therefore its comments) stays governed by existing target-access
rules (currently: public to all, private to owner only). This keeps the feature forward-compatible
with the planned share-private-deck-by-link feature without special-casing.

### 1. Data model

Two new entities and two enums.

```csharp
public enum CommentTargetType { Deck = 0, Card = 1, Pattern = 2 }
public enum NotificationType { Reply = 0, CommentOnContent = 1 }

public class Comment
{
    public int Id { get; set; }
    public CommentTargetType TargetType { get; set; }
    public int TargetId { get; set; }          // polymorphic — no DB FK
    public int? ParentCommentId { get; set; }   // null = top-level; else a top-level comment
    public Comment? ParentComment { get; set; }
    public ICollection<Comment> Replies { get; set; } = new List<Comment>();
    public int? UserId { get; set; }            // author; SetNull on user delete
    public User? User { get; set; }
    public required string Body { get; set; }
    public bool IsDeleted { get; set; } = false; // tombstone
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
}

public class Notification
{
    public int Id { get; set; }
    public int RecipientUserId { get; set; }    // Cascade on user delete
    public User? RecipientUser { get; set; }
    public NotificationType Type { get; set; }
    public int CommentId { get; set; }          // the reply, or the new top-level comment; Cascade
    public Comment? Comment { get; set; }
    public int? ActorUserId { get; set; }        // who acted; SetNull
    public User? ActorUser { get; set; }
    public bool IsRead { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

**`OnModelCreating` configuration:**
- `Comment.Body` `HasMaxLength(2000).IsRequired()`.
- `Comment.User` → `User` with `OnDelete: SetNull`.
- `Comment.ParentComment` → `Comment` (`WithMany(c => c.Replies)`) with **`OnDelete: Restrict`**
  (we tombstone parents rather than cascade; deletion of a parent row is not expected).
- Index on `(TargetType, TargetId)` for the list query; index on `ParentCommentId`.
- `Notification.RecipientUser` → `User` with `OnDelete: Cascade`; index on
  `(RecipientUserId, IsRead)` for the unread-count query.
- `Notification.Comment` → `Comment` with `OnDelete: Cascade`.
- `Notification.ActorUser` → `User` with `OnDelete: SetNull`. (Both `Notification` → `User`
  relationships are explicitly configured with no inverse navigation on `User`, or with distinct
  navigations, to avoid the multiple-cascade-path ambiguity SQL/EF rejects — `RecipientUser`
  cascades, `ActorUser` sets null.)

**Polymorphic cascade:** because `TargetId` has no DB FK, deleting a deck/card/pattern does not
auto-delete its comments. The delete paths in `DeckService.DeleteAsync`, `CardService`
(card removal), and `PatternService.DeleteAsync` must explicitly remove `Comment`s matching the
target (and their `Notification`s cascade via `CommentId`). Deleting a deck must also remove
comments for its cards. This is a required touch-point called out in "Files touched".

**Display values are derived at read time**, never denormalized: the notification's target link
and the actor's effective nickname/avatar are resolved from `Comment` → target + `ActorUser` when
building the DTO.

EF migration `AddCommentsAndNotifications`, applied with the `dotnet ef` CLI + `--connection` from
user-secrets (the VS Package Manager Console path fails here due to the esproj ProjectReference).

### 2. Backend API

New `CommentsController` (`api/comments`) + `ICommentService`/`CommentService`, and
`NotificationsController` (`api/notifications`) + `INotificationService`/`NotificationService`,
registered in `Program.cs` alongside the existing services. All follow the auth pattern
(`CurrentUserId` from `HttpContext.Items["UserId"]`, `Unauthorized()` when null).

**Comments**

| Verb | Route | Purpose |
|---|---|---|
| `GET` | `/api/comments?targetType=Deck&targetId=42&page=1&pageSize=20` | Top-level comments for a target, newest-first, paginated. Each includes its replies (oldest-first) and `replyCount`. |
| `GET` | `/api/comments/mine?page=1&pageSize=20` | Current user's own comments, newest-first, each with a resolved target link. Powers profile "My Comments". |
| `POST` | `/api/comments` | Body `{ targetType, targetId, parentCommentId?, body }`. Creates comment/reply; fires notifications. Returns `CommentDto`. |
| `PATCH` | `/api/comments/{id}` | Body `{ body }`. Author-only; sets `EditedAt`. `404` for non-author. |
| `DELETE` | `/api/comments/{id}` | Author-only; tombstones (`IsDeleted = true`, body hidden). `404` for non-author. |

**`CommentDto`** fields: `id`, `targetType`, `targetId`, `parentCommentId`, `body` (or `null` when
`isDeleted`), `isDeleted`, `createdAt`, `editedAt`, `authorNickname` (effective), `authorAvatarUrl`
(effective, nullable), `authorUserId`, `isMine` (author == current user), `replyCount`, and for
top-level comments a `replies: CommentDto[]`. For `/mine`, add a `targetLink` (see frontend
routing) and a short target label.

**Validation & rules (in `CommentService`):**
- `Body` required, `Trim()`, non-empty, ≤ 2000 chars → else `400`.
- `parentCommentId`, if supplied, must reference a **top-level** comment (`ParentCommentId == null`)
  on the **same** `(TargetType, TargetId)`; otherwise `400`. This enforces flat threading: an
  attempt to reply to a reply is rejected with `400` (the client always replies to the top-level
  comment of the thread).
- Tombstoned comments cannot be edited or replied to → `400`/`404` as appropriate.

**Notification firing (in `CommentService` on successful create):**
- Reply (`parentCommentId` set) → create a `Notification { Type = Reply }` for the **parent
  comment's author**.
- Top-level comment → create a `Notification { Type = CommentOnContent }` for the **target owner**
  (deck/pattern `UserId`; a card resolves its owner via its parent deck's `UserId`).
- Skip when recipient is null (orphaned/ownerless target) or equals the actor (no self-notify).

**Notifications**

| Verb | Route | Purpose |
|---|---|---|
| `GET` | `/api/notifications?page=1&pageSize=20` | Current user's notifications, newest-first, with resolved actor (effective nickname/avatar), type, target link, and the triggering comment's snippet. |
| `GET` | `/api/notifications/unread-count` | `{ count }` — cheap `(RecipientUserId, IsRead)` count for the badge. |
| `POST` | `/api/notifications/mark-read` | Body `{ ids?: int[] }`. Marks the given ids (or all of the user's unread) as read. Called when the dropdown opens. |

### 3. Frontend

**Models:** `models/comment.ts` (`CommentDto`, `CommentTargetType`) and
`models/notification.ts` (`NotificationDto`, `NotificationType`).

**Services** (mirroring `DeckService` — `HttpClient` with typed generics):
- `CommentService`: `list(targetType, targetId, page)`, `listMine(page)`, `create(...)`,
  `update(id, body)`, `remove(id)`.
- `NotificationService`: holds an `unreadCount = signal(0)` and a `notifications` signal;
  `refreshCount()`, `load()`, `markRead(ids?)`. `refreshCount()` is called on app start (when
  authenticated) and on router `NavigationEnd`.

**Components (reused across all three detail pages):**
- `CommentsSection` — the full comments UI for a `{ targetType, targetId }`: composer, paginated
  list ("load more"), and the top-level comment button/count wrapper. Expands inline in the page
  flow when the "Comments (N)" button is toggled.
- `CommentItem` — one comment with its replies; inline edit, delete, reply composer; renders the
  `[deleted]` tombstone and an "edited" label when `editedAt` is set. Author-only controls gated on
  `isMine`.
- `NotificationBell` — badge showing `unreadCount()` + a dropdown listing `NotificationDto`s, each
  linking to its target/comment. Opening the dropdown calls `markRead()` and clears the badge.
  Placed in the navigation (`navigation-bar` / `main-menu`).

**Detail pages:** `deck-detail`, `card-detail`, `pattern-detail` each embed `<CommentsSection>`
with the appropriate target type/id and a "Comments (N)" toggle button.

**Profile "My Comments":** a new section in `ProfileComponent` listing `listMine()` results, each
linking to its target via `targetLink`.

**Target routing** (`targetLink` resolution): Deck → `/decks/:id`, Pattern → `/patterns/:id`,
Card → its deck/card detail route (per existing `card-detail` route). Confirmed against
`app.routes.ts` during implementation.

### 4. i18n

Add Transloco keys for all new UI strings (comment composer placeholder + post button, reply,
edit, delete, save/cancel, "edited", "[deleted]", "Comments (N)" button, empty-state, "My
Comments" heading, notification templates like "{{actor}} replied to your comment on {{target}}"
and "{{actor}} commented on {{target}}", "Notifications", "No notifications", "Mark all read") to
**all** `public/i18n/*.json` files. English gets real copy; other locales copy English to avoid
missing-key warnings.

### Error handling

- Unauthenticated on any mutating/notification route → `401`.
- Non-author edit/delete → `404` (no existence leak, per convention).
- Empty or over-length body → `400` surfaced inline in the composer.
- Invalid `parentCommentId` (wrong target or not top-level) → `400`.
- Target not found when listing → empty list (listing is not an existence oracle for private
  content the user can't access; access is enforced by the existing target-access rules where
  relevant).

## Testing

Backend (xUnit, `FortuneCards.Server.Tests`, in-memory SQLite + `TestDb`):
- Create top-level comment and reply; reply's `ParentCommentId` points at the top-level comment.
- Reply-to-a-reply is rejected with 400 per the flat-threading rule.
- Body validation: empty/whitespace rejected; > 2000 chars rejected.
- Edit sets `EditedAt`; non-author edit/delete returns 404.
- Delete tombstones (sets `IsDeleted`, hides body) and leaves replies intact.
- Notification fires to parent-comment author on reply, and to target owner on top-level comment.
- No self-notification when actor == recipient.
- `unread-count` reflects unread rows; `mark-read` clears them.
- Deleting a deck/card/pattern removes its comments (and cascades their notifications); deleting a
  deck also removes its cards' comments.

Frontend (Vitest):
- `CommentService`/`NotificationService` call the expected URLs and map DTOs.
- `NotificationService.unreadCount` refreshes on `NavigationEnd`.
- `CommentsSection` toggles open and posts a comment; `CommentItem` shows author-only controls only
  when `isMine`, renders the tombstone and "edited" label.
- `NotificationBell` shows the count and calls `markRead()` on open.

## Files touched (anticipated)

Backend:
- `FortuneCards.Server/Models/Comment.cs`, `Notification.cs` (+ the two enums)
- `FortuneCards.Server/Data/FortuneCardsDbContext.cs` (DbSets + config)
- `FortuneCards.Server/Migrations/*_AddCommentsAndNotifications.*`
- `FortuneCards.Server/Services/ICommentService.cs`, `CommentService.cs`
- `FortuneCards.Server/Services/INotificationService.cs`, `NotificationService.cs`
- `FortuneCards.Server/Controllers/CommentsController.cs`, `NotificationsController.cs`
- `FortuneCards.Server/Services/DeckService.cs`, `CardService.cs`, `PatternService.cs` (delete
  paths remove comments/notifications)
- `FortuneCards.Server/Program.cs` (DI registration)

Frontend:
- `fortunecards.client/src/app/models/comment.ts`, `notification.ts`
- `fortunecards.client/src/app/services/comment.service.ts`, `notification.service.ts`
- `fortunecards.client/src/app/components/Comments/comments-section/*`, `comment-item/*`
- `fortunecards.client/src/app/components/Navigation/notification-bell/*` (+ wiring into
  `navigation-bar` / `main-menu`)
- `fortunecards.client/src/app/components/Deck/deck-detail/*`,
  `Cards/card-detail/*`, `Pattern/pattern-detail/*` (embed comments section)
- `fortunecards.client/src/app/pages/profile/profile.component.*` (My Comments)
- `fortunecards.client/public/i18n/*.json`
- Corresponding `*.spec.ts` files.
