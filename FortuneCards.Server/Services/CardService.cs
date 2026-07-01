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
