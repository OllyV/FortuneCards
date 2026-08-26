using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Services
{
    public class CommentService : ICommentService
    {
        public const int MaxBodyLength = 2000;

        /// <summary>Deepest tier a stored reply may occupy (top-level = 0, so 3 = three tiers of replies).</summary>
        public const int MaxReplyDepth = 3;

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

            // The comment the user actually replied to (drives the Reply notification), and the
            // parent we will store (clamped so the tree never exceeds MaxReplyDepth).
            Comment? repliedTo = null;
            int? storedParentId = null;
            if (parentCommentId is int pid)
            {
                repliedTo = await _db.Comments.FirstOrDefaultAsync(c => c.Id == pid);
                if (repliedTo is null || repliedTo.TargetType != targetType || repliedTo.TargetId != targetId)
                    throw new ArgumentException("Invalid parent comment.", nameof(parentCommentId));
                if (repliedTo.IsDeleted)
                    throw new ArgumentException("Cannot reply to a deleted comment.", nameof(parentCommentId));

                // Clamp: if replying here would exceed the cap, attach as a sibling of the target
                // (store its parent) so the reply lands at the deepest allowed tier.
                var depth = await DepthOfAsync(repliedTo);
                storedParentId = depth + 1 <= MaxReplyDepth ? repliedTo.Id : repliedTo.ParentCommentId;
            }

            var comment = new Comment
            {
                TargetType = targetType,
                TargetId = targetId,
                ParentCommentId = storedParentId,
                UserId = userId,
                Body = trimmed,
            };
            _db.Comments.Add(comment);
            await _db.SaveChangesAsync();  // assigns comment.Id

            // Fire notifications (no self-notify).
            if (repliedTo is not null)
            {
                // Notify the author of the comment actually replied to, even if the stored parent was clamped.
                if (repliedTo.UserId is int recipient && recipient != userId)
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
                .ToListAsync();

            // Load the page's subtrees level by level (bounded by MaxReplyDepth), so only the
            // returned roots' descendants are fetched — no full-thread scan, no unbounded recursion.
            var childrenByParent = new Dictionary<int, List<Comment>>();
            var frontier = tops.Select(c => c.Id).ToList();
            for (var level = 0; level < MaxReplyDepth && frontier.Count > 0; level++)
            {
                var parentIds = frontier;
                var children = await _db.Comments
                    .Where(c => c.ParentCommentId != null && parentIds.Contains(c.ParentCommentId.Value))
                    .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
                    .Include(c => c.User)
                    .ToListAsync();

                frontier = new List<int>(children.Count);
                foreach (var child in children)
                {
                    var pid = child.ParentCommentId!.Value;
                    if (!childrenByParent.TryGetValue(pid, out var list))
                        childrenByParent[pid] = list = new List<Comment>();
                    list.Add(child);
                    frontier.Add(child.Id);
                }
            }

            var items = tops.Select(top => BuildTree(top, childrenByParent, currentUserId)).ToList();
            return new PagedResult<CommentDto>(items, total, page, pageSize);
        }

        /// <summary>Recursively builds a comment DTO with its (oldest-first) descendants attached.</summary>
        private CommentDto BuildTree(Comment comment, Dictionary<int, List<Comment>> childrenByParent, int? currentUserId)
        {
            var replies = childrenByParent.TryGetValue(comment.Id, out var kids)
                ? kids.Select(k => BuildTree(k, childrenByParent, currentUserId)).ToList()
                : new List<CommentDto>();
            return ToDto(comment, comment.User, currentUserId, replies);
        }

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
                    c.Id, c.TargetType, c.TargetId, c.Body, c.IsDeleted,
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
            await _db.SaveChangesAsync();
            return true;
        }

        public async Task<bool> RestoreAsync(int commentId, int userId)
        {
            var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == commentId);
            if (comment is null || comment.UserId != userId || !comment.IsDeleted) return false;

            comment.IsDeleted = false;
            await _db.SaveChangesAsync();
            return true;
        }

        // --- helpers ---

        /// <summary>Ancestor count of a comment (top-level = 0). Bounded: stops once past the cap.</summary>
        private async Task<int> DepthOfAsync(Comment comment)
        {
            var depth = 0;
            var parentId = comment.ParentCommentId;
            while (parentId is int pid && depth <= MaxReplyDepth)
            {
                depth++;
                parentId = await _db.Comments.Where(c => c.Id == pid)
                    .Select(c => c.ParentCommentId).FirstOrDefaultAsync();
            }
            return depth;
        }

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

        internal CommentDto ToDto(Comment c, User? author, int? currentUserId, IReadOnlyList<CommentDto> replies)
        {
            var descendantCount = replies.Count;
            foreach (var r in replies) descendantCount += r.ReplyCount;   // total subtree, not just direct children
            return new(c.Id, c.TargetType, c.TargetId, c.ParentCommentId,
                c.IsDeleted ? null : c.Body, c.IsDeleted, c.CreatedAt, c.EditedAt,
                c.UserId, UserDisplay.Name(author), UserDisplay.AvatarUrl(author, _imageStorage),
                currentUserId != null && c.UserId == currentUserId,
                descendantCount, replies);
        }
    }
}
