using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/decks")]
    public class DecksController : ControllerBase
    {
        private readonly IDeckService _decks;

        public DecksController(IDeckService decks) => _decks = decks;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> GetDecks() =>
            Ok(await _decks.GetAllAsync(CurrentUserId));

        [HttpGet("{id}")]
        public async Task<IActionResult> GetDeck(int id)
        {
            var deck = await _decks.GetByIdAsync(id, CurrentUserId);
            return deck is null ? NotFound() : Ok(deck);
        }

        [HttpPost]
        public async Task<IActionResult> CreateDeck([FromForm] CreateDeckRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var deck = await _decks.CreateAsync(
                request.Name, request.Description,
                request.Emoji ?? "🎴", request.ColorIndex ?? 0,
                request.IsPublic ?? false,
                request.CardBackImage,
                request.AspectWidth ?? 3, request.AspectHeight ?? 5,
                userId);
            return CreatedAtAction(nameof(GetDeck), new { id = deck.Id }, deck);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDeck(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var result = await _decks.DeleteAsync(id, userId);
            return result ? NoContent() : NotFound();
        }

        [HttpPost("{id}/cards")]
        public async Task<IActionResult> AddCard(int id, [FromForm] AddCardRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            if (request.Image is null || request.Image.Length == 0)
                return BadRequest("Image file is required.");
            var card = await _decks.AddCardAsync(id, request.Title, request.Description, request.Image, userId);
            if (card is null) return NotFound();
            return CreatedAtAction(nameof(GetDeck), new { id }, card);
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateDeck(int id, [FromForm] UpdateDeckRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var deck = await _decks.UpdateAsync(
                id, request.Name, request.Description, request.Emoji,
                request.ColorIndex, request.IsPublic, request.CardBackImage,
                request.AspectWidth, request.AspectHeight, userId);
            return deck is null ? NotFound() : Ok(deck);
        }

        [HttpPut("{id}/favorite")]
        public async Task<IActionResult> AddFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _decks.AddFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }

        [HttpDelete("{id}/favorite")]
        public async Task<IActionResult> RemoveFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _decks.RemoveFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
    }

    public class CreateDeckRequest
    {
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
        public IFormFile? CardBackImage { get; set; }
        public int? AspectWidth { get; set; }
        public int? AspectHeight { get; set; }
    }

    public class AddCardRequest
    {
        public required string Title { get; set; }
        public required string Description { get; set; }
        public IFormFile? Image { get; set; }
    }

    public class UpdateDeckRequest
    {
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
        public IFormFile? CardBackImage { get; set; }
        public int? AspectWidth { get; set; }
        public int? AspectHeight { get; set; }
    }
}
