using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Services
{
    /// <summary>
    /// Shared cache-key contract for the user-agnostic public decks list.
    /// The version counter is bumped whenever a write changes the public list;
    /// bumping orphans all cached page entries, which then expire by TTL.
    /// </summary>
    internal static class PublicDeckCache
    {
        public const string VersionKey = "decks:public:version";
        public static int Version(IMemoryCache cache) => cache.TryGetValue(VersionKey, out int v) ? v : 0;
        public static void Bump(IMemoryCache cache) => cache.Set(VersionKey, Version(cache) + 1);
        public static string PageKey(int version, int page, int pageSize) => $"decks:public:v{version}:p{page}:s{pageSize}";
    }
}
