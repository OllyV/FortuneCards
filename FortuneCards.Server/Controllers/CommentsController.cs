using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/comments")]
    public class CommentsController : ControllerBase
    {
        private readonly ICommentService _comments;

        public CommentsController(ICommentService comments) => _comments = comments;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] CommentTargetType targetType, [FromQuery] int targetId,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 20) =>
            Ok(await _comments.ListAsync(targetType, targetId, CurrentUserId, page, pageSize));

        [HttpGet("mine")]
        public async Task<IActionResult> Mine([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _comments.ListMineAsync(userId, page, pageSize));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateCommentRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            try
            {
                var dto = await _comments.CreateAsync(
                    request.TargetType, request.TargetId, request.ParentCommentId, request.Body ?? "", userId);
                return dto is null ? NotFound() : Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPatch("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateCommentRequest request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            try
            {
                var dto = await _comments.UpdateAsync(id, request.Body ?? "", userId);
                return dto is null ? NotFound() : Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _comments.DeleteAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
    }

    public class CreateCommentRequest
    {
        public CommentTargetType TargetType { get; set; }
        public int TargetId { get; set; }
        public int? ParentCommentId { get; set; }
        public string? Body { get; set; }
    }

    public class UpdateCommentRequest
    {
        public string? Body { get; set; }
    }
}
