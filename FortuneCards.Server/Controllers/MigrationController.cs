using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using FortuneCards.Server.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace FortuneCards.Server.Controllers
{
    // TEMPORARY: one-time migration of local wwwroot/images files into blob storage.
    // Remove this controller (and the EnableImageMigration flag) after it has been run
    // once per environment.
    [ApiController]
    [Route("api/admin")]
    public class MigrationController : ControllerBase
    {
        private const string AllDecksKey = "decks:all";

        private readonly BlobContainerClient _container;
        private readonly FortuneCardsDbContext _db;
        private readonly IMemoryCache _cache;
        private readonly IConfiguration _config;
        private readonly IWebHostEnvironment _env;

        public MigrationController(
            BlobContainerClient container,
            FortuneCardsDbContext db,
            IMemoryCache cache,
            IConfiguration config,
            IWebHostEnvironment env)
        {
            _container = container;
            _db = db;
            _cache = cache;
            _config = config;
            _env = env;
        }

        [HttpPost("migrate-images")]
        public async Task<IActionResult> MigrateImages()
        {
            if (!_config.GetValue<bool>("EnableImageMigration")) return NotFound();
            if (HttpContext.Items["UserId"] is not int) return Unauthorized();

            var imagesDir = Path.Combine(_env.WebRootPath, "images");
            var contentTypes = new FileExtensionContentTypeProvider();
            var urlByFileName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var uploaded = 0;
            var skipped = 0;

            if (Directory.Exists(imagesDir))
            {
                foreach (var path in Directory.EnumerateFiles(imagesDir))
                {
                    var fileName = Path.GetFileName(path);
                    var blob = _container.GetBlobClient(fileName);
                    urlByFileName[fileName] = blob.Uri.ToString();

                    if (await blob.ExistsAsync())
                    {
                        skipped++;
                        continue;
                    }

                    if (!contentTypes.TryGetContentType(fileName, out var contentType))
                        contentType = "application/octet-stream";

                    await using var stream = System.IO.File.OpenRead(path);
                    await blob.UploadAsync(stream, new BlobUploadOptions
                    {
                        HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
                    });
                    uploaded++;
                }
            }

            var affectedDeckIds = new HashSet<int>();

            var cards = await _db.Cards
                .Where(c => c.ImageUrl.StartsWith("/images/"))
                .ToListAsync();
            var cardsUpdated = 0;
            foreach (var card in cards)
            {
                var name = Path.GetFileName(card.ImageUrl);
                if (urlByFileName.TryGetValue(name, out var url))
                {
                    card.ImageUrl = url;
                    affectedDeckIds.Add(card.DeckId);
                    cardsUpdated++;
                }
            }

            var decks = await _db.Decks
                .Where(d => d.CardBackImageUrl != null && d.CardBackImageUrl.StartsWith("/images/"))
                .ToListAsync();
            var decksUpdated = 0;
            foreach (var deck in decks)
            {
                var name = Path.GetFileName(deck.CardBackImageUrl!);
                if (urlByFileName.TryGetValue(name, out var url))
                {
                    deck.CardBackImageUrl = url;
                    affectedDeckIds.Add(deck.Id);
                    decksUpdated++;
                }
            }

            await _db.SaveChangesAsync();

            // Invalidate cached deck data so rewritten URLs are served immediately.
            _cache.Remove(AllDecksKey);
            foreach (var deckId in affectedDeckIds)
                _cache.Remove($"decks:{deckId}");

            return Ok(new { uploaded, skipped, cardsUpdated, decksUpdated });
        }
    }
}
