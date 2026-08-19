using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Tests;

public class AuthServiceTests
{
    private const int UserId = 10;

    private static IFormFile FakePhoto(string name = "avatar.png")
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "Photo", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png",
        };
    }

    [Fact]
    public async Task Sets_trimmed_nickname()
    {
        using var h = new TestDb();
        h.AddUser(UserId, "Google Name");

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, "  Nick  ", null);

        Assert.NotNull(user);
        Assert.Equal("Nick", user!.Nickname);
        Assert.Equal("Google Name", user.DisplayName); // Google name untouched
    }

    [Fact]
    public async Task Empty_nickname_becomes_null()
    {
        using var h = new TestDb();
        h.AddUser(UserId);

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, "   ", null);

        Assert.NotNull(user);
        Assert.Null(user!.Nickname);
    }

    [Fact]
    public async Task Nickname_over_50_chars_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(UserId);
        var tooLong = new string('x', 51);

        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewAuthService().UpdateProfileAsync(UserId, tooLong, null));
    }

    [Fact]
    public async Task Nickname_of_exactly_50_chars_is_accepted()
    {
        using var h = new TestDb();
        h.AddUser(UserId);
        var maxLength = new string('x', 50);

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, maxLength, null);

        Assert.NotNull(user);
        Assert.Equal(maxLength, user!.Nickname);
    }

    [Fact]
    public async Task UpdateProfileAsync_leaves_avatar_url_untouched()
    {
        using var h = new TestDb();
        var seeded = h.AddUser(UserId);
        seeded.AvatarUrl = "https://google.example/avatar.png";
        h.Db.SaveChanges();

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, "Nick", null);

        Assert.NotNull(user);
        Assert.Equal("https://google.example/avatar.png", user!.AvatarUrl);
    }

    [Fact]
    public async Task Uploading_photo_sets_avatar_key()
    {
        using var h = new TestDb();
        h.AddUser(UserId);

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, null, FakePhoto());

        Assert.NotNull(user);
        Assert.Equal("saved-1.png", user!.AvatarImageKey);
        Assert.Equal(1, h.Images.SaveCount);
    }

    [Fact]
    public async Task Replacing_photo_deletes_old_key()
    {
        using var h = new TestDb();
        var seeded = h.AddUser(UserId);
        seeded.AvatarImageKey = "old.png";
        h.Db.SaveChanges();

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, null, FakePhoto());

        Assert.NotNull(user);
        Assert.Contains("old.png", h.Images.Deleted);
        Assert.Equal("saved-1.png", user!.AvatarImageKey);
    }

    [Fact]
    public async Task Returns_null_for_missing_user()
    {
        using var h = new TestDb();

        var user = await h.NewAuthService().UpdateProfileAsync(999, "Nick", null);

        Assert.Null(user);
    }
}
