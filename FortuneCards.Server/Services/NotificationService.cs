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
