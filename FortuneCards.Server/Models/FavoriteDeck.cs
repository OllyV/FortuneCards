namespace FortuneCards.Server.Models
{
    public class FavoriteDeck
    {
        public int UserId { get; set; }
        public int DeckId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public User? User { get; set; }
        public Deck? Deck { get; set; }
    }
}
