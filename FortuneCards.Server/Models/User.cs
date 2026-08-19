namespace FortuneCards.Server.Models
{
    public class User
    {
        public int Id { get; set; }
        public string GoogleId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public string? Nickname { get; set; }
        public string? AvatarImageKey { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<Deck> Decks { get; set; } = [];
        public ICollection<FavoriteDeck> FavoriteDecks { get; set; } = [];
        public ICollection<Pattern> Patterns { get; set; } = [];
        public ICollection<FavoritePattern> FavoritePatterns { get; set; } = [];
    }
}
