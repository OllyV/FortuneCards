namespace FortuneCards.Server.Models
{
    public class Card
    {
        public int Id { get; set; }
        public required string Title { get; set; }
        public required string Description { get; set; }
        public required string ImageUrl { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public int DeckId { get; set; }
        // EF Core populates this navigation property at runtime; = null! suppresses the nullable warning
        public Deck Deck { get; set; } = null!;
    }
}
