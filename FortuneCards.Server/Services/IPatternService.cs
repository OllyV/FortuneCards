namespace FortuneCards.Server.Services
{
    public record PatternSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, bool IsPublic, bool IsOwner, bool IsFavorite);

    public record PatternCardDto(int Id, string Text, int Order, double X, double Y, double Rotation);

    public record PatternDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<PatternCardDto> Cards,
        string Emoji, int ColorIndex, bool IsPublic, bool IsOwner, bool IsFavorite,
        int CardSizePercent, int TableHeightPercent);

    public record PatternCardInput(string Text, int Order, double X, double Y, double Rotation);

    public interface IPatternService
    {
        Task<PagedResult<PatternSummary>> GetPublicAsync(string? search, int page, int pageSize);
        Task<IEnumerable<PatternSummary>> GetMineAsync(int userId);
        Task<PatternDetail?> GetByIdAsync(int id, int? userId = null);
        Task<PatternSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, int userId);
        Task<PatternDetail?> UpdateAsync(int id, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, int? cardSizePercent, int? tableHeightPercent, int userId);
        Task<bool> DeleteAsync(int id, int userId);
        Task<PatternDetail?> ReplaceCardsAsync(int patternId, IEnumerable<PatternCardInput> cards, int userId);
        Task<bool> AddFavoriteAsync(int patternId, int userId);
        Task<bool> RemoveFavoriteAsync(int patternId, int userId);
    }
}
