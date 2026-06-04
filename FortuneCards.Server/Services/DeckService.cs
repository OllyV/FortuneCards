using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class DeckService : IDeckService
    {
        private const string AllDecksKey = "decks:all";
        private static string DeckKey(int id) => $"decks:{id}";
        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IWebHostEnvironment _env;

        public DeckService(FortuneCardsDbContext db, IMemoryCache cache, IWebHostEnvironment env)
        {
            _db = db;
            _cache = cache;
            _env = env;
        }

        public async Task<IEnumerable<DeckSummary>> GetAllAsync()
        {
            if (_cache.TryGetValue(AllDecksKey, out IEnumerable<DeckSummary>? cached) && cached is not null)
                return cached;

            var decks = await _db.Decks
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl))
                .ToListAsync();

            _cache.Set(AllDecksKey, decks, CacheDuration);
            return decks;
        }

        public async Task<DeckDetail?> GetByIdAsync(int id)
        {
            if (_cache.TryGetValue(DeckKey(id), out DeckDetail? cached) && cached is not null)
                return cached;

            var deck = await _db.Decks
                .Where(d => d.Id == id)
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description, c.ImageUrl, c.CreatedAt)),
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl))
                .FirstOrDefaultAsync();

            if (deck is not null)
                _cache.Set(DeckKey(id), deck, CacheDuration);

            return deck;
        }

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage)
        {
            string? cardBackImageUrl = null;
            if (cardBackImage is { Length: > 0 })
            {
                var imagesDir = Path.Combine(_env.WebRootPath, "images");
                Directory.CreateDirectory(imagesDir);
                var ext = Path.GetExtension(cardBackImage.FileName);
                var fileName = $"{Guid.NewGuid()}{ext}";
                using var stream = File.Create(Path.Combine(imagesDir, fileName));
                await cardBackImage.CopyToAsync(stream);
                cardBackImageUrl = $"/images/{fileName}";
            }

            var deck = new Deck
            {
                Name = name,
                Description = description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageUrl = cardBackImageUrl
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null) return false;
            _db.Decks.Remove(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(id));
            return true;
        }

        public async Task<CardDto> AddCardAsync(int deckId, string title, string description, IFormFile image)
        {
            var imagesDir = Path.Combine(_env.WebRootPath, "images");
            Directory.CreateDirectory(imagesDir);
            var ext = Path.GetExtension(image.FileName);
            var fileName = $"{Guid.NewGuid()}{ext}";
            using (var stream = File.Create(Path.Combine(imagesDir, fileName)))
                await image.CopyToAsync(stream);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageUrl = $"/images/{fileName}",
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }
    }
}
