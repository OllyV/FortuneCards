namespace FortuneCards.Server.Services
{
    public interface IImageStorage
    {
        // Base public URL for stored objects, e.g. https://pub-xxxx.r2.dev (no trailing slash).
        string PublicBaseUrl { get; }

        // Uploads the file and returns its object KEY (e.g. "{guid}.png"), not a URL.
        Task<string> SaveAsync(IFormFile file);

        // Deletes by key (tolerates a bare key or a legacy absolute URL). No-op if absent.
        Task DeleteAsync(string key);

        // Builds the absolute public URL for a key; null/empty key -> null.
        string? PublicUrl(string? key);
    }
}
