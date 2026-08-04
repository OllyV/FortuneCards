namespace FortuneCards.Server.Models
{
    public class FavoritePattern
    {
        public int UserId { get; set; }
        public int PatternId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public User? User { get; set; }
        public Pattern? Pattern { get; set; }
    }
}
