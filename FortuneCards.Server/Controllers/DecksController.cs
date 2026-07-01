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
                request.CardBackImage, userId);
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

        [HttpPatch("{id}/visibility")]
        public async Task<IActionResult> ToggleVisibility(int id, [FromBody] ToggleVisibilityRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var result = await _decks.ToggleVisibilityAsync(id, request.IsPublic, userId);
            return result ? NoContent() : NotFound();
        }
    }

    public class CreateDeckRequest
    {
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public IFormFile? CardBackImage { get; set; }
    }

    public class AddCardRequest
    {
        public required string Title { get; set; }
        public required string Description { get; set; }
        public IFormFile? Image { get; set; }
    }

    public class ToggleVisibilityRequest
    {
        public bool IsPublic { get; set; }
    }
}
