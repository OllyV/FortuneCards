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
