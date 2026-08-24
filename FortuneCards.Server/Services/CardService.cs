using FortuneCards.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class CardService : ICardService
    {
        private static string DeckKey(int id) => $"decks:{id}";

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IImageStorage _imageStorage;

        public CardService(FortuneCardsDbContext db, IMemoryCache cache, IImageStorage imageStorage)
        {
            _db = db;
            _cache = cache;
            _imageStorage = imageStorage;
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var card = await _db.Cards
                .Include(c => c.Deck)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (card is null || card.Deck?.UserId != userId) return false;

            await _imageStorage.DeleteAsync(card.ImageKey);

            var deckId = card.DeckId;
            await RemoveCommentsForCardAsync(id);
            _db.Cards.Remove(card);
            await _db.SaveChangesAsync();

            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(deckId));

            return true;
        }

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

        public async Task<CardDto?> UpdateAsync(int cardId, string? title, string? description, IFormFile? image, int userId)
        {
            var card = await _db.Cards
                .Include(c => c.Deck)
                .FirstOrDefaultAsync(c => c.Id == cardId);

            if (card is null || card.Deck?.UserId != userId) return null;

            if (!string.IsNullOrWhiteSpace(title)) card.Title = title;
            if (!string.IsNullOrWhiteSpace(description)) card.Description = description;

            if (image is { Length: > 0 })
            {
                await _imageStorage.DeleteAsync(card.ImageKey);
                card.ImageKey = await _imageStorage.SaveAsync(image);
            }

            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(card.DeckId));

            return new CardDto(card.Id, card.Title, card.Description,
                _imageStorage.PublicUrl(card.ImageKey)!, card.CreatedAt);
        }
    }
}
