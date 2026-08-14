using FortuneCards.Server.Services;

namespace FortuneCards.Server.Tests;

public class PatternServiceTests
{
    private const int Owner = 10;
    private const int Other = 20;

    // Standard fixture: two owned patterns (public/private) and two owner-less patterns (public/private).
    private static TestDb Seed()
    {
        var h = new TestDb();
        h.AddUser(Owner, "Owner");
        h.AddUser(Other, "Other");
        h.AddPattern(1, userId: Owner, isPublic: true);
        h.AddPattern(2, userId: Owner, isPublic: false);
        h.AddPattern(3, userId: null, isPublic: true);   // owner-less, public
        h.AddPattern(4, userId: null, isPublic: false);  // owner-less, private
        return h;
    }

    [Fact]
    public async Task Owner_sees_own_public_pattern_as_owner()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(1, Owner);
        Assert.NotNull(pattern);
        Assert.True(pattern!.IsOwner);
    }

    [Fact]
    public async Task Owner_sees_own_private_pattern_as_owner()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(2, Owner);
        Assert.NotNull(pattern);
        Assert.True(pattern!.IsOwner);
    }

    [Fact]
    public async Task Logged_in_non_owner_sees_public_pattern_but_not_as_owner()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(1, Other);
        Assert.NotNull(pattern);
        Assert.False(pattern!.IsOwner);
    }

    [Fact]
    public async Task Logged_in_non_owner_cannot_see_private_pattern()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(2, Other);
        Assert.Null(pattern);
    }

    [Fact]
    public async Task Anonymous_sees_public_pattern_but_not_as_owner()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(1, userId: null);
        Assert.NotNull(pattern);
        Assert.False(pattern!.IsOwner);
    }

    [Fact]
    public async Task Anonymous_cannot_see_private_pattern()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(2, userId: null);
        Assert.Null(pattern);
    }

    // Regression: an owner-less pattern (UserId == null) must NOT report the anonymous
    // viewer (userId == null) as its owner.
    [Fact]
    public async Task Anonymous_is_not_owner_of_ownerless_public_pattern()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(3, userId: null);
        Assert.NotNull(pattern);
        Assert.False(pattern!.IsOwner);
    }

    // Regression: an owner-less PRIVATE pattern must not leak to anonymous viewers.
    [Fact]
    public async Task Anonymous_cannot_see_ownerless_private_pattern()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(4, userId: null);
        Assert.Null(pattern);
    }

    [Fact]
    public async Task Logged_in_user_is_not_owner_of_ownerless_public_pattern()
    {
        using var h = Seed();
        var pattern = await h.NewPatternService().GetByIdAsync(3, Other);
        Assert.NotNull(pattern);
        Assert.False(pattern!.IsOwner);
    }

    [Fact]
    public async Task GetMine_returns_owned_patterns_flagged_as_owned()
    {
        using var h = Seed();
        var mine = await h.NewPatternService().GetMineAsync(Owner);
        Assert.Equal(new[] { 1, 2 }, mine.Select(p => p.Id).OrderBy(x => x));
        Assert.All(mine, p => Assert.True(p.IsOwner));
    }

    [Fact]
    public async Task GetPublic_returns_only_public_patterns()
    {
        using var h = Seed();
        var page = await h.NewPatternService().GetPublicAsync(search: null, page: 1, pageSize: 20);
        Assert.Equal(new[] { 1, 3 }, page.Items.Select(p => p.Id).OrderBy(x => x));
        Assert.All(page.Items, p => Assert.True(p.IsPublic));
    }
}
