namespace FortuneCards.Server.Services
{
    public record CardDto(int Id, string Title, string Description, string ImageUrl, DateTime CreatedAt);

    public interface ICardService
    {
        Task<bool> DeleteAsync(int id);
    }
}
