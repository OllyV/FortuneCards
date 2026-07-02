using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/cards")]
    public class CardsController : ControllerBase
    {
        private readonly ICardService _cards;

        public CardsController(ICardService cards) => _cards = cards;

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCard(int id)
        {
            if (HttpContext.Items["UserId"] is not int userId) return Unauthorized();
            return await _cards.DeleteAsync(id, userId) ? NoContent() : NotFound();
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateCard(int id, [FromForm] UpdateCardRequest request)
        {
            if (HttpContext.Items["UserId"] is not int userId) return Unauthorized();
            var card = await _cards.UpdateAsync(id, request.Title, request.Description, request.Image, userId);
            return card is null ? NotFound() : Ok(card);
        }
    }

    public class UpdateCardRequest
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public IFormFile? Image { get; set; }
    }
}
