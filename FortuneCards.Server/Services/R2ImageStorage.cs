using Amazon.S3;
using Amazon.S3.Model;

namespace FortuneCards.Server.Services
{
    public class R2ImageStorage : IImageStorage
    {
        // Object keys are content-addressed GUIDs: a replaced image gets a new key and the
        // old object is deleted, so every URL is immutable. That lets the browser cache each
        // image forever and never revalidate, which stops decks re-fetching every card image
        // on each re-navigation. Keep this in sync with tools/CacheControlBackfill (which
        // stamps the same header onto objects uploaded before this was added).
        public const string ImageCacheControl = "public, max-age=31536000, immutable";

        private readonly IAmazonS3 _s3;
        private readonly string _bucket;

        public string PublicBaseUrl { get; }

        public R2ImageStorage(IAmazonS3 s3, R2Options options)
        {
            _s3 = s3;
            _bucket = options.Bucket;
            PublicBaseUrl = options.PublicBaseUrl.TrimEnd('/');
        }

        public async Task<string> SaveAsync(IFormFile file)
        {
            var ext = Path.GetExtension(file.FileName);
            var key = $"{Guid.NewGuid()}{ext}";
            await using var stream = file.OpenReadStream();
            await _s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = _bucket,
                Key = key,
                InputStream = stream,
                ContentType = file.ContentType,
                Headers = { CacheControl = ImageCacheControl },
                DisablePayloadSigning = true // R2 streaming-upload compatibility
            });
            return key;
        }

        public async Task DeleteAsync(string key)
        {
            var name = ExtractKey(key);
            if (name is null) return;
            await _s3.DeleteObjectAsync(_bucket, name);
        }

        public string? PublicUrl(string? key)
            => string.IsNullOrWhiteSpace(key) ? null : $"{PublicBaseUrl}/{key}";

        // Bare key, or the last path segment of a legacy absolute URL.
        public static string? ExtractKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var name = Uri.TryCreate(value, UriKind.Absolute, out var uri)
                ? Path.GetFileName(uri.AbsolutePath)
                : Path.GetFileName(value);
            return string.IsNullOrWhiteSpace(name) ? null : name;
        }
    }
}
