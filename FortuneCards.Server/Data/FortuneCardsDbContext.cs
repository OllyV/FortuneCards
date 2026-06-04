using FortuneCards.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Data
{
    public class FortuneCardsDbContext : DbContext
    {
        public FortuneCardsDbContext(DbContextOptions<FortuneCardsDbContext> options) : base(options) { }

        public DbSet<Deck> Decks => Set<Deck>();
        public DbSet<Card> Cards => Set<Card>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Deck>(e =>
            {
                e.Property(d => d.Name).HasMaxLength(200).IsRequired();
                e.Property(d => d.Description).HasMaxLength(1000);
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
        }
    }
}
