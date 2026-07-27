using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Azure.Storage.Blobs;
using Npgsql;

// One-off migration: Azure Blob images -> Cloudflare R2, then rewrite Aiven DB
// values from absolute Azure URLs to bare object keys. Idempotent.

static string Env(string name) =>
    Environment.GetEnvironmentVariable(name)
    ?? throw new InvalidOperationException($"Set {name} env var.");

var azureConn = Env("AZURE_BLOB_CONNECTION");
var azureContainer = Environment.GetEnvironmentVariable("AZURE_BLOB_CONTAINER") ?? "images";
var accountId = Env("R2_ACCOUNT_ID");
var accessKey = Env("R2_ACCESS_KEY");
var secretKey = Env("R2_SECRET_KEY");
var bucket = Env("R2_BUCKET");
var target = Env("TARGET_CONNECTION");

var container = new BlobContainerClient(azureConn, azureContainer);
var s3 = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
{
    ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
    ForcePathStyle = true,
    AuthenticationRegion = "auto"
});

// ---- 1. Copy blobs Azure -> R2 (skip ones already in R2) ----
int copied = 0, skipped = 0;
await foreach (var item in container.GetBlobsAsync())
{
    var key = item.Name;

    bool existsInR2 = true;
    try { await s3.GetObjectMetadataAsync(bucket, key); }
    catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound) { existsInR2 = false; }

    if (existsInR2) { skipped++; continue; }

    var blob = container.GetBlobClient(key);
    var download = await blob.DownloadContentAsync();
    using var ms = new MemoryStream(download.Value.Content.ToArray());
    await s3.PutObjectAsync(new PutObjectRequest
    {
        BucketName = bucket,
        Key = key,
        InputStream = ms,
        ContentType = download.Value.Details.ContentType,
        DisablePayloadSigning = true
    });
    copied++;
}
Console.WriteLine($"Blobs copied to R2: {copied}, skipped (already present): {skipped}");

// ---- 2. Rewrite DB values from absolute URL -> bare key (idempotent) ----
static async Task<int> RewriteAsync(NpgsqlConnection db, NpgsqlTransaction tx, string table, string col)
{
    // Strip everything up to and including the last '/', only for rows still holding a URL.
    var sql = $"UPDATE \"{table}\" SET \"{col}\" = regexp_replace(\"{col}\", '^.*/', '') " +
              $"WHERE \"{col}\" LIKE 'http%';";
    await using var cmd = new NpgsqlCommand(sql, db, tx);
    return await cmd.ExecuteNonQueryAsync();
}

await using var dst = new NpgsqlConnection(target);
await dst.OpenAsync();
await using (var tx = await dst.BeginTransactionAsync())
{
    int cardRows = await RewriteAsync(dst, tx, "Cards", "ImageKey");
    int deckRows = await RewriteAsync(dst, tx, "Decks", "CardBackImageKey");
    await tx.CommitAsync();
    Console.WriteLine($"DB rows rewritten to keys — Cards: {cardRows}, Decks: {deckRows}");
}

Console.WriteLine("Image migration complete.");
