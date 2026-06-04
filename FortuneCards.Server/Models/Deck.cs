namespace FortuneCards.Server.Models
{
    public class Deck
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string Emoji { get; set; } = "🎴";
        public int ColorIndex { get; set; } = 0;
        public string? CardBackImageUrl { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<Card> Cards { get; set; } = new List<Card>();
    }
}
