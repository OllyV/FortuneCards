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
