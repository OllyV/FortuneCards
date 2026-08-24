using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/notifications")]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationService _notifications;

        public NotificationsController(INotificationService notifications) => _notifications = notifications;

        private int? CurrentUserId =>
            HttpContext.Items["UserId"] is int id ? id : null;

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(await _notifications.ListAsync(userId, page, pageSize));
        }

        [HttpGet("unread-count")]
        public async Task<IActionResult> UnreadCount()
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            return Ok(new { count = await _notifications.UnreadCountAsync(userId) });
        }

        [HttpPost("mark-read")]
        public async Task<IActionResult> MarkRead([FromBody] MarkReadRequest? request)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var marked = await _notifications.MarkReadAsync(userId, request?.Ids);
            return Ok(new { marked });
        }
    }

    public class MarkReadRequest
    {
        public List<int>? Ids { get; set; }
    }
}
