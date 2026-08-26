using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public record CommentDto(
        int Id, CommentTargetType TargetType, int TargetId, int? ParentCommentId,
        string? Body, bool IsDeleted, DateTime CreatedAt, DateTime? EditedAt,
        int? AuthorUserId, string AuthorName, string? AuthorAvatarUrl, bool IsMine,
        int ReplyCount, IReadOnlyList<CommentDto> Replies);

    public record MyCommentDto(
        int Id, CommentTargetType TargetType, int TargetId, string? Body, bool IsDeleted,
        DateTime CreatedAt, DateTime? EditedAt, string TargetLabel, string TargetRoute);

    public interface ICommentService
    {
        Task<PagedResult<CommentDto>> ListAsync(CommentTargetType targetType, int targetId, int? currentUserId, int page, int pageSize);
        Task<PagedResult<MyCommentDto>> ListMineAsync(int userId, int page, int pageSize);
        Task<CommentDto?> CreateAsync(CommentTargetType targetType, int targetId, int? parentCommentId, string body, int userId);
        Task<CommentDto?> UpdateAsync(int commentId, string body, int userId);
        Task<bool> DeleteAsync(int commentId, int userId);
    }
}
