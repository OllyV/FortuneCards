# My Comments Tab — Table View, Deleted Text & Restore

**Date:** 2026-08-25
**Branch:** `71_ProfilePageRedesign` (continues the profile work)
**Status:** Approved design

## Goal

Redesign the profile **Comments** tab from a simple list into a **table** (Date · Where · Comment),
**preserve deleted comments' text** (visible only to the author), and let the author **restore** a
deleted comment.

## Background / Current State

- `ProfileCommentsComponent` (`pages/profile/tabs/profile-comments.component.*`) lists
  `CommentService.listMine(1, 20)` results as a `<ul>`; each item links `targetLabel` → `targetRoute`
  and shows `body` or `[deleted]`.
- `MyCommentDto` already carries `Id, TargetType, TargetId, Body, IsDeleted, CreatedAt, EditedAt,
  TargetLabel, TargetRoute` — so **date is already available** (`CreatedAt`); no new DTO fields.
- `CommentService.DeleteAsync` (backend) tombstones AND **scrubs the body**:
  `comment.IsDeleted = true; comment.Body = string.Empty;`.
- `ListMineAsync` returns `c.IsDeleted ? null : c.Body`, so deleted text is null for the author.
- Public `ListAsync` builds DTOs via `ToDto`, which returns `c.IsDeleted ? null : c.Body` (public
  threads show `[deleted]`).
- Frontend `CommentService` has `list/listMine/create/update/remove`; `CommentTargetType` enum
  (`Deck=0, Card=1, Pattern=2`).

## Scope

In scope:
- Table layout for the Comments tab (responsive: stacked rows on mobile).
- Backend: stop scrubbing the body on delete; `ListMineAsync` returns the author's deleted body;
  new author-only **restore**.
- Restore action on deleted rows only (immediate, no confirm).

Out of scope: deleting/editing from the table (delete stays in the thread); changing public-thread
tombstone behavior; recovering comments deleted *before* this ships (their body was already
scrubbed — they show a deleted row with empty text; restoring brings back an empty comment).

## Design

### 1. Backend — keep deleted text, add restore (`CommentService`)

- **`DeleteAsync`**: remove the `comment.Body = string.Empty;` line. Keep `comment.IsDeleted = true;`
  and the rest. The body is retained in the DB; the public `ToDto` still nulls it, so public threads
  are unchanged.
- **`ListMineAsync`**: change the DTO body from `c.IsDeleted ? null : c.Body` to just `c.Body`, so
  the author sees their own deleted text. `IsDeleted` still flags it for styling.
- **`RestoreAsync(int commentId, int userId): Task<bool>`** (new, on `ICommentService` +
  `CommentService`): load the comment; return `false` if missing, not authored by `userId`, or not
  currently deleted; otherwise set `IsDeleted = false`, `SaveChangesAsync`, return `true`.
- **`CommentsController`**: `POST /api/comments/{id:int}/restore` — auth required (`Unauthorized()`
  when absent); `RestoreAsync` → `NoContent()` on true, `NotFound()` on false (author-only, no
  existence leak — mirrors delete).
- `ToDto` (public `ListAsync`) is **unchanged** — deleted comments still return `Body = null` to
  other users. This is the privacy boundary: the real body lives in the DB but is only surfaced to
  its author via `ListMineAsync`.

### 2. Frontend — `CommentService.restore`

Add `restore(id: number): Observable<void>` → `POST /api/comments/{id}/restore` (empty body).

### 3. Frontend — `ProfileCommentsComponent` table

Rewrite the template as a table with three columns:
- **Date** — `c.createdAt` formatted via the `DatePipe` (`| date:'d MMM y'`); `tabular-nums`, muted.
- **Where** — `targetLabel` as a link (`openComment(c.targetRoute)`) + a small **type chip**
  (Deck / Card / Pattern) derived from `c.targetType` via a `typeLabel(t)` / `typeClass(t)` helper.
- **Comment** — `c.body`; when `c.isDeleted`, render the body struck-through/muted with a `deleted`
  tag and a **Restore** button.

Behavior:
- `restore(id)` calls `commentService.restore(id)` then re-fetches `listMine(1, 20)` into the
  `myComments` signal (simple, correct; the list is small).
- Empty state unchanged (`comments.myCommentsEmpty`).
- Responsive: below a breakpoint the table collapses to stacked rows (label + date on top, body
  below) so the page never scrolls sideways; wide content wraps its own `overflow-x: auto`.
- The component needs `DatePipe` added to its `imports`.
- Styling uses design tokens (Nunito, coral/cream); type chips use light tints (deck/pattern/card).

### 4. i18n

Add keys (all 7 locales, English real + copied) under `comments`:
- `colDate` = "Date", `colWhere` = "Where", `colComment` = "Comment"
- `typeDeck` = "Deck", `typeCard` = "Card", `typePattern` = "Pattern"
- `restore` = "Restore"
Reuse existing `comments.deletedPlaceholder` for the `deleted` tag text and
`comments.myCommentsEmpty` for the empty state.

### Error handling

- Restore on a non-owned / missing / not-deleted comment → `404` (frontend leaves the row as-is;
  no user-facing error needed for this reversible action, but a failed restore keeps the deleted
  row).
- Unauthenticated → `401` (the tab is behind `authGuard` already).

## Testing

Backend (xUnit):
- `DeleteAsync` keeps the body (assert the stored `Body` is unchanged, `IsDeleted` true).
- `ListMineAsync` returns the deleted body for the author (not null) with `IsDeleted` true.
- Public `ListAsync` still returns `Body == null` for a deleted comment (privacy preserved).
- `RestoreAsync` by author sets `IsDeleted = false`; returns true.
- `RestoreAsync` by non-author (or missing / not-deleted) returns false and doesn't mutate.

Frontend (Vitest):
- `CommentService.restore(id)` POSTs `/api/comments/{id}/restore`.
- `ProfileCommentsComponent` renders a table row per comment with date + target label + body; a
  deleted row shows the struck body, the `deleted` tag, and a Restore control; clicking Restore
  calls `restore()` and re-fetches `listMine`.

## Files touched (anticipated)

- `FortuneCards.Server/Services/CommentService.cs` (`DeleteAsync`, `ListMineAsync`, `RestoreAsync`)
- `FortuneCards.Server/Services/ICommentService.cs` (`RestoreAsync` signature)
- `FortuneCards.Server/Controllers/CommentsController.cs` (`POST {id}/restore`)
- `FortuneCards.Server.Tests/CommentServiceTests.cs` (delete-keeps-body, list-mine-shows-deleted,
  public-still-hidden, restore author-only)
- `fortunecards.client/src/app/services/comment.service.ts` (+ `.spec.ts`) (`restore`)
- `fortunecards.client/src/app/pages/profile/tabs/profile-comments.component.{ts,html,css,spec.ts}`
- `fortunecards.client/public/i18n/*.json` (table + type + restore keys)
