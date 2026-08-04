namespace FortuneCards.Server.Models
{
    public class Pattern
    {
        public int Id { get; set; }
        public required string Name { get; set; }
        public string? Description { get; set; }
        public string Emoji { get; set; } = "🔮";
        public int ColorIndex { get; set; } = 0;
        public bool IsPublic { get; set; } = false;
        public int CardSizePercent { get; set; } = 15;
        public int TableHeightPercent { get; set; } = 60;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public int? UserId { get; set; }
        public User? User { get; set; }
        public ICollection<PatternCard> Cards { get; set; } = new List<PatternCard>();
        public ICollection<FavoritePattern> FavoritedBy { get; set; } = new List<FavoritePattern>();
    }
}
