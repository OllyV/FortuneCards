using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    public class PatternService : IPatternService
    {
        private static string PatternKey(int id) => $"patterns:{id}";
        private static string MineKey(int userId) => $"patterns:mine:{userId}";

        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly TimeSpan PatternCacheDuration;
        private readonly TimeSpan PublicPatternCacheDuration;

        public PatternService(FortuneCardsDbContext db, IMemoryCache cache, IConfiguration config)
        {
            _db = db;
            _cache = cache;
            PatternCacheDuration = TimeSpan.FromMinutes(config.GetValue("PatternCache:PatternDurationMinutes", 15));
            PublicPatternCacheDuration = TimeSpan.FromMinutes(config.GetValue("PatternCache:PublicDurationMinutes", 5));
        }

        public async Task<PagedResult<PatternSummary>> GetPublicAsync(string? search, int page, int pageSize)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var hasSearch = !string.IsNullOrWhiteSpace(search);
            var version = PublicPatternCache.Version(_cache);

            if (!hasSearch &&
                _cache.TryGetValue(PublicPatternCache.PageKey(version, page, pageSize), out PagedResult<PatternSummary>? cached) &&
                cached is not null)
                return cached;

            var query = _db.Patterns.Where(p => p.IsPublic);
            if (hasSearch)
            {
                var term = search!.Trim();
                query = query.Where(p => p.Name.Contains(term) || (p.Description != null && p.Description.Contains(term)));
            }

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(p => new PatternSummary(
                    p.Id, p.Name, p.Description, p.CreatedAt, p.Cards.Count,
                    p.Emoji, p.ColorIndex, true, false, false))
                .ToListAsync();

            var result = new PagedResult<PatternSummary>(items, total, page, pageSize);
            if (!hasSearch)
                _cache.Set(PublicPatternCache.PageKey(version, page, pageSize), result, PublicPatternCacheDuration);
            return result;
        }

        public async Task<IEnumerable<PatternSummary>> GetMineAsync(int userId)
        {
            if (_cache.TryGetValue(MineKey(userId), out IEnumerable<PatternSummary>? cached) && cached is not null)
                return cached;

            var patterns = await _db.Patterns
                .Where(p => p.UserId == userId || p.FavoritedBy.Any(f => f.UserId == userId))
                .OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
                .Select(p => new PatternSummary(
                    p.Id, p.Name, p.Description, p.CreatedAt, p.Cards.Count,
                    p.Emoji, p.ColorIndex, p.IsPublic, p.UserId == userId,
                    p.FavoritedBy.Any(f => f.UserId == userId)))
                .ToListAsync();

            _cache.Set(MineKey(userId), patterns, PatternCacheDuration);
            return patterns;
        }

        public async Task<PatternDetail?> GetByIdAsync(int id, int? userId = null)
        {
            if (userId == null && _cache.TryGetValue(PatternKey(id), out PatternDetail? cached) && cached is not null)
                return cached;

            var pattern = await _db.Patterns
                .Where(p => p.Id == id && (p.IsPublic || p.UserId == userId))
                .Select(p => new PatternDetail(
                    p.Id, p.Name, p.Description, p.CreatedAt,
                    p.Cards.OrderBy(c => c.Order)
                        .Select(c => new PatternCardDto(c.Id, c.Text, c.Order, c.X, c.Y, c.Rotation)),
                    p.Emoji, p.ColorIndex, p.IsPublic, p.UserId == userId,
                    p.FavoritedBy.Any(f => f.UserId == userId),
                    p.CardSizePercent, p.TableHeightPercent))
                .FirstOrDefaultAsync();

            if (pattern is not null && userId == null)
                _cache.Set(PatternKey(id), pattern, PatternCacheDuration);

            return pattern;
        }

        public async Task<PatternSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, int userId)
        {
            var pattern = new Pattern
            {
                Name = name,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Emoji = emoji,
                ColorIndex = colorIndex,
                IsPublic = isPublic,
                UserId = userId
            };
            _db.Patterns.Add(pattern);
            await _db.SaveChangesAsync();
            PublicPatternCache.Bump(_cache);
            _cache.Remove(MineKey(userId));

            return new PatternSummary(pattern.Id, pattern.Name, pattern.Description, pattern.CreatedAt, 0,
                pattern.Emoji, pattern.ColorIndex, pattern.IsPublic, true, false);
        }

        public async Task<PatternDetail?> UpdateAsync(int id, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, int? cardSizePercent, int? tableHeightPercent, int userId)
        {
            var pattern = await _db.Patterns.FindAsync(id);
            if (pattern is null || pattern.UserId != userId) return null;

            if (!string.IsNullOrWhiteSpace(name)) pattern.Name = name;
            if (!string.IsNullOrWhiteSpace(emoji)) pattern.Emoji = emoji;
            if (colorIndex.HasValue) pattern.ColorIndex = colorIndex.Value;
            if (isPublic.HasValue) pattern.IsPublic = isPublic.Value;
            if (cardSizePercent.HasValue) pattern.CardSizePercent = Math.Clamp(cardSizePercent.Value, 5, 50);
            if (tableHeightPercent.HasValue) pattern.TableHeightPercent = Math.Max(0, tableHeightPercent.Value);
            // Edit form always submits the full description; empty clears it.
            pattern.Description = string.IsNullOrWhiteSpace(description) ? null : description;

            await _db.SaveChangesAsync();
            PublicPatternCache.Bump(_cache);
            _cache.Remove(PatternKey(id));
            _cache.Remove(MineKey(userId));

            return await GetByIdAsync(id, userId);
        }

        public async Task<bool> DeleteAsync(int id, int userId)
        {
            var pattern = await _db.Patterns.FindAsync(id);
            if (pattern is null || pattern.UserId != userId) return false;

            _db.Patterns.Remove(pattern);
            await _db.SaveChangesAsync();
            PublicPatternCache.Bump(_cache);
            _cache.Remove(PatternKey(id));
            _cache.Remove(MineKey(userId));
            return true;
        }

        public async Task<PatternDetail?> ReplaceCardsAsync(int patternId, IEnumerable<PatternCardInput> cards, int userId)
        {
            var pattern = await _db.Patterns.Include(p => p.Cards).FirstOrDefaultAsync(p => p.Id == patternId);
            if (pattern is null || pattern.UserId != userId) return null;

            _db.PatternCards.RemoveRange(pattern.Cards);

            var order = 1;
            foreach (var c in cards.OrderBy(c => c.Order))
            {
                pattern.Cards.Add(new PatternCard
                {
                    Text = c.Text,
                    Order = order++,
                    X = c.X,
                    Y = c.Y,
                    Rotation = c.Rotation,
                    PatternId = patternId
                });
            }

            await _db.SaveChangesAsync();
            PublicPatternCache.Bump(_cache);
            _cache.Remove(PatternKey(patternId));
            _cache.Remove(MineKey(userId));

            return await GetByIdAsync(patternId, userId);
        }

        public async Task<bool> AddFavoriteAsync(int patternId, int userId)
        {
            var pattern = await _db.Patterns.FindAsync(patternId);
            if (pattern is null || !pattern.IsPublic || pattern.UserId == userId) return false;

            var exists = await _db.FavoritePatterns
                .AnyAsync(f => f.UserId == userId && f.PatternId == patternId);
            if (!exists)
            {
                _db.FavoritePatterns.Add(new FavoritePattern { UserId = userId, PatternId = patternId });
                await _db.SaveChangesAsync();
                _cache.Remove(MineKey(userId));
            }
            return true;
        }

        public async Task<bool> RemoveFavoriteAsync(int patternId, int userId)
        {
            var favorite = await _db.FavoritePatterns
                .FirstOrDefaultAsync(f => f.UserId == userId && f.PatternId == patternId);
            if (favorite is null) return false;

            _db.FavoritePatterns.Remove(favorite);
            await _db.SaveChangesAsync();
            _cache.Remove(MineKey(userId));
            return true;
        }
    }
}
