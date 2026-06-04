using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public record DeckSummary(
        int Id, string Name, string? Description, DateTime CreatedAt, int CardCount,
        string Emoji, int ColorIndex, string? CardBackImageUrl);

    public record DeckDetail(
        int Id, string Name, string? Description, DateTime CreatedAt,
        IEnumerable<CardDto> Cards,
        string Emoji, int ColorIndex, string? CardBackImageUrl);

    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync();
        Task<DeckDetail?> GetByIdAsync(int id);
        Task<DeckSummary> CreateAsync(string name, string? description, string emoji, int colorIndex, IFormFile? cardBackImage);
        Task<bool> DeleteAsync(int id);
        Task<CardDto> AddCardAsync(int deckId, string title, string description, IFormFile image);
    }
}
