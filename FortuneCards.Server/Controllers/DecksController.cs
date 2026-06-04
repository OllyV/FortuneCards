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

        [HttpGet]
        public async Task<IActionResult> GetDecks() =>
            Ok(await _decks.GetAllAsync());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetDeck(int id)
        {
            var deck = await _decks.GetByIdAsync(id);
            return deck is null ? NotFound() : Ok(deck);
        }

        [HttpPost]
        public async Task<IActionResult> CreateDeck([FromForm] CreateDeckRequest request)
        {
            var deck = await _decks.CreateAsync(
                request.Name,
                request.Description,
                request.Emoji ?? "🎴",
                request.ColorIndex ?? 0,
                request.CardBackImage);
            return CreatedAtAction(nameof(GetDeck), new { id = deck.Id }, deck);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDeck(int id) =>
            await _decks.DeleteAsync(id) ? NoContent() : NotFound();

        [HttpPost("{id}/cards")]
        public async Task<IActionResult> AddCard(int id, [FromForm] AddCardRequest request)
        {
            var deck = await _decks.GetByIdAsync(id);
            if (deck is null) return NotFound();
            if (request.Image is null || request.Image.Length == 0)
                return BadRequest("Image file is required.");
            var card = await _decks.AddCardAsync(id, request.Title, request.Description, request.Image);
            return CreatedAtAction(nameof(GetDeck), new { id }, card);
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
}
