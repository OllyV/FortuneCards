using FortuneCards.Server.Services;

namespace FortuneCards.Server.Tests;

public class DeckServiceTests
{
    private const int Owner = 10;
    private const int Other = 20;

    // Standard fixture: two owned decks (public/private) and two owner-less decks (public/private).
    private static TestDb Seed()
    {
        var h = new TestDb();
        h.AddUser(Owner, "Owner");
        h.AddUser(Other, "Other");
        h.AddDeck(1, userId: Owner, isPublic: true);
        h.AddDeck(2, userId: Owner, isPublic: false);
        h.AddDeck(3, userId: null, isPublic: true);   // owner-less, public
        h.AddDeck(4, userId: null, isPublic: false);  // owner-less, private
        return h;
    }

    [Fact]
    public async Task Owner_sees_own_public_deck_as_owner()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(1, Owner);
        Assert.NotNull(deck);
        Assert.True(deck!.IsOwner);
    }

    [Fact]
    public async Task Owner_sees_own_private_deck_as_owner()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(2, Owner);
        Assert.NotNull(deck);
        Assert.True(deck!.IsOwner);
    }

    [Fact]
    public async Task Logged_in_non_owner_sees_public_deck_but_not_as_owner()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(1, Other);
        Assert.NotNull(deck);
        Assert.False(deck!.IsOwner);
    }

    [Fact]
    public async Task Logged_in_non_owner_cannot_see_private_deck()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(2, Other);
        Assert.Null(deck);
    }

    [Fact]
    public async Task Anonymous_sees_public_deck_but_not_as_owner()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(1, userId: null);
        Assert.NotNull(deck);
        Assert.False(deck!.IsOwner);
    }

    [Fact]
    public async Task Anonymous_cannot_see_private_deck()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(2, userId: null);
        Assert.Null(deck);
    }

    // Regression: an owner-less deck (UserId == null) must NOT report the anonymous
    // viewer (userId == null) as its owner.
    [Fact]
    public async Task Anonymous_is_not_owner_of_ownerless_public_deck()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(3, userId: null);
        Assert.NotNull(deck);
        Assert.False(deck!.IsOwner);
    }

    // Regression: an owner-less PRIVATE deck must not leak to anonymous viewers.
    [Fact]
    public async Task Anonymous_cannot_see_ownerless_private_deck()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(4, userId: null);
        Assert.Null(deck);
    }

    [Fact]
    public async Task Logged_in_user_is_not_owner_of_ownerless_public_deck()
    {
        using var h = Seed();
        var deck = await h.NewDeckService().GetByIdAsync(3, Other);
        Assert.NotNull(deck);
        Assert.False(deck!.IsOwner);
    }

    [Fact]
    public async Task GetMine_returns_owned_decks_flagged_as_owned()
    {
        using var h = Seed();
        var mine = await h.NewDeckService().GetMineAsync(Owner);
        Assert.Equal(new[] { 1, 2 }, mine.Select(d => d.Id).OrderBy(x => x));
        Assert.All(mine, d => Assert.True(d.IsOwner));
    }

    [Fact]
    public async Task GetPublic_returns_only_public_decks()
    {
        using var h = Seed();
        var page = await h.NewDeckService().GetPublicAsync(search: null, page: 1, pageSize: 20);
        Assert.Equal(new[] { 1, 3 }, page.Items.Select(d => d.Id).OrderBy(x => x));
        Assert.All(page.Items, d => Assert.True(d.IsPublic));
    }
}
