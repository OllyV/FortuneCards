using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;

namespace FortuneCards.Server.Tests;

/// <summary>
/// Backs a <see cref="FortuneCardsDbContext"/> with a private in-memory SQLite
/// database. The connection is held open for the harness's lifetime because an
/// in-memory SQLite database is discarded the moment its last connection closes.
/// Each instance gets its own connection, so tests are fully isolated.
/// </summary>
public sealed class TestDb : IDisposable
{
    private readonly SqliteConnection _connection;

    public FortuneCardsDbContext Db { get; }
    public IMemoryCache Cache { get; } = new MemoryCache(new MemoryCacheOptions());
    public IConfiguration Config { get; } = new ConfigurationBuilder().Build();

    public TestDb()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FortuneCardsDbContext>()
            .UseSqlite(_connection)
            .Options;

        Db = new FortuneCardsDbContext(options);
        Db.Database.EnsureCreated();
    }

    /// <summary>A fresh context over the same database — mimics a new request scope.</summary>
    public FortuneCardsDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<FortuneCardsDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FortuneCardsDbContext(options);
    }

    public DeckService NewDeckService() => new(Db, Cache, new FakeImageStorage(), Config);

    public PatternService NewPatternService() => new(Db, Cache, Config);

    public User AddUser(int id, string name = "Owner")
    {
        var user = new User
        {
            Id = id,
            GoogleId = $"google-{id}",
            Email = $"user{id}@example.com",
            DisplayName = name,
        };
        Db.Users.Add(user);
        Db.SaveChanges();
        return user;
    }

    public Deck AddDeck(int id, int? userId, bool isPublic)
    {
        var deck = new Deck { Id = id, Name = $"Deck {id}", UserId = userId, IsPublic = isPublic };
        Db.Decks.Add(deck);
        Db.SaveChanges();
        return deck;
    }

    public Pattern AddPattern(int id, int? userId, bool isPublic)
    {
        var pattern = new Pattern { Id = id, Name = $"Pattern {id}", UserId = userId, IsPublic = isPublic };
        Db.Patterns.Add(pattern);
        Db.SaveChanges();
        return pattern;
    }

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}

/// <summary>Minimal <see cref="IImageStorage"/> stand-in — DeckService only reads PublicBaseUrl in the paths under test.</summary>
internal sealed class FakeImageStorage : IImageStorage
{
    public string PublicBaseUrl => "https://images.test";
    public Task<string> SaveAsync(IFormFile file) => Task.FromResult("test-key.png");
    public Task DeleteAsync(string key) => Task.CompletedTask;
    public string? PublicUrl(string? key) => string.IsNullOrEmpty(key) ? null : $"{PublicBaseUrl}/{key}";
}
