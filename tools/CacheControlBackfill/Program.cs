using System.Net;
using Amazon.S3;
using Amazon.S3.Model;

// One-off backfill: stamp Cache-Control onto R2 objects uploaded before R2ImageStorage
// started setting it. Re-uploads each object in place (same key, same content type) with
// the immutable cache header. Idempotent — objects that already carry the header are skipped.
//
// Keep TargetCacheControl in sync with R2ImageStorage.ImageCacheControl (this tool does not
// reference the server, so the value is duplicated deliberately).
const string TargetCacheControl = "public, max-age=31536000, immutable";

static string Env(string name) =>
    Environment.GetEnvironmentVariable(name)
    ?? throw new InvalidOperationException($"Set {name} env var.");

var accountId = Env("R2_ACCOUNT_ID");
var accessKey = Env("R2_ACCESS_KEY");
var secretKey = Env("R2_SECRET_KEY");
var bucket = Env("R2_BUCKET");

var s3 = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
{
    ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
    ForcePathStyle = true,
    AuthenticationRegion = "auto"
});

int updated = 0, skipped = 0, vanished = 0;
string? token = null;
do
{
    var list = await s3.ListObjectsV2Async(new ListObjectsV2Request
    {
        BucketName = bucket,
        ContinuationToken = token
    });

    foreach (var obj in list.S3Objects)
    {
        // The app serves this same bucket and deletes keys when an image is replaced, so an
        // object listed above can be gone by the time we reach it. Tolerate that race (skip
        // and continue) rather than aborting the whole run — mirrors ImageMigrator.
        try
        {
            var meta = await s3.GetObjectMetadataAsync(bucket, obj.Key);
            if (meta.Headers.CacheControl == TargetCacheControl) { skipped++; continue; }

            // Re-PUT in place: fetch bytes + content type, upload same key with the header.
            // (PutObject with DisablePayloadSigning is the proven-on-R2 path; see ImageMigrator.)
            // Only ContentType is carried over — SaveAsync sets no other object metadata, and
            // images are small, so buffering the body in memory is fine.
            using var get = await s3.GetObjectAsync(bucket, obj.Key);
            using var ms = new MemoryStream();
            await get.ResponseStream.CopyToAsync(ms);
            ms.Position = 0;

            await s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = obj.Key,
                InputStream = ms,
                ContentType = get.Headers.ContentType,
                Headers = { CacheControl = TargetCacheControl },
                DisablePayloadSigning = true
            });
            updated++;
            Console.WriteLine($"stamped {obj.Key} ({get.Headers.ContentType})");
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            vanished++; // deleted between listing and processing — nothing to stamp
        }
    }

    token = list.IsTruncated == true ? list.NextContinuationToken : null;
}
while (token is not null);

Console.WriteLine($"Cache-Control backfill complete — updated: {updated}, skipped (already set): {skipped}, vanished (deleted mid-run): {vanished}");
