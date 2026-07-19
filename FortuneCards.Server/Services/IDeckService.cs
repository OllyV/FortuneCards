using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public record DeckSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner, int AspectWidth, int AspectHeight);

    public record DeckDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<CardDto> Cards,
        string Emoji, int ColorIndex, string? CardBackImageUrl,
        bool IsPublic, bool IsOwner, int AspectWidth, int AspectHeight);

    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync(int? userId = null);
        Task<DeckDetail?> GetByIdAsync(int id, int? userId = null);
        Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, bool isPublic, IFormFile? cardBackImage, int aspectWidth, int aspectHeight, int userId);
        Task<bool> DeleteAsync(int id, int userId);
        Task<CardDto?> AddCardAsync(int deckId, string title, string description, IFormFile image, int userId);
        Task<DeckDetail?> UpdateAsync(int deckId, string? name, string? description, string? emoji, int? colorIndex, bool? isPublic, IFormFile? cardBackImage, int? aspectWidth, int? aspectHeight, int userId);
    }
}
