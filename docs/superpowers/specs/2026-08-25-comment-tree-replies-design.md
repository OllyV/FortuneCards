# Comment Tree Replies (capped depth)

**Date:** 2026-08-25
**Branch:** `70_Comments` (continues the comments feature)
**Status:** Approved design

## Goal

Replace the current **flat one-level** reply model with a **capped-depth tree**: users can reply to
replies, nesting up to 3 tiers deep. Beyond the cap, a reply is clamped to sit as a sibling at the
deepest allowed tier (Reddit-style), so the stored tree never exceeds the cap and indentation stays
readable on mobile.

## Background / Current State

- `Comment` already has a self-referencing `ParentCommentId` (`OnDelete: Restrict`) and the DTO is
  already recursive (`CommentDto.replies: CommentDto[]`). **No DB migration is needed.**
- `CommentService.CreateAsync` currently **enforces flat threading**: a reply's `parentCommentId`
  must reference a top-level comment (`ParentCommentId == null`) on the same target, else it throws
  `ArgumentException` → 400. Test `Reply_to_a_reply_is_rejected` asserts this.
- `CommentService.ListAsync` loads top-level comments (paginated) + **exactly one level** of replies
  via `.Include(c => c.Replies)`.
- Frontend `CommentItemComponent` recurses over `comment.replies` but passes `canReply="false"` to
  replies, so only top-level comments show a Reply control. It has no depth concept.
- The just-shipped bubble redesign already renders nested `.c-replies` with an indent + connector
  rail at any depth.
- Notification firing on reply notifies the parent comment's author (`NotificationType.Reply`).

## Scope

In scope:
- Allow replying to any non-tombstoned comment on the same target.
- Cap nesting at `MAX_REPLY_DEPTH = 3` (top-level tier 0; replies at tiers 1, 2, 3).
- Clamp-as-sibling when a reply would exceed the cap.
- Build the full nested tree (to the cap) in `ListAsync`.
- Enable the Reply control at every depth in the frontend.
- Keep reply notifications pointed at the comment the user actually replied to.

Out of scope (unchanged): author-only edit/delete + tombstone; notifications model; the bubble
styling (already done); "load more" pagination is on top-level only; no `@mention` references.

## Design

### Depth model

Depth is the number of ancestors: top-level = 0, its reply = 1, and so on. `MAX_REPLY_DEPTH = 3`
means the deepest a stored comment can sit is depth 3. A reply always lands at `min(depth(parent)+1,
3)`.

### 1. `CommentService.CreateAsync` — reply rules

Replace the flat-threading block. When `parentCommentId` (call it `P`) is supplied:

1. Load `P` (with its `UserId`). Reject (`ArgumentException` → 400) if `P` is null, on a different
   `(TargetType, TargetId)`, or tombstoned. (Same-target + not-deleted checks stay; the
   `ParentCommentId == null` check is removed.)
2. Compute `depth(P)` by walking `ParentCommentId` upward, counting ancestors (bounded by
   `MAX_REPLY_DEPTH + 1` hops, so ≤ 4 tiny lookups).
3. **Clamp:** if `depth(P) + 1 <= MAX_REPLY_DEPTH`, store `ParentCommentId = P.Id`. Otherwise
   (`P` is already at max depth) store `ParentCommentId = P.ParentCommentId` — the reply becomes a
   sibling of `P` at the deepest allowed tier.
4. **Notify the real reply target:** the `NotificationType.Reply` notification recipient is
   `P.UserId` (the author of the comment the user clicked Reply on), captured *before* the clamp —
   not the clamped/stored parent's author. Skip self-notify as today.

Because every stored comment is kept at depth ≤ 3, the only boundary case is replying to a
depth-3 comment, which needs exactly one clamp step.

### 2. `CommentService.ListAsync` — build the tree

Keep top-level pagination. Then load the page's subtrees **level by level** (bounded by the cap),
so only the returned roots' descendants are fetched:

- `roots` = paginated top-level comments (as today), with `User`.
- `level1` = comments where `ParentCommentId ∈ rootIds`.
- `level2` = comments where `ParentCommentId ∈ level1Ids`.
- `level3` = comments where `ParentCommentId ∈ level2Ids`.
- Each level loads `User` and orders oldest-first (`CreatedAt`, then `Id`).

Assemble DTOs bottom-up (level3 → level2 → level1 → roots) via the existing `ToDto`, attaching each
comment's ordered children as its `replies`. `replyCount` becomes the **total descendant count**
for that top-level comment. Tombstoned comments still return `Body == null` but keep their subtree.

This is 4 bounded queries per page (roots + 3 levels), scoped to the page's roots — no full-thread
scan, no unbounded recursion.

### 3. Frontend `CommentItemComponent`

- Add `@Input() depth = 0;`.
- Render replies with `[depth]="depth + 1"` and **propagate** `[canReply]="canReply"` (remove the
  hardcoded `false`), so Reply is available at every tier. `comments-section` still seeds top-level
  `canReply` = `auth.isLoggedIn()`.
- No visual-cap logic needed: the data is bounded to 3 tiers, so nesting can't exceed the redesign's
  indentation. (Optional polish: a `depth`-based class could tighten indentation on deep tiers, but
  it's not required.)

### Error handling

- Reply to a missing / wrong-target / tombstoned parent → `400` (unchanged shape).
- Everything else unchanged (auth 401, author-only 404, body validation 400).

## Testing

Backend (xUnit):
- Replace `Reply_to_a_reply_is_rejected` with `Reply_to_a_reply_is_nested`: create top-level → reply
  → reply-to-reply; assert the third comment's `ParentCommentId` is the second, and `ListAsync`
  returns it nested two levels deep with correct `replyCount`.
- `Reply_at_max_depth_clamps_to_sibling`: build a chain to depth 3, reply to the depth-3 comment;
  assert the new comment's stored `ParentCommentId` is the depth-2 comment (sibling), and the
  `Reply` notification recipient is the depth-3 comment's author.
- `List_builds_multi_level_tree`: assert three nested levels come back in one top-level item with
  oldest-first ordering at each level.

Frontend (Vitest):
- `CommentItem` renders a Reply control on a nested reply when `canReply` is true (depth
  propagation), and passes `depth + 1` to its children.
- Existing specs (isMine gating, tombstone-keeps-replies, changed emission) still pass.

## Files touched (anticipated)

- `FortuneCards.Server/Services/CommentService.cs` (`CreateAsync` reply rules + depth/clamp helper;
  `ListAsync` level-by-level tree build)
- `FortuneCards.Server.Tests/CommentServiceTests.cs` (flip + add tests)
- `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.{ts,html}`
  (depth input + propagate canReply)
- `fortunecards.client/src/app/components/Comments/comment-item/comment-item.component.spec.ts`
- (No migration; no DTO shape change; `comments-section` unchanged.)
