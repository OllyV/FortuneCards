using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FortuneCards.Server.Data
{
    public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<FortuneCardsDbContext>
    {
        public FortuneCardsDbContext CreateDbContext(string[] args)
        {
            var config = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json")
                .AddJsonFile("appsettings.Development.json", optional: true)
                .Build();

            var optionsBuilder = new DbContextOptionsBuilder<FortuneCardsDbContext>();
            optionsBuilder.UseSqlServer(config.GetConnectionString("DefaultConnection"));

            return new FortuneCardsDbContext(optionsBuilder.Options);
        }
    }
}
