using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Data
{
    public class FortuneCardsDbContext : DbContext
    {
        public FortuneCardsDbContext(DbContextOptions<FortuneCardsDbContext> options) : base(options) { }

        public DbSet<Deck> Decks => Set<Deck>();
        public DbSet<Card> Cards => Set<Card>();
        public DbSet<User> Users => Set<User>();
        public DbSet<FavoriteDeck> FavoriteDecks => Set<FavoriteDeck>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(e =>
            {
                e.Property(u => u.GoogleId).HasMaxLength(100).IsRequired();
                e.HasIndex(u => u.GoogleId).IsUnique();
                e.Property(u => u.Email).HasMaxLength(200).IsRequired();
                e.Property(u => u.DisplayName).HasMaxLength(100).IsRequired();
                e.Property(u => u.AvatarUrl).HasMaxLength(500);
                e.HasData(new User
                {
                    Id = 1,
                    GoogleId = "system",
                    Email = "system@fortunecards.app",
                    DisplayName = "FortuneCards",
                    AvatarUrl = null,
                    CreatedAt = new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc)
                });
            });

            modelBuilder.Entity<Deck>(e =>
            {
                e.Property(d => d.Name).HasMaxLength(200).IsRequired();
                e.Property(d => d.Description).HasMaxLength(1000);
                e.Property(d => d.Emoji).HasMaxLength(10).HasDefaultValue("🎴");
                e.Property(d => d.ColorIndex).HasDefaultValue(0);
                e.Property(d => d.AspectWidth).HasDefaultValue(3);
                e.Property(d => d.AspectHeight).HasDefaultValue(5);
                e.Property(d => d.CardBackImageUrl).HasMaxLength(500);
                e.Property(d => d.IsPublic).HasDefaultValue(false);
                e.HasOne(d => d.User)
                 .WithMany(u => u.Decks)
                 .HasForeignKey(d => d.UserId)
                 .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<Card>(e =>
            {
                e.Property(c => c.Title).HasMaxLength(200).IsRequired();
                e.Property(c => c.Description).HasMaxLength(2000).IsRequired();
                e.Property(c => c.ImageUrl).HasMaxLength(500).IsRequired();
                e.HasOne(c => c.Deck)
                 .WithMany(d => d.Cards)
                 .HasForeignKey(c => c.DeckId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<FavoriteDeck>(e =>
            {
                e.HasKey(f => new { f.UserId, f.DeckId });
                e.HasOne(f => f.User)
                 .WithMany(u => u.FavoriteDecks)
                 .HasForeignKey(f => f.UserId)
                 .OnDelete(DeleteBehavior.Cascade);
                e.HasOne(f => f.Deck)
                 .WithMany(d => d.FavoritedBy)
                 .HasForeignKey(f => f.DeckId)
                 .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
