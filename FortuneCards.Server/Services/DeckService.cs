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
        private readonly IImageStorage _imageStorage;

        public DeckService(FortuneCardsDbContext db, IMemoryCache cache, IImageStorage imageStorage)
        {
            _db = db;
            _cache = cache;
            _imageStorage = imageStorage;
        }

        public async Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null)
        {
            if (userId == null)
            {
                if (_cache.TryGetValue(AllDecksKey, out IEnumerable<DeckSummary>? cached) && cached is not null)
                    return cached;

                var publicDecks = await _db.Decks
                    .Where(d => d.IsPublic)
                    .Select(d => new DeckSummary(
                        d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                        d.Emoji, d.ColorIndex, d.CardBackImageUrl, true, false,
                        d.AspectWidth, d.AspectHeight))
                    .ToListAsync();

                _cache.Set(AllDecksKey, publicDecks, CacheDuration);
                return publicDecks;
            }

            return await _db.Decks
                .Where(d => d.IsPublic || d.UserId == userId)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight))
                .ToListAsync();
        }

        public async Task<DeckDetail?> GetByIdAsync(int id, int? userId = null)
        {
            if (userId == null && _cache.TryGetValue(DeckKey(id), out DeckDetail? cached) && cached is not null)
                return cached;

            var deck = await _db.Decks
                .Where(d => d.Id == id && (d.IsPublic || d.UserId == userId))
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description, c.ImageUrl, c.CreatedAt)),
                    d.Emoji, d.ColorIndex, d.CardBackImageUrl, d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight))
                .FirstOrDefaultAsync();

            if (deck is not null && userId == null)
                _cache.Set(DeckKey(id), deck, CacheDuration);

            return deck;
        }

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int aspectWidth, int aspectHeight, int userId)
        {
            string? cardBackImageUrl = null;
            if (cardBackImage is { Length: > 0 })
                cardBackImageUrl = await _imageStorage.SaveAsync(cardBackImage);

            var deck = new Deck
            {
                Name = name,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageUrl = cardBackImageUrl,
                AspectWidth = Math.Clamp(aspectWidth, 1, 100),
                AspectHeight = Math.Clamp(aspectHeight, 1, 100),
                UserId = userId,
                IsPublic = isPublic
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, deck.CardBackImageUrl, deck.IsPublic, true,
                deck.AspectWidth, deck.AspectHeight);
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null || deck.UserId != userId) return false;

            if (deck.CardBackImageUrl is not null)
                await _imageStorage.DeleteAsync(deck.CardBackImageUrl);

            _db.Decks.Remove(deck);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(id));
            return true;
        }

        public async Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return null;

            var imageUrl = await _imageStorage.SaveAsync(image);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageUrl = imageUrl,
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return new CardDto(card.Id, card.Title, card.Description, card.ImageUrl, card.CreatedAt);
        }

        public async Task<DeckDetail?> UpdateAsync(int deckId, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, IFormFile? cardBackImage, int? aspectWidth, int? aspectHeight, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return null;

            if (!string.IsNullOrWhiteSpace(name)) deck.Name = name;
            if (!string.IsNullOrWhiteSpace(emoji)) deck.Emoji = emoji;
            if (colorIndex.HasValue) deck.ColorIndex = colorIndex.Value;
            if (isPublic.HasValue) deck.IsPublic = isPublic.Value;
            if (aspectWidth.HasValue) deck.AspectWidth = Math.Clamp(aspectWidth.Value, 1, 100);
            if (aspectHeight.HasValue) deck.AspectHeight = Math.Clamp(aspectHeight.Value, 1, 100);
            // Edit form always submits the full description; empty clears it.
            deck.Description = string.IsNullOrWhiteSpace(description) ? null : description;

            if (cardBackImage is { Length: > 0 })
            {
                if (deck.CardBackImageUrl is not null) await _imageStorage.DeleteAsync(deck.CardBackImageUrl);
                deck.CardBackImageUrl = await _imageStorage.SaveAsync(cardBackImage);
            }

            await _db.SaveChangesAsync();
            _cache.Remove(AllDecksKey);
            _cache.Remove(DeckKey(deckId));

            return await GetByIdAsync(deckId, userId);
        }
    }
}
