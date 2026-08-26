using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public record NotificationDto(
        int Id, NotificationType Type, bool IsRead, DateTime CreatedAt,
        int? ActorUserId, string ActorName, string? ActorAvatarUrl,
        int CommentId, CommentTargetType TargetType, int TargetId, string TargetRoute,
        string? CommentSnippet);

    public interface INotificationService
    {
        Task<PagedResult<NotificationDto>> ListAsync(int userId, int page, int pageSize);
        Task<int> UnreadCountAsync(int userId);
        Task<int> MarkReadAsync(int userId, IReadOnlyList<int>? ids);
    }
}
