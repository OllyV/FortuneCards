using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/patterns")]
    public class PatternsController : ControllerBase
    {
        private readonly IPatternService _patterns;

        public PatternsController(IPatternService patterns) => _patterns = patterns;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet("public")]
        public async Task<IActionResult> GetPublic([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20) =>
            Ok(await _patterns.GetPublicAsync(search, page, pageSize));

        [HttpGet("mine")]
        public async Task<IActionResult> GetMine()
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _patterns.GetMineAsync(userId));
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetPattern(int id)
        {
            var pattern = await _patterns.GetByIdAsync(id, CurrentUserId);
            return pattern is null ? NotFound() : Ok(pattern);
        }

        [HttpPost]
        public async Task<IActionResult> CreatePattern([FromBody] CreatePatternRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var pattern = await _patterns.CreateAsync(
                request.Name, request.Description,
                request.Emoji ?? "🔮", request.ColorIndex ?? 0,
                request.IsPublic ?? false, userId);
            return CreatedAtAction(nameof(GetPattern), new { id = pattern.Id }, pattern);
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdatePattern(int id, [FromBody] UpdatePatternRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var pattern = await _patterns.UpdateAsync(
                id, request.Name, request.Description, request.Emoji,
                request.ColorIndex, request.IsPublic,
                request.CardSizePercent, request.TableHeightPercent, userId);
            return pattern is null ? NotFound() : Ok(pattern);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePattern(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var result = await _patterns.DeleteAsync(id, userId);
            return result ? NoContent() : NotFound();
        }

        [HttpPut("{id}/cards")]
        public async Task<IActionResult> ReplaceCards(int id, [FromBody] ReplacePatternCardsRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var pattern = await _patterns.ReplaceCardsAsync(id, request.Cards, userId);
            return pattern is null ? NotFound() : Ok(pattern);
        }

        [HttpPut("{id}/favorite")]
        public async Task<IActionResult> AddFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _patterns.AddFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }

        [HttpDelete("{id}/favorite")]
        public async Task<IActionResult> RemoveFavorite(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _patterns.RemoveFavoriteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
    }

    public class CreatePatternRequest
    {
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
    }

    public class UpdatePatternRequest
    {
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? Emoji { get; set; }
        public int? ColorIndex { get; set; }
        public bool? IsPublic { get; set; }
        public int? CardSizePercent { get; set; }
        public int? TableHeightPercent { get; set; }
    }

    public class ReplacePatternCardsRequest
    {
        public List<PatternCardInput> Cards { get; set; } = new();
    }
}
