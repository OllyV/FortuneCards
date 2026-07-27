using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class DeckService : IDeckService
    {
        private static string DeckKey(int id) => $"decks:{id}";
        private static string MineKey(int userId) => $"decks:mine:{userId}";

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IImageStorage _imageStorage;
        private readonly TimeSpan DeckCacheDuration;
        private readonly TimeSpan PublicDeckCacheDuration;

        public DeckService(FortuneCardsDbContext db, IMemoryCache cache, IImageStorage imageStorage, IConfiguration config)
        {
            _db = db;
            _cache = cache;
            _imageStorage = imageStorage;
            DeckCacheDuration = TimeSpan.FromMinutes(config.GetValue("DeckCache:DeckDurationMinutes", 15));
            PublicDeckCacheDuration = TimeSpan.FromMinutes(config.GetValue("DeckCache:PublicDurationMinutes", 5));
        }

        public async Task<PagedResult<DeckSummary>> GetPublicAsync(string? search, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var hasSearch = !string.IsNullOrWhiteSpace(search);
            var version = PublicDeckCache.Version(_cache);

            if (!hasSearch &&
                _cache.TryGetValue(PublicDeckCache.PageKey(version, page, pageSize), out PagedResult<DeckSummary>? cached) &&
                cached is not null)
                return cached;

            var baseUrl = _imageStorage.PublicBaseUrl;
            var query = _db.Decks.Where(d => d.IsPublic);
            if (hasSearch)
            {
                var term = search!.Trim();
                query = query.Where(d => d.Name.Contains(term) || (d.Description != null && d.Description.Contains(term)));
            }

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(d => d.CreatedAt).ThenByDescending(d => d.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    true, false,
                    d.AspectWidth, d.AspectHeight, false))
                .ToListAsync();

            var result = new PagedResult<DeckSummary>(items, total, page, pageSize);
            if (!hasSearch)
                _cache.Set(PublicDeckCache.PageKey(version, page, pageSize), result, PublicDeckCacheDuration);
            return result;
        }

        public async Task<IEnumerable<DeckSummary>> GetMineAsync(int userId)
        {
            if (_cache.TryGetValue(MineKey(userId), out IEnumerable<DeckSummary>? cached) && cached is not null)
                return cached;

            var baseUrl = _imageStorage.PublicBaseUrl;
            var decks = await _db.Decks
                .Where(d => d.UserId == userId || d.FavoritedBy.Any(f => f.UserId == userId))
                .OrderByDescending(d => d.CreatedAt).ThenByDescending(d => d.Id)
                .Select(d => new DeckSummary(
                    d.Id, d.Name, d.Description, d.CreatedAt, d.Cards.Count,
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
                .ToListAsync();

            // Per-user cache: only the current user's own writes evict it (below).
            // Staleness from another user editing a favourited deck is accepted — the
            // stale DeckSummary fields are cosmetic and self-heal at the TTL.
            _cache.Set(MineKey(userId), decks, DeckCacheDuration);
            return decks;
        }

        public async Task<DeckDetail?> GetByIdAsync(int id, int? userId = null)
        {
            if (userId == null && _cache.TryGetValue(DeckKey(id), out DeckDetail? cached) && cached is not null)
                return cached;

            var baseUrl = _imageStorage.PublicBaseUrl;
            var deck = await _db.Decks
                .Where(d => d.Id == id && (d.IsPublic || d.UserId == userId))
                .Select(d => new DeckDetail(
                    d.Id, d.Name, d.Description, d.CreatedAt,
                    d.Cards.Select(c => new CardDto(c.Id, c.Title, c.Description,
                        baseUrl + "/" + c.ImageKey, c.CreatedAt)),
                    d.Emoji, d.ColorIndex,
                    d.CardBackImageKey == null ? null : baseUrl + "/" + d.CardBackImageKey,
                    d.IsPublic, d.UserId == userId,
                    d.AspectWidth, d.AspectHeight, d.FavoritedBy.Any(f => f.UserId == userId)))
                .FirstOrDefaultAsync();

            if (deck is not null && userId == null)
                _cache.Set(DeckKey(id), deck, DeckCacheDuration);

            return deck;
        }

        public async Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int aspectWidth, int aspectHeight, int userId)
        {
            string? cardBackImageKey = null;
            if (cardBackImage is { Length: > 0 })
                cardBackImageKey = await _imageStorage.SaveAsync(cardBackImage);

            var deck = new Deck
            {
                Name = name,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                CardBackImageKey = cardBackImageKey,
                AspectWidth = Math.Clamp(aspectWidth, 1, 100),
                AspectHeight = Math.Clamp(aspectHeight, 1, 100),
                UserId = userId,
                IsPublic = isPublic
            };
            _db.Decks.Add(deck);
            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(MineKey(userId));

            return new DeckSummary(deck.Id, deck.Name, deck.Description, deck.CreatedAt, 0,
                deck.Emoji, deck.ColorIndex, _imageStorage.PublicUrl(deck.CardBackImageKey), deck.IsPublic, true,
                deck.AspectWidth, deck.AspectHeight, false);
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var deck = await _db.Decks.FindAsync(id);
            if (deck is null || deck.UserId != userId) return false;

            if (deck.CardBackImageKey is not null)
                await _imageStorage.DeleteAsync(deck.CardBackImageKey);

            _db.Decks.Remove(deck);
            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(id));
            _cache.Remove(MineKey(userId));
            return true;
        }

        public async Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || deck.UserId != userId) return null;

            var imageKey = await _imageStorage.SaveAsync(image);

            var card = new Card
            {
                Title = title,
                Description = description,
                ImageKey = imageKey,
                DeckId = deckId
            };
            _db.Cards.Add(card);
            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(deckId));
            _cache.Remove(MineKey(userId));

            return new CardDto(card.Id, card.Title, card.Description,
                _imageStorage.PublicUrl(card.ImageKey)!, card.CreatedAt);
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
                if (deck.CardBackImageKey is not null) await _imageStorage.DeleteAsync(deck.CardBackImageKey);
                deck.CardBackImageKey = await _imageStorage.SaveAsync(cardBackImage);
            }

            await _db.SaveChangesAsync();
            PublicDeckCache.Bump(_cache);
            _cache.Remove(DeckKey(deckId));
            _cache.Remove(MineKey(userId));

            return await GetByIdAsync(deckId, userId);
        }

        public async Task<bool> AddFavoriteAsync(int deckId, int userId)
        {
            var deck = await _db.Decks.FindAsync(deckId);
            if (deck is null || !deck.IsPublic || deck.UserId == userId) return false;

            var exists = await _db.FavoriteDecks
                .AnyAsync(f => f.UserId == userId && f.DeckId == deckId);
            if (!exists)
            {
                _db.FavoriteDecks.Add(new FavoriteDeck { UserId = userId, DeckId = deckId });
                await _db.SaveChangesAsync();
                _cache.Remove(MineKey(userId));
            }
            return true;
        }

        public async Task<bool> RemoveFavoriteAsync(int deckId, int userId)
        {
            var favorite = await _db.FavoriteDecks
                .FirstOrDefaultAsync(f => f.UserId == userId && f.DeckId == deckId);
            if (favorite is null) return false;

            _db.FavoriteDecks.Remove(favorite);
            await _db.SaveChangesAsync();
            _cache.Remove(MineKey(userId));
            return true;
        }
    }
}
