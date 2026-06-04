using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/cards")]
    public class CardsController : ControllerBase
    {
        private readonly ICardService _cards;

        public CardsController(ICardService cards)
        {
            _cards = cards;
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCard(int id)
        {
            return await _cards.DeleteAsync(id) ? NoContent() : NotFound();
        }
    }
}
