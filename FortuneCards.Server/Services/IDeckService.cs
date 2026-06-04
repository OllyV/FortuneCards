namespace FortuneCards.Server.Services
{
    public record DeckSummary(int Id, string Name, string? Description, DateTime CreatedAt, int CardCount);

    public record DeckDetail(int Id, string Name, string? Description, DateTime CreatedAt, IEnumerable<CardDto> Cards);

    public interface IDeckService
    {
        Task<IEnumerable<DeckSummary>> GetAllAsync();
        Task<DeckDetail?> GetByIdAsync(int id);
        Task<DeckSummary> CreateAsync(string name, string? description);
        Task<bool> DeleteAsync(int id);
        Task<CardDto> AddCardAsync(int deckId, string title, string description, IFormFile image);
    }
}
